"""Pipeline configuration.

Every RAG feature described in docs/CDC.md maps to one field here, so a feature can
be switched off with ``--set field=value`` and its KPI impact measured by
``ragprod ablation``.
"""

from __future__ import annotations

import json
import tomllib
from dataclasses import asdict, dataclass, field, fields, replace
from pathlib import Path

DEFAULT_ROLES = {
    "public": ["public"],
    "employee": ["public", "internal"],
    "hr": ["public", "internal", "hr"],
    "finance": ["public", "internal", "finance"],
}


@dataclass(frozen=True)
class RAGConfig:
    # Ingestion
    corpus_path: str = "data/corpus.json"
    chunk_size: int = 60  # words per chunk
    chunk_overlap: int = 15  # words repeated between consecutive chunks
    sanitize: bool = True  # quarantine prompt-injection sentences at ingestion
    # Retrieval
    retrieval_mode: str = "hybrid"  # bm25 | vector | hybrid
    embedding_backend: str = "hashing"  # hashing (offline) | openai-compatible
    embedding_model: str = "bge-m3"
    candidates: int = 12  # first-stage candidates per retriever
    top_k: int = 4  # chunks kept after reranking
    mmr: bool = True  # Maximal Marginal Relevance diversity reranking
    mmr_lambda: float = 0.7
    acl: bool = True  # filter chunks by the user's role before ranking
    roles: dict[str, list[str]] = field(default_factory=lambda: dict(DEFAULT_ROLES))
    # Answering
    abstain_threshold: float = 0.4  # min query coverage of the best chunk
    max_context_tokens: int = 450
    llm_backend: str = "extractive"  # extractive (offline) | openai-compatible
    llm_url: str = "http://localhost:11434/v1"
    llm_model: str = "qwen2.5:3b"
    llm_temperature: float = 0.1
    llm_timeout: float = 60.0
    grounding_check: bool = True  # refuse answers not supported by the context
    grounding_min: float = 0.6
    # Operations
    cache: bool = True
    cache_size: int = 256
    trace_path: str = ""  # JSONL trace file, empty = disabled
    index_path: str = "runs/index.json"

    def __post_init__(self) -> None:
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be smaller than chunk_size")
        if self.retrieval_mode not in {"bm25", "vector", "hybrid"}:
            raise ValueError(f"unknown retrieval_mode: {self.retrieval_mode}")
        if self.top_k < 1 or self.candidates < self.top_k:
            raise ValueError("need 1 <= top_k <= candidates")
        if not 0.0 <= self.mmr_lambda <= 1.0:
            raise ValueError("mmr_lambda must be in [0, 1]")

    def with_overrides(self, overrides: dict[str, object]) -> RAGConfig:
        return replace(self, **overrides)

    def fingerprint(self) -> str:
        """Settings that change the index; used to invalidate a stale index file."""
        keys = ("corpus_path", "chunk_size", "chunk_overlap", "sanitize",
                "embedding_backend", "embedding_model")
        return json.dumps({k: asdict(self)[k] for k in keys}, sort_keys=True)


def _coerce(name: str, raw: str) -> object:
    """Convert a ``--set key=value`` string to the type of the config field."""
    types = {f.name: f.type for f in fields(RAGConfig)}
    if name not in types:
        raise ValueError(f"unknown config key: {name}")
    kind = types[name]
    if kind == "bool":
        if raw.lower() not in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
            raise ValueError(f"{name} expects a boolean, got {raw!r}")
        return raw.lower() in {"true", "1", "yes", "on"}
    if kind == "int":
        return int(raw)
    if kind == "float":
        return float(raw)
    if kind == "str":
        return raw
    raise ValueError(f"{name} cannot be set from the command line")


def parse_overrides(pairs: list[str]) -> dict[str, object]:
    overrides = {}
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if not sep:
            raise ValueError(f"expected key=value, got {pair!r}")
        overrides[key.strip()] = _coerce(key.strip(), value.strip())
    return overrides


def load_config(path: str | Path | None = None, overrides: list[str] | None = None) -> RAGConfig:
    values: dict[str, object] = {}
    if path:
        with open(path, "rb") as fh:
            values.update(tomllib.load(fh))
    config = RAGConfig(**values)
    if overrides:
        config = config.with_overrides(parse_overrides(overrides))
    return config
