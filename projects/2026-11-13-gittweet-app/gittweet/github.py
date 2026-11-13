"""Read-only GitHub REST API client: owned repositories and their pull requests."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Iterator
from urllib.parse import quote

from . import http
from .core import PullRequest, Repo
from .errors import ApiError

API_URL = "https://api.github.com"
_NEXT_LINK = re.compile(r'<([^>]+)>;\s*rel="next"')


class GitHubClient:
    def __init__(self, token: str | None = None, send: http.Send = http.send, api_url: str = API_URL):
        self._token = token
        self._send = send
        self._api_url = api_url

    def list_repos(self, user: str | None = None) -> list[Repo]:
        """Repositories owned by ``user``, or by the token's owner when omitted.

        Listing through the token also returns private repositories.
        """
        if user:
            url = f"{self._api_url}/users/{quote(user, safe='')}/repos?type=owner&per_page=100"
        else:
            url = f"{self._api_url}/user/repos?affiliation=owner&per_page=100"
        repos = [
            Repo(item["full_name"], item["name"], item.get("description") or "")
            for page in self._pages(url)
            for item in page
        ]
        return sorted(repos, key=lambda repo: repo.name.lower())

    def list_pull_requests(self, full_name: str, since: datetime) -> list[PullRequest]:
        """Pull requests (open or closed) created strictly after ``since``."""
        url = (
            f"{self._api_url}/repos/{quote(full_name)}/pulls"
            "?state=all&sort=created&direction=desc&per_page=100"
        )
        found = []
        for page in self._pages(url):
            for item in page:
                created_at = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
                if created_at <= since:
                    return found  # newest first: everything further down is older
                found.append(
                    PullRequest(
                        repo=full_name,
                        number=item["number"],
                        title=item.get("title") or "",
                        author=(item.get("user") or {}).get("login", ""),
                        url=item.get("html_url", ""),
                        created_at=created_at,
                    )
                )
        return found

    def _pages(self, url: str | None) -> Iterator[list[Any]]:
        while url:
            response = self._get(url)
            yield response.data or []
            match = _NEXT_LINK.search(response.headers.get("link", ""))
            url = match.group(1) if match else None

    def _get(self, url: str) -> http.Response:
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "gittweet",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        response = self._send("GET", url, headers, None)
        if response.status == 200:
            return response
        raise ApiError(_explain(response, url))


def _explain(response: http.Response, url: str) -> str:
    if response.status == 401:
        return "GitHub rejected the token in GITHUB_TOKEN."
    if response.status in (403, 429) and response.headers.get("x-ratelimit-remaining") == "0":
        return "GitHub API rate limit reached. Set GITHUB_TOKEN to raise it, or retry later."
    if response.status == 404:
        return f"GitHub could not find {url.split('?')[0]}. Check the user name."
    detail = response.data.get("message") if isinstance(response.data, dict) else None
    return f"GitHub API error {response.status}: {detail or 'unexpected response'}."
