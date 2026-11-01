from pathlib import Path

import pytest

from ragprod.config import RAGConfig
from ragprod.index import Index
from ragprod.pipeline import RAGPipeline

ROOT = Path(__file__).resolve().parent.parent
CORPUS = str(ROOT / "data" / "corpus.json")
EVAL_SET = str(ROOT / "data" / "eval_set.json")
MATRIX = str(ROOT / "data" / "kpi_matrix.json")


@pytest.fixture
def config(tmp_path) -> RAGConfig:
    return RAGConfig(corpus_path=CORPUS, index_path=str(tmp_path / "index.json"))


@pytest.fixture(scope="session")
def shared_index() -> Index:
    return Index.build(RAGConfig(corpus_path=CORPUS))


@pytest.fixture
def pipeline(config, shared_index) -> RAGPipeline:
    return RAGPipeline(config, index=shared_index)
