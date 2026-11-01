"""Ingestion: corpus -> sanitised chunks -> lexical + vector index, persisted to JSON."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from .chunking import Chunk, Quarantined, build_chunks
from .config import RAGConfig
from .corpus import load_corpus
from .embeddings import Encoder, HashingEncoder, RemoteEncoder, Vector
from .retrieval import BM25
from .text import tokenize


def index_fingerprint(config: RAGConfig) -> str:
    """Index settings + corpus content hash: any change invalidates the saved index."""
    corpus_hash = hashlib.sha256(Path(config.corpus_path).read_bytes()).hexdigest()
    return f"{config.fingerprint()}|{corpus_hash}"


def make_encoder(config: RAGConfig) -> Encoder:
    if config.embedding_backend == "hashing":
        return HashingEncoder()
    if config.embedding_backend == "openai-compatible":
        return RemoteEncoder(config.llm_url, config.embedding_model, config.llm_timeout)
    raise ValueError(f"unknown embedding_backend: {config.embedding_backend}")


@dataclass
class Index:
    chunks: list[Chunk]
    quarantined: list[Quarantined]
    vectors: list[Vector]
    encoder: Encoder
    fingerprint: str

    def __post_init__(self) -> None:
        tokens = [tokenize(c.index_text) for c in self.chunks]
        self.bm25 = BM25(tokens)
        self.terms = [set(t) for t in tokens]

    @classmethod
    def build(cls, config: RAGConfig) -> Index:
        documents = load_corpus(config.corpus_path)
        chunks, quarantined = build_chunks(
            documents, config.chunk_size, config.chunk_overlap, config.sanitize
        )
        texts = [c.index_text for c in chunks]
        encoder = make_encoder(config)
        encoder.fit(texts)
        return cls(chunks, quarantined, encoder.encode(texts), encoder, index_fingerprint(config))

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "fingerprint": self.fingerprint,
            "chunks": [asdict(c) for c in self.chunks],
            "quarantined": [asdict(q) for q in self.quarantined],
            "vectors": [[round(x, 5) for x in v] for v in self.vectors],
        }
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path, config: RAGConfig) -> Index | None:
        """Load a persisted index, or None if missing or built with other settings."""
        path = Path(path)
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("fingerprint") != index_fingerprint(config):
            return None
        chunks = [Chunk(**c) for c in payload["chunks"]]
        encoder = make_encoder(config)
        encoder.fit([c.index_text for c in chunks])  # deterministic; no-op for remote models
        return cls(
            chunks,
            [Quarantined(**q) for q in payload["quarantined"]],
            payload["vectors"],
            encoder,
            payload["fingerprint"],
        )


def load_or_build(config: RAGConfig) -> Index:
    index = Index.load(config.index_path, config)
    if index is None:
        index = Index.build(config)
        index.save(config.index_path)
    return index
