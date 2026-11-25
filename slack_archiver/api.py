"""Read-only JSON API over the archive database (standard library only)."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .store import Store, UnknownChannelError

DEFAULT_LIMIT = 100
MAX_LIMIT = 1000

ENDPOINTS = {
    "/channels": "archived channels with message counts",
    "/channels/{name-or-id}/messages": "messages, oldest first (after, before, q, limit)",
    "/search?q=": "search every channel, newest first (limit)",
}


class NotFound(LookupError):
    pass


def route(store: Store, path: str, query: dict[str, str]) -> Any:
    """Resolve a GET request to its JSON-serialisable payload."""
    parts = [unquote(part) for part in path.split("/") if part]
    if not parts:
        return {"service": "slack-archiver", "endpoints": ENDPOINTS}
    if parts == ["channels"]:
        return {"channels": store.channels()}
    if len(parts) == 3 and parts[0] == "channels" and parts[2] == "messages":
        channel = store.get_channel(parts[1])
        messages = store.messages(
            channel["id"],
            after=query.get("after"),
            before=query.get("before"),
            query=query.get("q"),
            limit=_limit(query),
        )
        return {"channel": channel["name"], "count": len(messages), "messages": messages}
    if parts == ["search"]:
        if not query.get("q"):
            raise ValueError("missing required parameter: q")
        messages = store.messages(query=query["q"], limit=_limit(query), newest_first=True)
        return {"query": query["q"], "count": len(messages), "messages": messages}
    raise NotFound(f"no such endpoint: {path}")


def _limit(query: dict[str, str]) -> int:
    try:
        limit = int(query.get("limit", DEFAULT_LIMIT))
    except ValueError:
        raise ValueError("limit must be an integer") from None
    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")
    return limit


def make_server(db_path: str | Path, host: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    """Build the API server; each request opens its own database connection."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            url = urlsplit(self.path)
            query = {key: values[-1] for key, values in parse_qs(url.query).items()}
            store = Store(db_path)
            try:
                status, payload = 200, route(store, url.path, query)
            except (UnknownChannelError, NotFound) as exc:
                status, payload = 404, {"error": str(exc)}
            except ValueError as exc:
                status, payload = 400, {"error": str(exc)}
            finally:
                store.close()
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: Any) -> None:
            pass

    return ThreadingHTTPServer((host, port), Handler)
