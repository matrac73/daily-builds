from datetime import datetime, timezone

import pytest

from gittweet.errors import ApiError
from gittweet.github import GitHubClient
from gittweet.http import Response

API = "https://api.test"


class FakeSend:
    """Serves canned responses by URL and records every request."""

    def __init__(self, routes: dict[str, Response]):
        self.routes = routes
        self.requests: list[tuple[str, str, dict]] = []

    def __call__(self, method, url, headers, body):
        self.requests.append((method, url, dict(headers)))
        return self.routes[url]


def pull(number: int, created_at: str) -> dict:
    return {
        "number": number,
        "title": f"Change {number}",
        "user": {"login": "octocat"},
        "html_url": f"https://github.com/ada/alpha/pull/{number}",
        "created_at": created_at,
    }


def test_list_repos_follows_pagination_and_sorts_by_name():
    first = f"{API}/users/ada/repos?type=owner&per_page=100"
    second = f"{API}/users/ada/repos?page=2"
    send = FakeSend(
        {
            first: Response(
                200,
                {"link": f'<{second}>; rel="next", <{second}>; rel="last"'},
                [{"full_name": "ada/zeta", "name": "zeta", "description": None}],
            ),
            second: Response(
                200,
                {"link": f'<{first}>; rel="first"'},
                [{"full_name": "ada/Alpha", "name": "Alpha", "description": "First"}],
            ),
        }
    )

    repos = GitHubClient(send=send, api_url=API).list_repos("ada")

    assert [(repo.full_name, repo.description) for repo in repos] == [
        ("ada/Alpha", "First"),
        ("ada/zeta", ""),
    ]
    assert "Authorization" not in send.requests[0][2]


def test_list_repos_without_user_uses_the_token_owner():
    url = f"{API}/user/repos?affiliation=owner&per_page=100"
    send = FakeSend({url: Response(200, {}, [])})

    assert GitHubClient("secret", send=send, api_url=API).list_repos() == []
    assert send.requests[0][2]["Authorization"] == "Bearer secret"


def test_list_pull_requests_keeps_only_those_created_after_the_date():
    first = f"{API}/repos/ada/alpha/pulls?state=all&sort=created&direction=desc&per_page=100"
    second = f"{API}/repos/ada/alpha/pulls?page=2"
    send = FakeSend(
        {
            first: Response(
                200,
                {"link": f'<{second}>; rel="next"'},
                [pull(9, "2026-06-12T10:00:00Z"), pull(8, "2026-06-10T00:00:00Z")],
            ),
        }
    )
    since = datetime(2026, 6, 10, tzinfo=timezone.utc)

    found = GitHubClient(send=send, api_url=API).list_pull_requests("ada/alpha", since)

    assert [pr.number for pr in found] == [9]
    assert found[0].key == "ada/alpha#9"
    assert found[0].author == "octocat"
    assert found[0].created_at == datetime(2026, 6, 12, 10, tzinfo=timezone.utc)
    assert len(send.requests) == 1  # stopped before fetching the older second page


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (Response(401, {}, {"message": "Bad credentials"}), "rejected the token"),
        (Response(403, {"x-ratelimit-remaining": "0"}, {}), "rate limit reached"),
        (Response(404, {}, {"message": "Not Found"}), "could not find"),
        (Response(500, {}, {"message": "Server Error"}), "error 500: Server Error"),
        (Response(502, {}, None), "error 502: unexpected response"),
    ],
)
def test_errors_are_explained(response, message):
    url = f"{API}/users/ada/repos?type=owner&per_page=100"
    client = GitHubClient(send=FakeSend({url: response}), api_url=API)
    with pytest.raises(ApiError, match=message):
        client.list_repos("ada")
