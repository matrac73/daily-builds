"""Sentence-aware chunking with word overlap and injection quarantine."""

from __future__ import annotations

from dataclasses import dataclass

from .corpus import Document
from .guardrails import is_injection
from .text import split_sentences


@dataclass(frozen=True)
class Chunk:
    id: str  # "<doc_id>#<n>"
    doc_id: str
    title: str
    access: str
    text: str

    @property
    def index_text(self) -> str:
        """Text that is indexed: the title is prepended so every chunk keeps its topic."""
        return f"{self.title}. {self.text}"


@dataclass(frozen=True)
class Quarantined:
    doc_id: str
    sentence: str


def chunk_document(doc: Document, size: int, overlap: int) -> list[str]:
    """Pack whole sentences into chunks of ~``size`` words.

    Consecutive chunks share trailing sentences worth at least ``overlap`` words so
    that a fact straddling a boundary is still retrievable in one piece. A sentence
    longer than ``size`` becomes its own chunk (never cut mid-sentence).
    """
    def words(sentences: list[str]) -> int:
        return sum(len(s.split()) for s in sentences)

    chunks: list[str] = []
    current: list[str] = []
    for sentence in split_sentences(doc.content):
        length = len(sentence.split())
        if current and words(current) + length > size:
            chunks.append(" ".join(current))
            carried: list[str] = []
            for previous in reversed(current):
                if words(carried) >= overlap:
                    break
                carried.insert(0, previous)
            # drop carried sentences that would push the next chunk over budget
            while carried and words(carried) + length > size:
                carried.pop(0)
            current = carried
        current.append(sentence)
    if current:
        chunks.append(" ".join(current))
    return chunks


def build_chunks(
    documents: list[Document], size: int, overlap: int, sanitize: bool
) -> tuple[list[Chunk], list[Quarantined]]:
    chunks: list[Chunk] = []
    quarantined: list[Quarantined] = []
    for doc in documents:
        if sanitize:
            kept = []
            for sentence in split_sentences(doc.content):
                if is_injection(sentence):
                    quarantined.append(Quarantined(doc.id, sentence))
                else:
                    kept.append(sentence)
            doc = Document(**{**doc.__dict__, "content": "\n".join(kept)})
        for n, text in enumerate(chunk_document(doc, size, overlap)):
            chunks.append(Chunk(f"{doc.id}#{n}", doc.id, doc.title, doc.access, text))
    return chunks, quarantined
