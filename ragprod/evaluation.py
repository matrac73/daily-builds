"""Offline evaluation on the golden set, KPI computation and feature ablation."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from .config import RAGConfig
from .guardrails import allowed_levels
from .index import Index
from .pipeline import Answer, RAGPipeline
from .text import normalize


@dataclass(frozen=True)
class EvalItem:
    id: str
    question: str
    role: str
    expected_doc: str | None
    answer_keywords: list[str]
    kind: str = "answerable"  # answerable | access_denied | out_of_scope | injection
    forbidden_keywords: tuple[str, ...] = ()


@dataclass(frozen=True)
class ItemResult:
    item: EvalItem
    answer: Answer
    rank: int | None  # 1-based rank of the expected document among retrieved docs
    correct: bool  # answered with the expected facts / abstained / resisted
    leaked: bool  # a forbidden document reached the LLM context


@dataclass(frozen=True)
class KPI:
    id: str
    name: str
    category: str
    unit: str
    direction: str  # "max" = higher is better, "min" = lower is better
    target: float
    definition: str

    def passes(self, value: float) -> bool:
        return value >= self.target if self.direction == "max" else value <= self.target


def load_eval_set(path: str | Path) -> list[EvalItem]:
    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)["items"]
    return [
        EvalItem(**{**r, "forbidden_keywords": tuple(r.get("forbidden_keywords", ()))})
        for r in raw
    ]


def load_matrix(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_kpis(matrix: dict) -> list[KPI]:
    return [KPI(**k) for k in matrix["kpis"]]


def _contains(text: str, needle: str) -> bool:
    return normalize(needle) in normalize(text)


def score_item(item: EvalItem, answer: Answer, doc_access: dict[str, str],
               roles: dict[str, list[str]]) -> ItemResult:
    docs = list(dict.fromkeys(r.chunk.doc_id for r in answer.retrieved))
    rank = docs.index(item.expected_doc) + 1 if item.expected_doc in docs else None
    if item.kind == "answerable":
        correct = not answer.abstained and all(_contains(answer.text, k) for k in item.answer_keywords)
    elif item.kind == "injection":
        correct = not any(_contains(answer.text, k) for k in item.forbidden_keywords)
    else:
        correct = answer.abstained
    levels = allowed_levels(roles, item.role)
    leaked = any(doc_access[d] not in levels for d in answer.context_doc_ids)
    return ItemResult(item, answer, rank, correct, leaked)


def percentile(values: list[float], q: float) -> float:
    """Nearest-rank percentile."""
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[max(0, math.ceil(q * len(ordered)) - 1)]


def _ratio(hits: int, total: int) -> float:
    return hits / total if total else 0.0


def compute_kpis(results: list[ItemResult]) -> dict[str, float]:
    answerable = [r for r in results if r.item.kind == "answerable"]
    refusals = [r for r in results if r.item.kind in ("access_denied", "out_of_scope")]
    injections = [r for r in results if r.item.kind == "injection"]
    answered = [r for r in results if not r.answer.abstained]
    return {
        "hit_rate": _ratio(sum(r.rank is not None for r in answerable), len(answerable)),
        "mrr": _ratio(sum(1 / r.rank for r in answerable if r.rank), len(answerable)),
        "answer_accuracy": _ratio(sum(r.correct for r in answerable), len(answerable)),
        "groundedness": _ratio(sum(r.answer.groundedness for r in answered), len(answered)),
        "citation_rate": _ratio(sum(bool(r.answer.citations) for r in answered), len(answered)),
        "correct_abstention": _ratio(sum(r.correct for r in refusals), len(refusals)),
        "false_abstention": _ratio(sum(r.answer.abstained for r in answerable), len(answerable)),
        "acl_leak": _ratio(sum(r.leaked for r in results), len(results)),
        "injection_resistance": _ratio(sum(r.correct for r in injections), len(injections)),
        "latency_p95_ms": percentile([r.answer.timings["total_ms"] for r in results], 0.95),
        "prompt_tokens_avg": _ratio(sum(r.answer.prompt_tokens for r in answered), len(answered)),
    }


def evaluate(pipeline: RAGPipeline, items: list[EvalItem]) -> list[ItemResult]:
    doc_access = {c.doc_id: c.access for c in pipeline.index.chunks}
    return [
        score_item(item, pipeline.ask(item.question, item.role), doc_access, pipeline.config.roles)
        for item in items
    ]


@dataclass(frozen=True)
class AblationRow:
    feature: str  # feature id, "" for the baseline
    label: str
    overrides: dict
    kpis: dict[str, float]


def run_ablation(config: RAGConfig, items: list[EvalItem], matrix: dict) -> list[AblationRow]:
    """Re-run the golden set with each feature switched off, one at a time."""
    variants = [("", "Configuration de référence", {})]
    for feature in matrix["features"]:
        for ablation in feature["ablations"]:
            variants.append((feature["id"], ablation["label"], ablation["overrides"]))
    rows = []
    for feature_id, label, overrides in variants:
        variant = config.with_overrides({**overrides, "trace_path": ""})
        pipeline = RAGPipeline(variant, index=Index.build(variant))
        rows.append(AblationRow(feature_id, label, overrides, compute_kpis(evaluate(pipeline, items))))
    return rows
