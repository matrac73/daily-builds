"""Minimal Slack Web API client: throttling, 429 back-off and cursor pagination.

Only the standard library is used for HTTP. The transport is injectable so the
whole client can be exercised without a network.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from typing import Any

API_URL = "https://slack.com/api/"
DEFAULT_RATE_PER_MINUTE = 50
DEFAULT_PAGE_SIZE = 200
DEFAULT_RETRY_AFTER = 30.0


class SlackError(Exception):
    """A Slack API call failed; ``code`` is Slack's machine-readable error."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


@dataclass(frozen=True)
class Response:
    status: int
    headers: Mapping[str, str]
    data: dict[str, Any]


Transport = Callable[[str, Mapping[str, Any], str], Response]


def http_transport(method: str, params: Mapping[str, Any], token: str) -> Response:
    """POST one Web API method and return the decoded response."""
    request = urllib.request.Request(
        API_URL + method,
        data=urllib.parse.urlencode(params).encode(),
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as reply:
            headers = {key.lower(): value for key, value in reply.headers.items()}
            return Response(reply.status, headers, json.load(reply))
    except urllib.error.HTTPError as exc:
        headers = {key.lower(): value for key, value in exc.headers.items()}
        return Response(exc.code, headers, {})
    except OSError as exc:
        raise SlackError("network_error", str(exc)) from exc
    except ValueError as exc:
        raise SlackError("invalid_response", str(exc)) from exc


class SlackClient:
    """Throttled access to the handful of Web API methods the archiver needs."""

    def __init__(
        self,
        token: str,
        *,
        transport: Transport = http_transport,
        rate_per_minute: float = DEFAULT_RATE_PER_MINUTE,
        page_size: int = DEFAULT_PAGE_SIZE,
        max_retries: int = 5,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if rate_per_minute <= 0:
            raise ValueError("rate_per_minute must be positive")
        if page_size < 1:
            raise ValueError("page_size must be at least 1")
        self.token = token
        self.page_size = page_size
        self.max_retries = max_retries
        self._transport = transport
        self._interval = 60.0 / rate_per_minute
        self._sleep = sleep
        self._clock = clock
        self._next_slot = 0.0

    def call(self, method: str, **params: Any) -> dict[str, Any]:
        """Call ``method``, waiting out rate limits, and return its payload."""
        params = {key: value for key, value in params.items() if value is not None}
        for _ in range(self.max_retries + 1):
            self._throttle()
            response = self._transport(method, params, self.token)
            if response.status == 429:
                self._sleep(float(response.headers.get("retry-after", DEFAULT_RETRY_AFTER)))
                continue
            if response.status != 200:
                raise SlackError("http_error", f"HTTP {response.status} from {method}")
            if not response.data.get("ok"):
                raise SlackError(response.data.get("error", "unknown_error"))
            return response.data
        raise SlackError("ratelimited", f"{method} still rate limited after {self.max_retries} retries")

    def paginate(self, method: str, **params: Any) -> Iterator[dict[str, Any]]:
        """Yield every page of a cursor-paginated method."""
        cursor = None
        while True:
            page = self.call(method, cursor=cursor, **params)
            yield page
            cursor = page.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                return

    def auth_test(self) -> dict[str, Any]:
        return self.call("auth.test")

    def user_info(self, user_id: str) -> dict[str, Any]:
        return self.call("users.info", user=user_id)["user"]

    def list_channels(self) -> Iterator[dict[str, Any]]:
        pages = self.paginate(
            "conversations.list", types="public_channel,private_channel", limit=self.page_size
        )
        for page in pages:
            yield from page["channels"]

    def list_users(self) -> Iterator[dict[str, Any]]:
        for page in self.paginate("users.list", limit=self.page_size):
            yield from page["members"]

    def history(self, channel_id: str, oldest: str | None = None) -> Iterator[list[dict[str, Any]]]:
        """Yield pages of messages strictly newer than ``oldest``, newest page first."""
        pages = self.paginate(
            "conversations.history", channel=channel_id, oldest=oldest, limit=self.page_size
        )
        for page in pages:
            yield page["messages"]

    def _throttle(self) -> None:
        now = self._clock()
        start = max(now, self._next_slot)
        if start > now:
            self._sleep(start - now)
        self._next_slot = start + self._interval
