"""Text utilities shared by every stage: normalisation, tokenisation, sentence split.

The corpus is French, so tokenisation folds accents, splits elisions (l'heure ->
heure), drops French stop-words and applies a very light plural stemmer. Keeping
this deterministic and dependency-free makes retrieval scores reproducible.
"""

from __future__ import annotations

import math
import re
import unicodedata

STOPWORDS = frozenset(
    """
    a ai as au aux avec avez avons apres avant c ca car ce ces cet cette chaque
    combien comme comment d dans de des depuis doit dois donc du elle elles en
    entre est et etre faire fait faut il ils j je l la le les leur leurs lors m
    ma mais me mes moi mon n ne nos notre nous on ont ou par pas peut peuvent
    plus pour pourquoi qu quand que quel quelle quelles quels qui quoi s sa sans
    se ses si son sont sur t ta te tes ton tous tout toute toutes tu un une vos
    votre vous y the of to and is what how
    """.split()
)

_WORD_RE = re.compile(r"[a-z0-9]+")
_SENTENCE_RE = re.compile(r"(?<=[.!?…])\s+|\n+")
_SUFFIXES = ("ements", "ations", "ement", "ation", "euses", "ions", "euse", "eurs",
             "ees", "ion", "eur", "ee", "es", "er", "ez", "e", "s", "x")
TOKENS_PER_WORD = 1.3  # rough average for French text with Llama/Qwen tokenizers


def normalize(text: str) -> str:
    """Lower-case and strip accents: 'Télétravail' -> 'teletravail'."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def stem(word: str) -> str:
    """Light French suffix stripper: 'inspection'/'inspectés' -> 'inspect'.

    Strips at most one common inflectional/derivational suffix and keeps a stem of
    at least four letters, which merges plural, gender and noun/participle forms
    without the over-stemming of a full Snowball stemmer.
    """
    if word.isdigit():
        return word
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def tokenize(text: str) -> list[str]:
    """Content tokens used by every lexical component (BM25, coverage, grounding)."""
    tokens = []
    for word in _WORD_RE.findall(normalize(text)):
        if word in STOPWORDS or (len(word) < 2 and not word.isdigit()):
            continue
        tokens.append(stem(word))
    return tokens


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_RE.split(text) if s and s.strip()]


def estimate_tokens(text: str) -> int:
    """Cheap LLM-token estimate, good enough for budgeting and cost KPIs."""
    return math.ceil(len(text.split()) * TOKENS_PER_WORD)
