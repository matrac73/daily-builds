from datetime import datetime, timezone

import pytest

from gittweet.core import (
    DEFAULT_TEMPLATE,
    TWEET_LIMIT,
    Repo,
    Session,
    parse_scan_date,
    render_tweet,
    validate_template,
)
from gittweet.errors import DateError, SelectionError, TemplateError
from gittweet.state import State

from .conftest import NOW, FakePoster, make_pr


class TestParseScanDate:
    def test_accepts_a_utc_datetime(self):
        parsed = parse_scan_date("2026-06-01T08:30:00Z", NOW)
        assert parsed == datetime(2026, 6, 1, 8, 30, tzinfo=timezone.utc)

    def test_converts_offsets_to_utc(self):
        parsed = parse_scan_date("2026-06-01T08:30:00+02:00", NOW)
        assert parsed == datetime(2026, 6, 1, 6, 30, tzinfo=timezone.utc)

    def test_reads_a_plain_date_as_local_midnight(self):
        parsed = parse_scan_date("2026-06-01", NOW)
        assert parsed == datetime(2026, 6, 1).astimezone(timezone.utc)

    @pytest.mark.parametrize("text", ["", "   ", None])
    def test_rejects_a_missing_date(self, text):
        with pytest.raises(DateError, match="Enter a scan date"):
            parse_scan_date(text, NOW)

    @pytest.mark.parametrize("text", ["yesterday", "2026-13-01", "31/01/2026", "2026-02-30"])
    def test_rejects_an_invalid_date(self, text):
        with pytest.raises(DateError, match="not a valid date"):
            parse_scan_date(text, NOW)

    def test_rejects_a_future_date(self):
        with pytest.raises(DateError, match="in the future"):
            parse_scan_date("2026-06-15T12:00:01Z", NOW)


class TestTweetRendering:
    repo = Repo("ada/alpha", "alpha", "First project")

    def test_default_message_follows_the_spec(self):
        text = render_tweet(DEFAULT_TEMPLATE, self.repo, make_pr("ada/alpha", 7, day=10))
        assert text == "Pull Request #7 created for repo alpha - First project"

    def test_missing_description_gets_a_fallback(self):
        repo = Repo("ada/beta", "beta", "")
        text = render_tweet(DEFAULT_TEMPLATE, repo, make_pr("ada/beta", 3, day=11))
        assert text == "Pull Request #3 created for repo beta - no description"

    def test_custom_placeholders(self):
        text = render_tweet("{author} opened {title}: {url}", self.repo, make_pr("ada/alpha", 7, 10))
        assert text == "octocat opened Change 7: https://github.com/ada/alpha/pull/7"

    def test_long_messages_are_truncated_to_the_tweet_limit(self):
        repo = Repo("ada/alpha", "alpha", "x" * 400)
        text = render_tweet(DEFAULT_TEMPLATE, repo, make_pr("ada/alpha", 7, day=10))
        assert len(text) == TWEET_LIMIT
        assert text.endswith("…")

    def test_validate_template_strips_whitespace(self):
        assert validate_template("  New PR #{number}  ") == "New PR #{number}"

    @pytest.mark.parametrize("template", ["", "   "])
    def test_validate_template_rejects_empty(self, template):
        with pytest.raises(TemplateError, match="cannot be empty"):
            validate_template(template)

    @pytest.mark.parametrize("template", ["PR {nope}", "PR {}", "PR {repo.name}"])
    def test_validate_template_rejects_unknown_placeholders(self, template):
        with pytest.raises(TemplateError, match="Unknown placeholder"):
            validate_template(template)

    def test_validate_template_rejects_unbalanced_braces(self):
        with pytest.raises(TemplateError, match="Invalid tweet message"):
            validate_template("PR {number")


