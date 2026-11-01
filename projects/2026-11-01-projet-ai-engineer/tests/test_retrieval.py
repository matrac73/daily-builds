import pytest

from ragprod.embeddings import HashingEncoder, cosine
from ragprod.retrieval import BM25, coverage, mmr, reciprocal_rank_fusion, vector_search
from ragprod.text import tokenize

DOCS = [
    "Le télétravail est autorisé trois jours par semaine.",
    "Les notes de frais sont remboursées sous trente jours.",
    "Le vélo électrique a une autonomie de 80 kilomètres.",
]


@pytest.fixture
def bm25():
    return BM25([tokenize(d) for d in DOCS])


def test_bm25_ranks_matching_document_first(bm25):
    ranking = bm25.search(tokenize("autonomie du vélo"), {0, 1, 2}, k=3)
    assert ranking[0][0] == 2
    assert all(score > 0 for _, score in ranking)


def test_bm25_respects_allowed_set(bm25):
    assert bm25.search(tokenize("autonomie du vélo"), {0, 1}, k=3) == []


def test_bm25_idf_favours_rare_terms(bm25):
    assert bm25.idf("autonomi") > bm25.idf("jour")


def test_hashing_encoder_is_normalised_and_typo_tolerant():
    encoder = HashingEncoder()
    encoder.fit(DOCS)
    vectors = encoder.encode(DOCS)
    assert cosine(vectors[0], vectors[0]) == pytest.approx(1.0)
    query = encoder.encode(["teletravial semaine"])[0]  # typo on purpose
    ranking = vector_search(query, vectors, {0, 1, 2}, k=3)
    assert ranking[0][0] == 0


def test_rrf_rewards_agreement():
    fused = reciprocal_rank_fusion([[(1, 9.0), (2, 5.0)], [(2, 0.9), (3, 0.8)]])
    assert fused[0][0] == 2  # ranked by both retrievers
    assert {i for i, _ in fused} == {1, 2, 3}


def test_mmr_prefers_diversity_over_duplicates():
    vectors = [[1.0, 0.0], [1.0, 0.0], [0.0, 1.0]]
    ranking = [(0, 1.0), (1, 0.95), (2, 0.5)]
    assert [i for i, _ in mmr(ranking, vectors, k=2, lam=0.5)] == [0, 2]
    assert [i for i, _ in mmr(ranking, vectors, k=2, lam=1.0)] == [0, 1]
    assert mmr([], vectors, k=2, lam=0.5) == []


def test_coverage_is_idf_weighted(bm25):
    query = tokenize("autonomie du vélo en jours")
    full = coverage(query, set(tokenize(DOCS[2])), bm25)
    partial = coverage(query, set(tokenize(DOCS[0])), bm25)
    assert 0 < partial < full < 1
    assert coverage([], set(), bm25) == 0.0
