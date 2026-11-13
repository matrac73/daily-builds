"""Core logic: date validation, tweet rendering and the Scan/Tweet session."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from string import Formatter
from typing import Callable, Iterable, Protocol

from .errors import ApiError, DateError, SelectionError, TemplateError
from .state import State

DEFAULT_TEMPLATE = "Pull Request #{number} created for repo {repo} - {description}"
PLACEHOLDERS = ("number", "repo", "description", "title", "author", "url")
TWEET_LIMIT = 280


@dataclass(frozen=True)
class Repo:
    full_name: str  # "owner/name"
    name: str
    description: str


@dataclass(frozen=True)
class PullRequest:
    repo: str  # full name of the repository it targets
    number: int
    title: str
    author: str
    url: str
    created_at: datetime

    @property
    def key(self) -> str:
        """Stable identifier used to remember that this PR was tweeted."""
        return f"{self.repo}#{self.number}"


@dataclass(frozen=True)
class SentTweet:
    pull_request: PullRequest
    text: str
    link: str | None  # None for dry-run tweets


@dataclass(frozen=True)
class TweetReport:
    sent: list[SentTweet]
    error: str | None  # set when posting stopped early


class GitHub(Protocol):
    def list_pull_requests(self, full_name: str, since: datetime) -> list[PullRequest]: ...


class Poster(Protocol):
    dry_run: bool

    def post(self, text: str) -> str | None: ...


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_scan_date(text: str | None, now: datetime | None = None) -> datetime:
    """Validate a user-entered scan date and return it as an aware UTC datetime.

    Accepts ISO 8601 dates and datetimes (``2026-01-31``, ``2026-01-31 14:30``,
    ``2026-01-31T14:30:00Z``). Values without an offset are local time.
    """
    text = (text or "").strip()
    if not text:
        raise DateError("Enter a scan date, e.g. 2026-01-31.")
    normalized = text[:-1] + "+00:00" if text[-1] in "Zz" else text
    try:
        # astimezone() reads naive values as local time; it rejects dates the
        # platform cannot convert (e.g. before 1970 on Windows).
        moment = datetime.fromisoformat(normalized).astimezone(timezone.utc)
    except (ValueError, OverflowError, OSError):
        raise DateError(
            f"'{text}' is not a valid date. Use YYYY-MM-DD or YYYY-MM-DD HH:MM."
        ) from None
    if moment > (now or utc_now()):
        raise DateError(f"'{text}' is in the future. Enter a past date.")
    return moment


def validate_template(template: str) -> str:
    """Return the stripped template, or raise if it cannot be rendered."""
    template = template.strip()
    if not template:
        raise TemplateError("The tweet message cannot be empty.")
    try:
        fields = {name for _, name, _, _ in Formatter().parse(template) if name is not None}
    except ValueError as error:
        raise TemplateError(f"Invalid tweet message: {error}.") from None
    unknown = sorted(fields - set(PLACEHOLDERS))
    if unknown:
        allowed = ", ".join("{" + name + "}" for name in PLACEHOLDERS)
        listed = ", ".join("{" + name + "}" for name in unknown)
        raise TemplateError(f"Unknown placeholder {listed}. Available: {allowed}.")
    return template


def render_tweet(template: str, repo: Repo, pull_request: PullRequest) -> str:
    """Fill the template for one pull request, truncated to the tweet limit."""
    text = template.format(
        number=pull_request.number,
        repo=repo.name,
        description=repo.description or "no description",
        title=pull_request.title,
        author=pull_request.author,
        url=pull_request.url,
    )
    if len(text) > TWEET_LIMIT:
        text = text[: TWEET_LIMIT - 1].rstrip() + "…"
    return text


class Session:
    """The Scan/Tweet state machine behind the user interface.

    A scan fills ``pending`` with the not-yet-tweeted pull requests of the
    selected repositories and flips ``action`` to "Tweet". Changing the
    selection, the date or the message discards the pending result, so the
    next action is "Scan" again.
    """

    def __init__(
        self,
        repos: Iterable[Repo],
        state: State,
        github: GitHub,
        poster: Poster,
        now: Callable[[], datetime] = utc_now,
    ) -> None:
        self.repos = list(repos)
        self.state = state
        self.github = github
        self.poster = poster
        self._now = now
        self._by_name = {repo.full_name: repo for repo in self.repos}
        if state.selected_repos is None:
            self.selected = set(self._by_name)
        else:
            self.selected = set(self._by_name) & set(state.selected_repos)
        self.since = state.last_scan_date
        self.pending: dict[str, list[PullRequest]] = {}

    @property
    def action(self) -> str:
        return "Tweet" if self.pending else "Scan"

    @property
    def template(self) -> str:
        return self.state.template or DEFAULT_TEMPLATE

    def toggle(self, full_name: str) -> None:
        if full_name not in self._by_name:
            raise SelectionError(f"Unknown repository '{full_name}'.")
        self._select(self.selected ^ {full_name})

    def select_all(self) -> None:
        self._select(set(self._by_name))

    def select_none(self) -> None:
        self._select(set())

    def select_only(self, names: Iterable[str]) -> None:
        """Select exactly the given repositories, named by short or full name."""
        lookup = {}
        for repo in self.repos:
            lookup[repo.name.lower()] = repo.full_name
            lookup[repo.full_name.lower()] = repo.full_name
        chosen = set()
        for name in names:
            if name.lower() not in lookup:
                raise SelectionError(f"Unknown repository '{name}'.")
            chosen.add(lookup[name.lower()])
        self._select(chosen)

    def set_date(self, text: str | None) -> None:
        self.since = parse_scan_date(text, self._now())
        self.pending = {}

    def set_template(self, template: str | None) -> None:
        """Set a custom tweet message; ``None`` restores the default one."""
        self.state.template = validate_template(template) if template is not None else None
        self.state.save()
        self.pending = {}

    def scan(self) -> dict[str, list[PullRequest]]:
        """Find pull requests created after the scan date and not tweeted yet."""
        if self.since is None:
            raise DateError("Enter a scan date first, e.g. 'd 2026-01-31'.")
        if not self.selected:
            raise SelectionError("Select at least one repository to scan.")
        pending = {}
        for repo in self.repos:
            if repo.full_name not in self.selected:
                continue
            fresh = [
                pull_request
                for pull_request in self.github.list_pull_requests(repo.full_name, self.since)
                if pull_request.key not in self.state.tweeted
            ]
            if fresh:
                pending[repo.full_name] = sorted(fresh, key=lambda pr: pr.number)
        self.pending = pending
        self.state.last_scan_date = self.since
        self.state.save()
        return pending

    def planned_tweets(self) -> list[tuple[PullRequest, str]]:
        """The tweets the next "Tweet" action will send, in order."""
        return [
            (pull_request, render_tweet(self.template, self._by_name[full_name], pull_request))
            for full_name, pull_requests in self.pending.items()
            for pull_request in pull_requests
        ]

    def tweet(self) -> TweetReport:
        """Post one tweet per pending pull request and remember each success.

        Stops at the first failure; the pull requests that were not sent stay
        pending so the action can be retried. Dry-run tweets are never recorded.
        """
        sent: list[SentTweet] = []
        for pull_request, text in self.planned_tweets():
            try:
                link = self.poster.post(text)
            except ApiError as error:
                self._forget_pending({tweet.pull_request.key for tweet in sent})
                return TweetReport(sent, str(error))
            if not self.poster.dry_run:
                self.state.tweeted.add(pull_request.key)
                self.state.save()
            sent.append(SentTweet(pull_request, text, link))
        self.pending = {}
        return TweetReport(sent, None)

    def _select(self, selected: set[str]) -> None:
        self.selected = selected
        self.pending = {}
        self.state.selected_repos = sorted(selected)
        self.state.save()

    def _forget_pending(self, keys: set[str]) -> None:
        remaining = {}
        for full_name, pull_requests in self.pending.items():
            left = [pr for pr in pull_requests if pr.key not in keys]
            if left:
                remaining[full_name] = left
        self.pending = remaining