class TestSession:
    def test_starts_with_everything_selected_and_a_scan_action(self, session):
        assert session.selected == {"ada/alpha", "ada/beta", "ada/gamma"}
        assert session.action == "Scan"

    def test_scan_requires_a_date(self, session):
        with pytest.raises(DateError, match="Enter a scan date first"):
            session.scan()

    def test_scan_requires_a_selection(self, session):
        session.set_date("2026-06-05T00:00:00Z")
        session.select_none()
        with pytest.raises(SelectionError, match="at least one repository"):
            session.scan()

    def test_scan_finds_prs_created_after_the_date(self, session):
        session.set_date("2026-06-05T00:00:00Z")
        pending = session.scan()
        assert {name: [pr.number for pr in prs] for name, prs in pending.items()} == {
            "ada/alpha": [7, 8],
            "ada/beta": [3],
        }
        assert session.action == "Tweet"

    def test_scan_with_nothing_new_keeps_the_scan_action(self, session):
        session.set_date("2026-06-14T00:00:00Z")
        assert session.scan() == {}
        assert session.action == "Scan"

    def test_scan_only_queries_selected_repos(self, session, github):
        session.set_date("2026-06-05T00:00:00Z")
        session.toggle("ada/alpha")
        pending = session.scan()
        assert list(pending) == ["ada/beta"]
        assert github.scanned == ["ada/beta", "ada/gamma"]

    def test_toggling_a_repo_resets_the_action_to_scan(self, session):
        session.set_date("2026-06-05T00:00:00Z")
        session.scan()
        session.toggle("ada/beta")
        assert session.action == "Scan"
        assert session.pending == {}

    def test_changing_the_date_resets_the_action_to_scan(self, session):
        session.set_date("2026-06-05T00:00:00Z")
        session.scan()
        session.set_date("2026-06-11T12:00:00Z")
        assert session.action == "Scan"
        assert [pr.number for prs in session.scan().values() for pr in prs] == [8]

    def test_an_invalid_date_keeps_the_previous_one(self, session):
        session.set_date("2026-06-05T00:00:00Z")
        with pytest.raises(DateError):
            session.set_date("2027-01-01")
        assert session.since == datetime(2026, 6, 5, tzinfo=timezone.utc)

    def test_tweet_posts_one_message_per_pull_request(self, session, poster):
        session.set_date("2026-06-05T00:00:00Z")
        session.scan()
        report = session.tweet()
        assert report.error is None
        assert poster.posted == [
            "Pull Request #7 created for repo alpha - First project",
            "Pull Request #8 created for repo alpha - First project",
            "Pull Request #3 created for repo beta - no description",
        ]
        assert [sent.link for sent in report.sent][0] == "https://x.com/i/web/status/1"
        assert session.action == "Scan"

    def test_rescanning_the_same_date_never_tweets_twice(self, session, poster, github):
        session.set_date("2026-06-05T00:00:00Z")
        session.scan()
        session.tweet()
        assert session.scan() == {}

        github.pull_requests.append(make_pr("ada/beta", 4, day=13))
        assert [pr.number for pr in session.scan()["ada/beta"]] == [4]
        session.tweet()
        assert len(poster.posted) == 4

    def test_a_failed_tweet_keeps_the_rest_pending(self, repos, state, github):
        poster = FakePoster(fail_on=2)
        session = Session(repos, state, github, poster, now=lambda: NOW)
        session.set_date("2026-06-05T00:00:00Z")
        session.scan()

        report = session.tweet()

        assert report.error == "Twitter API error 503: over capacity"
        assert [sent.pull_request.number for sent in report.sent] == [7]
        assert state.tweeted == {"ada/alpha#7"}
        assert session.action == "Tweet"
        assert [pr.key for _, prs in session.pending.items() for pr in prs] == [
            "ada/alpha#8",
            "ada/beta#3",
        ]

    def test_dry_run_tweets_are_not_recorded(self, repos, state, github):
        poster = FakePoster(dry_run=True)
        session = Session(repos, state, github, poster, now=lambda: NOW)
        session.set_date("2026-06-05T00:00:00Z")
        session.scan()
        report = session.tweet()
        assert len(report.sent) == 3
        assert state.tweeted == set()
        assert len(session.scan()) == 2

    def test_custom_message_is_used_and_can_be_reset(self, session, poster):
        session.set_date("2026-06-11T12:00:00Z")
        session.set_template("New PR #{number} on {repo}")
        session.scan()
        session.tweet()
        assert poster.posted == ["New PR #8 on alpha"]
        session.set_template(None)
        assert session.template == DEFAULT_TEMPLATE

    def test_select_only_accepts_short_and_full_names(self, session):
        session.select_only(["Alpha", "ada/gamma"])
        assert session.selected == {"ada/alpha", "ada/gamma"}
        with pytest.raises(SelectionError, match="Unknown repository 'delta'"):
            session.select_only(["delta"])


class TestPersistenceAcrossSessions:
    def test_selection_date_template_and_tweets_survive_a_restart(self, repos, state, github, poster):
        first = Session(repos, state, github, poster, now=lambda: NOW)
        first.toggle("ada/gamma")
        first.set_template("PR #{number}")
        first.set_date("2026-06-05T00:00:00Z")
        first.scan()
        first.tweet()

        second = Session(repos, State.load(state.path), github, poster, now=lambda: NOW)

        assert second.selected == {"ada/alpha", "ada/beta"}
        assert second.template == "PR #{number}"
        assert second.since == datetime(2026, 6, 5, tzinfo=timezone.utc)
        assert second.scan() == {}  # resumes from the last scan date, nothing is re-tweeted

    def test_repos_deleted_on_github_are_dropped_from_the_selection(self, repos, github, poster):
        state = State(selected_repos=["ada/alpha", "ada/removed"])
        session = Session(repos, state, github, poster, now=lambda: NOW)
        assert session.selected == {"ada/alpha"}
