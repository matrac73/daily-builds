"""The RAG pipeline: cache -> ACL -> retrieve -> rerank -> gate -> generate -> verify."""

from __future__ import annotations

import json
import re
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path

from .chunking import Chunk
from .config import RAGConfig
from .guardrails import allowed_levels
from .index import Index, load_or_build
from .llm import (
    ABSTAIN_MESSAGE,
    Context,
    ExtractiveGenerator,
    FallbackGenerator,
    Generator,
    OpenAICompatibleGenerator,
)
from .retrieval import coverage, mmr, reciprocal_rank_fusion, vector_search
from .text import estimate_tokens, normalize, tokenize

_CITATION_RE = re.compile(r"\[(\d+)\]")
# Split answers into claims, keeping each "[n]" with the sentence it follows.
_CLAIM_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+(?!\[)|(?<=\])\s+")


@dataclass(frozen=True)
class Retrieved:
    chunk: Chunk
    score: float
    coverage: float


@dataclass(frozen=True)
class Citation:
    n: int
    doc_id: str
    title: str
    chunk_id: str


@dataclass(frozen=True)
class Answer:
    question: str
    role: str
    text: str
    abstained: bool
    reason: str  # why the pipeline abstained ("" when it answered)
    citations: list[Citation]
    retrieved: list[Retrieved]
    context_chunk_ids: list[str]  # chunks actually sent to the generator
    groundedness: float
    prompt_tokens: int
    completion_tokens: int
    backend: str
    degraded: bool = False
    cached: bool = False
    timings: dict[str, float] = field(default_factory=dict)

    @property
    def context_doc_ids(self) -> list[str]:
        return [chunk_id.split("#")[0] for chunk_id in self.context_chunk_ids]


def make_generator(config: RAGConfig) -> Generator:
    if config.llm_backend == "extractive":
        return ExtractiveGenerator()
    if config.llm_backend == "openai-compatible":
        llm = OpenAICompatibleGenerator(
            config.llm_url, config.llm_model, config.llm_temperature, config.llm_timeout
        )
        return FallbackGenerator(llm, ExtractiveGenerator())
    raise ValueError(f"unknown llm_backend: {config.llm_backend}")


def groundedness(text: str, contexts: Context, min_overlap: float = 0.5) -> float:
    """Share of answer sentences whose content words appear in the context they cite.

    A sentence without a valid citation is checked against the whole context. This
    lexical check is a cheap stand-in for an NLI/LLM judge and catches answers that
    bring facts (numbers, names) absent from the retrieved extracts.
    """
    pools = {n: set(tokenize(c.index_text)) for n, c in contexts}
    everything = set().union(*pools.values()) if pools else set()
    checked = supported = 0
    for sentence in _CLAIM_SPLIT_RE.split(text):
        cited = [int(n) for n in _CITATION_RE.findall(sentence) if int(n) in pools]
        terms = set(tokenize(_CITATION_RE.sub("", sentence)))
        if not terms:
            continue
        pool = set().union(*(pools[n] for n in cited)) if cited else everything
        checked += 1
        supported += len(terms & pool) / len(terms) >= min_overlap
    return supported / checked if checked else 1.0


def is_abstention(text: str) -> bool:
    folded = normalize(text)
    return normalize(ABSTAIN_MESSAGE[:34]) in folded or "je ne sais pas" in folded


