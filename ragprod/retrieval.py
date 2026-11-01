"""Retrieval building blocks: BM25, vector search, RRF fusion, MMR, coverage."""

from __future__ import annotations

import math
from collections import Counter

from .embeddings import Vector, cosine

Ranking = list[tuple[int, float]]  # (chunk index, score), best first


class BM25:
    """Okapi BM25 over pre-tokenised documents."""

    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75) -> None:
        self.k1, self.b = k1, b
        self.tf = [Counter(d) for d in docs]
        self.lengths = [len(d) for d in docs]
        self.avg_len = sum(self.lengths) / len(docs) if docs else 0.0
        df: Counter[str] = Counter()
        for d in docs:
            df.update(set(d))
        self.df = df
        self.n = len(docs)

    def idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        return math.log(1 + (self.n - df + 0.5) / (df + 0.5))

    def score(self, query: list[str], i: int) -> float:
        tf, length = self.tf[i], self.lengths[i]
        total = 0.0
        for term in set(query):
            f = tf.get(term, 0)
            if f:
                norm = f + self.k1 * (1 - self.b + self.b * length / self.avg_len)
                total += self.idf(term) * f * (self.k1 + 1) / norm
        return total

    def search(self, query: list[str], allowed: set[int], k: int) -> Ranking:
        scored = [(i, self.score(query, i)) for i in allowed]
        scored = [(i, s) for i, s in scored if s > 0]
        return sorted(scored, key=lambda x: (-x[1], x[0]))[:k]


def vector_search(query: Vector, vectors: list[Vector], allowed: set[int], k: int) -> Ranking:
    scored = [(i, cosine(query, vectors[i])) for i in allowed]
    scored = [(i, s) for i, s in scored if s > 0]
    return sorted(scored, key=lambda x: (-x[1], x[0]))[:k]


def reciprocal_rank_fusion(rankings: list[Ranking], k: int = 60) -> Ranking:
    """RRF: score = sum(1 / (k + rank)). Robust because it ignores raw score scales."""
    fused: dict[int, float] = {}
    for ranking in rankings:
        for rank, (i, _) in enumerate(ranking, start=1):
            fused[i] = fused.get(i, 0.0) + 1.0 / (k + rank)
    return sorted(fused.items(), key=lambda x: (-x[1], x[0]))


def mmr(ranking: Ranking, vectors: list[Vector], k: int, lam: float) -> Ranking:
    """Maximal Marginal Relevance: trade relevance for diversity among kept chunks.

    Relevance scores are min-max normalised so ``lam`` has the same meaning for
    every retrieval mode. lam=1 is pure relevance, lam=0 pure diversity.
    """
    if not ranking:
        return []
    scores = dict(ranking)
    top, bottom = ranking[0][1], ranking[-1][1]
    span = (top - bottom) or 1.0
    relevance = {i: (s - bottom) / span for i, s in ranking}
    selected: Ranking = []
    pool = [i for i, _ in ranking]
    while pool and len(selected) < k:
        def gain(i: int) -> float:
            redundancy = max((cosine(vectors[i], vectors[j]) for j, _ in selected), default=0.0)
            return lam * relevance[i] - (1 - lam) * redundancy

        best = max(pool, key=lambda i: (gain(i), -i))
        selected.append((best, scores[best]))
        pool.remove(best)
    return selected


def coverage(query: list[str], chunk_terms: set[str], bm25: BM25) -> float:
    """IDF-weighted share of query terms present in a chunk, in [0, 1].

    Unlike BM25 or RRF scores it is calibrated across queries, which makes it a
    usable abstention signal: "does any chunk talk about what was asked?".
    """
    terms = set(query)
    if not terms:
        return 0.0
    total = sum(bm25.idf(t) for t in terms)
    found = sum(bm25.idf(t) for t in terms if t in chunk_terms)
    return found / total if total else 0.0
