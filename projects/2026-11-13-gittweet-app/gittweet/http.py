"""Minimal JSON-over-HTTP helper built on the standard library.

Both API clients receive a ``send`` callable with this module's signature, so
tests can swap the network for an in-memory fake.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional

from .errors import ApiError

TIMEOUT_SECONDS = 20


@dataclass(frozen=True)
class Response:
    status: int
    headers: Mapping[str, str]  # keys are lower-cased
    data: Any  # decoded JSON body, or None when the body is empty / not JSON


Send = Callable[[str, str, Mapping[str, str], Optional[bytes]], Response]


def send(method: str, url: str, headers: Mapping[str, str], body: bytes | None = None) -> Response:
    """Perform an HTTP request and decode the JSON reply.

    HTTP error statuses are returned as responses (callers know how to explain
    them); only transport failures raise ``ApiError``.
    """
    request = urllib.request.Request(url, data=body, method=method, headers=dict(headers))
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as reply:
            return _response(reply.status, reply.headers, reply.read())
    except urllib.error.HTTPError as error:
        return _response(error.code, error.headers, error.read())
    except (urllib.error.URLError, TimeoutError) as error:
        reason = getattr(error, "reason", error)
        raise ApiError(f"Network error while calling {url}: {reason}") from error


def _response(status: int, headers: Mapping[str, str], body: bytes) -> Response:
    try:
        data = json.loads(body) if body else None
    except ValueError:
        data = None
    return Response(status, {key.lower(): value for key, value in headers.items()}, data)
