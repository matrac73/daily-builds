"""Minimal JSON-over-HTTP client (stdlib only) for OpenAI-compatible servers.

Ollama, llama.cpp ``llama-server`` and vLLM all expose ``/v1/chat/completions``
and ``/v1/embeddings``, so one client covers laptop demos and GPU production.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request


class BackendError(RuntimeError):
    """Raised when the model server is unreachable or answers with an error."""


def post_json(url: str, payload: dict, timeout: float) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise BackendError(f"{url}: {exc}") from exc
