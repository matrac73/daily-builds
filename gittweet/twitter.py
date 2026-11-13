"""Tweet posting through the X/Twitter API v2, signed with OAuth 1.0a."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Callable, Mapping
from urllib.parse import quote

from . import http
from .errors import ApiError, ConfigError

TWEETS_URL = "https://api.x.com/2/tweets"
ENV_VARS = (
    "TWITTER_API_KEY",
    "TWITTER_API_SECRET",
    "TWITTER_ACCESS_TOKEN",
    "TWITTER_ACCESS_SECRET",
)


@dataclass(frozen=True)
class Credentials:
    api_key: str
    api_secret: str
    access_token: str
    access_secret: str

    @classmethod
    def from_env(cls, environ: Mapping[str, str]) -> "Credentials | None":
        """Read the four OAuth values; ``None`` when none of them is set."""
        values = [environ.get(name, "").strip() for name in ENV_VARS]
        if not any(values):
            return None
        missing = [name for name, value in zip(ENV_VARS, values) if not value]
        if missing:
            raise ConfigError(f"Incomplete Twitter credentials, missing: {', '.join(missing)}.")
        return cls(*values)


def _percent_encode(value: object) -> str:
    return quote(str(value), safe="-._~")


def oauth1_signature(
    method: str,
    url: str,
    params: Mapping[str, str],
    consumer_secret: str,
    token_secret: str,
) -> str:
    """HMAC-SHA1 signature of a request, as specified by RFC 5849 section 3.4."""
    pairs = sorted((_percent_encode(key), _percent_encode(value)) for key, value in params.items())
    parameter_string = "&".join(f"{key}={value}" for key, value in pairs)
    base_string = "&".join(
        [method.upper(), _percent_encode(url), _percent_encode(parameter_string)]
    )
    signing_key = f"{_percent_encode(consumer_secret)}&{_percent_encode(token_secret)}"
    digest = hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


class TwitterPoster:
    """Posts tweets from the account that owns the access token."""

    dry_run = False

    def __init__(
        self,
        credentials: Credentials,
        send: http.Send = http.send,
        clock: Callable[[], float] = time.time,
        nonce: Callable[[], str] = lambda: secrets.token_hex(16),
    ) -> None:
        self._credentials = credentials
        self._send = send
        self._clock = clock
        self._nonce = nonce

    def post(self, text: str) -> str:
        """Send one tweet and return its public URL."""
        headers = {
            "Authorization": self._authorization("POST", TWEETS_URL),
            "Content-Type": "application/json",
            "User-Agent": "gittweet",
        }
        response = self._send("POST", TWEETS_URL, headers, json.dumps({"text": text}).encode())
        data = response.data if isinstance(response.data, dict) else {}
        if response.status != 201:
            detail = data.get("detail") or data.get("title") or "unexpected response"
            raise ApiError(f"Twitter API error {response.status}: {detail}")
        return f"https://x.com/i/web/status/{data['data']['id']}"

    def _authorization(self, method: str, url: str) -> str:
        # A JSON body is not part of the signature: only the oauth_* values are signed.
        params = {
            "oauth_consumer_key": self._credentials.api_key,
            "oauth_nonce": self._nonce(),
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(self._clock())),
            "oauth_token": self._credentials.access_token,
            "oauth_version": "1.0",
        }
        params["oauth_signature"] = oauth1_signature(
            method, url, params, self._credentials.api_secret, self._credentials.access_secret
        )
        fields = ", ".join(
            f'{_percent_encode(key)}="{_percent_encode(value)}"'
            for key, value in sorted(params.items())
        )
        return f"OAuth {fields}"


class DryRunPoster:
    """Stands in for Twitter when no credentials are configured: sends nothing."""

    dry_run = True

    def post(self, text: str) -> None:
        return None
