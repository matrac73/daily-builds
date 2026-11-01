"""Text encoders for the vector retriever.

* ``HashingEncoder`` (default, offline): TF-IDF over character 3-grams hashed into
  a fixed-size vector. It captures morphology ("télétravail" ~ "télétravailler")
  and typos that BM25 misses, with zero download.
* ``RemoteEncoder``: any OpenAI-compatible ``/embeddings`` endpoint serving an open
  source model such as ``bge-m3`` or ``nomic-embed-text`` (true semantic vectors).
"""

from __future__ import annotations

import math
import zlib
from typing import Protocol

from .text import normalize, tokenize
from .transport import post_json

Vector = list[float]


class Encoder(Protocol):
    def fit(self, texts: list[str]) -> None: ...
    def encode(self, texts: list[str]) -> list[Vector]: ...


def l2_normalize(vector: Vector) -> Vector:
    norm = math.sqrt(sum(x * x for x in vector))
    return [x / norm for x in vector] if norm else vector


def cosine(a: Vector, b: Vector) -> float:
    """Dot product; every encoder returns L2-normalised vectors."""
    return sum(x * y for x, y in zip(a, b))


class HashingEncoder:
    def __init__(self, dims: int = 1024, n: int = 3) -> None:
        self.dims = dims
        self.n = n
        self.idf = [1.0] * dims

    def _features(self, text: str) -> dict[int, int]:
        counts: dict[int, int] = {}
        for word in tokenize(text):
            padded = f"#{normalize(word)}#"
            for i in range(max(1, len(padded) - self.n + 1)):
                slot = zlib.crc32(padded[i : i + self.n].encode()) % self.dims
                counts[slot] = counts.get(slot, 0) + 1
        return counts

    def fit(self, texts: list[str]) -> None:
        df = [0] * self.dims
        for text in texts:
            for slot in self._features(text):
                df[slot] += 1
        total = len(texts)
        self.idf = [math.log((1 + total) / (1 + d)) + 1 for d in df]

    def encode(self, texts: list[str]) -> list[Vector]:
        vectors = []
        for text in texts:
            vector = [0.0] * self.dims
            for slot, count in self._features(text).items():
                vector[slot] = (1 + math.log(count)) * self.idf[slot]
            vectors.append(l2_normalize(vector))
        return vectors


class RemoteEncoder:
    def __init__(self, base_url: str, model: str, timeout: float) -> None:
        self.url = base_url.rstrip("/") + "/embeddings"
        self.model = model
        self.timeout = timeout

    def fit(self, texts: list[str]) -> None:
        """Pre-trained model: nothing to fit."""

    def encode(self, texts: list[str]) -> list[Vector]:
        response = post_json(self.url, {"model": self.model, "input": texts}, self.timeout)
        rows = sorted(response["data"], key=lambda row: row["index"])
        return [l2_normalize(row["embedding"]) for row in rows]
