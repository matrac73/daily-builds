import pytest

from slack_archiver.client import Response, SlackClient, SlackError


class Clock:
    """A fake monotonic clock that advances only when the client sleeps."""

    def __init__(self) -> None:
        self.now = 100.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def scripted(*responses: Response):
    queue = list(responses)
    calls = []

    def transport(method, params, token):
        calls.append((method, dict(params), token))
        return queue.pop(0)

    transport.calls = calls
    return transport


def ok(**data) -> Response:
    return Response(200, {}, {"ok": True, **data})


def make(transport, clock: Clock, **options) -> SlackClient:
    return SlackClient("xoxp-test", transport=transport, sleep=clock.sleep, clock=clock, **options)


def test_call_sends_token_and_drops_unset_params():
    transport = scripted(ok(value=1))
    data = make(transport, Clock()).call("some.method", channel="C1", oldest=None)
    assert data["value"] == 1
    assert transport.calls == [("some.method", {"channel": "C1"}, "xoxp-test")]


def test_calls_are_spaced_to_respect_the_rate():
    clock = Clock()
    client = make(scripted(ok(), ok(), ok()), clock, rate_per_minute=50)
    for _ in range(3):
        client.call("auth.test")
    assert clock.sleeps == pytest.approx([1.2, 1.2])


def test_no_wait_when_calls_are_naturally_slow():
    clock = Clock()
    client = make(scripted(ok(), ok()), clock, rate_per_minute=50)
    client.call("auth.test")
    clock.now += 5
    client.call("auth.test")
    assert clock.sleeps == []


def test_rate_limited_call_waits_retry_after_then_succeeds():
    clock = Clock()
    transport = scripted(Response(429, {"retry-after": "7"}, {}), ok(value=2))
    assert make(transport, clock).call("auth.test")["value"] == 2
    assert 7.0 in clock.sleeps
    assert len(transport.calls) == 2


def test_gives_up_after_max_retries():
    limited = Response(429, {"retry-after": "1"}, {})
    transport = scripted(limited, limited, limited)
    with pytest.raises(SlackError) as caught:
        make(transport, Clock(), max_retries=2).call("auth.test")
    assert caught.value.code == "ratelimited"


def test_api_error_is_raised_with_slack_code():
    transport = scripted(Response(200, {}, {"ok": False, "error": "not_in_channel"}))
    with pytest.raises(SlackError) as caught:
        make(transport, Clock()).call("conversations.history", channel="C1")
    assert caught.value.code == "not_in_channel"


def test_server_error_is_raised():
    with pytest.raises(SlackError) as caught:
        make(scripted(Response(503, {}, {})), Clock()).call("auth.test")
    assert caught.value.code == "http_error"


def test_history_follows_cursors_until_exhausted():
    transport = scripted(
        ok(messages=[{"ts": "3"}, {"ts": "2"}], response_metadata={"next_cursor": "abc"}),
        ok(messages=[{"ts": "1"}], response_metadata={"next_cursor": ""}),
    )
    pages = list(make(transport, Clock(), page_size=2).history("C1", oldest="0"))
    assert pages == [[{"ts": "3"}, {"ts": "2"}], [{"ts": "1"}]]
    first, second = (params for _, params, _ in transport.calls)
    assert first == {"channel": "C1", "oldest": "0", "limit": 2}
    assert second["cursor"] == "abc"


@pytest.mark.parametrize("options", [{"rate_per_minute": 0}, {"page_size": 0}])
def test_invalid_settings_are_rejected(options):
    with pytest.raises(ValueError):
        SlackClient("xoxp-test", **options)