class RAGPipeline:
    def __init__(self, config: RAGConfig, index: Index | None = None,
                 generator: Generator | None = None) -> None:
        self.config = config
        self.index = index or load_or_build(config)
        self.generator = generator or make_generator(config)
        self._cache: OrderedDict[tuple[str, str], Answer] = OrderedDict()

    # -- stages -----------------------------------------------------------------
    def allowed_chunks(self, role: str) -> set[int]:
        if not self.config.acl:
            allowed_levels(self.config.roles, role)  # still reject unknown roles
            return set(range(len(self.index.chunks)))
        levels = allowed_levels(self.config.roles, role)
        return {i for i, c in enumerate(self.index.chunks) if c.access in levels}

    def retrieve(self, question: str, role: str) -> list[Retrieved]:
        cfg, index = self.config, self.index
        allowed = self.allowed_chunks(role)
        query = tokenize(question)
        rankings = []
        if cfg.retrieval_mode in ("bm25", "hybrid"):
            rankings.append(index.bm25.search(query, allowed, cfg.candidates))
        if cfg.retrieval_mode in ("vector", "hybrid"):
            query_vector = index.encoder.encode([question])[0]
            rankings.append(vector_search(query_vector, index.vectors, allowed, cfg.candidates))
        fused = rankings[0] if len(rankings) == 1 else reciprocal_rank_fusion(rankings)
        fused = fused[: cfg.candidates]
        if cfg.mmr:
            selected = mmr(fused, index.vectors, cfg.top_k, cfg.mmr_lambda)
        else:
            selected = fused[: cfg.top_k]
        return [
            Retrieved(index.chunks[i], score, coverage(query, index.terms[i], index.bm25))
            for i, score in selected
        ]

    def build_context(self, retrieved: list[Retrieved]) -> Context:
        """Keep chunks in rank order until the token budget is spent (first one always).

        Chunks sharing no term with the question (kept by MMR for diversity or by the
        vector search for a loose resemblance) are dropped: they cost tokens and
        give the LLM material to drift on.
        """
        relevant = [r for r in retrieved if r.coverage > 0] or retrieved[:1]
        contexts: Context = []
        used = 0
        for r in relevant:
            cost = estimate_tokens(r.chunk.text)
            if contexts and used + cost > self.config.max_context_tokens:
                break
            contexts.append((len(contexts) + 1, r.chunk))
            used += cost
        return contexts

    # -- orchestration ----------------------------------------------------------
    def ask(self, question: str, role: str = "employee") -> Answer:
        key = (role, " ".join(tokenize(question)))
        if self.config.cache and key in self._cache:
            self._cache.move_to_end(key)
            answer = replace(self._cache[key], cached=True, timings={"total_ms": 0.0})
            self._trace(answer)
            return answer

        start = time.perf_counter()
        retrieved = self.retrieve(question, role)
        retrieval_ms = (time.perf_counter() - start) * 1000
        best = max((r.coverage for r in retrieved), default=0.0)

        def abstain(reason: str) -> Answer:
            return Answer(question, role, ABSTAIN_MESSAGE, True, reason, [], retrieved,
                          [], 0.0, 0, 0, "none")

        if not retrieved:
            answer = abstain("no_accessible_chunk")
        elif best < self.config.abstain_threshold:
            answer = abstain("low_relevance")
        else:
            contexts = self.build_context(retrieved)
            gen_start = time.perf_counter()
            generation = self.generator.generate(question, contexts)
            generation_ms = (time.perf_counter() - gen_start) * 1000
            by_number = {n: c for n, c in contexts}
            numbers = dict.fromkeys(int(n) for n in _CITATION_RE.findall(generation.text))
            citations = [
                Citation(n, by_number[n].doc_id, by_number[n].title, by_number[n].id)
                for n in numbers if n in by_number
            ]
            grounded = groundedness(generation.text, contexts)
            reason = ""
            if is_abstention(generation.text):
                reason = "model_abstained"
            elif self.config.grounding_check and grounded < self.config.grounding_min:
                reason = "ungrounded"
            answer = Answer(
                question, role,
                ABSTAIN_MESSAGE if reason else generation.text,
                bool(reason), reason,
                [] if reason else citations,
                retrieved,
                [c.id for _, c in contexts],
                grounded,
                generation.prompt_tokens,
                generation.completion_tokens,
                generation.backend,
                generation.degraded,
                timings={"generation_ms": round(generation_ms, 2)},
            )
        timings = {"retrieval_ms": round(retrieval_ms, 2), **answer.timings,
                   "total_ms": round((time.perf_counter() - start) * 1000, 2)}
        answer = replace(answer, timings=timings)
        if self.config.cache:
            self._cache[key] = answer
            if len(self._cache) > self.config.cache_size:
                self._cache.popitem(last=False)
        self._trace(answer)
        return answer

    def _trace(self, answer: Answer) -> None:
        """Append one JSON line per request: the observability backbone of the KPIs."""
        if not self.config.trace_path:
            return
        record = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "question": answer.question,
            "role": answer.role,
            "abstained": answer.abstained,
            "reason": answer.reason,
            "sources": [c.doc_id for c in answer.citations],
            "retrieved": [(r.chunk.id, round(r.score, 4)) for r in answer.retrieved],
            "groundedness": round(answer.groundedness, 3),
            "prompt_tokens": answer.prompt_tokens,
            "completion_tokens": answer.completion_tokens,
            "backend": answer.backend,
            "degraded": answer.degraded,
            "cached": answer.cached,
            "timings": answer.timings,
        }
        path = Path(self.config.trace_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def answer_to_dict(answer: Answer) -> dict:
    data = asdict(answer)
    data["retrieved"] = [
        {"chunk_id": r.chunk.id, "doc_id": r.chunk.doc_id, "score": r.score, "coverage": r.coverage}
        for r in answer.retrieved
    ]
    return data
