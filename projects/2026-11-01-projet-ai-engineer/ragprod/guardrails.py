"""Security guardrails: prompt-injection quarantine and role-based access control."""

from __future__ import annotations

import re

from .text import normalize

# Patterns are matched on accent-folded, lower-cased text (French + English).
_INJECTION_PATTERNS = [
    r"\bignore[rz]?\b.{0,40}\binstructions?\b",
    r"\boublie[rz]?\b.{0,40}\b(instructions?|consignes?|regles?)\b",
    r"\bdisregard\b.{0,40}\b(instructions?|rules?)\b",
    r"\b(tu es|you are) (maintenant|desormais|now)\b",
    r"\b(system prompt|prompt systeme)\b",
    r"\breponds? (toujours |uniquement )?que\b",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS))


def is_injection(sentence: str) -> bool:
    """True if a sentence looks like an instruction aimed at the LLM, not at humans."""
    return bool(_INJECTION_RE.search(normalize(sentence)))


def allowed_levels(roles: dict[str, list[str]], role: str) -> set[str]:
    if role not in roles:
        raise ValueError(f"unknown role {role!r}; expected one of {sorted(roles)}")
    return set(roles[role])
