"""Document model and corpus loading (the fake document database)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    category: str
    access: str  # access level checked against the user's role (ACL)
    updated: str
    content: str


def load_corpus(path: str | Path) -> list[Document]:
    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)
    documents = [Document(**doc) for doc in raw["documents"]]
    ids = [d.id for d in documents]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate document ids in corpus")
    return documents
