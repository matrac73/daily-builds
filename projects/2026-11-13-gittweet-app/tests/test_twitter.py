import json

import pytest

from gittweet.errors import ApiError, ConfigError
from gittweet.http import Response
from gittweet.twitter import TWEETS_URL, Credentials, TwitterPoster, oauth1_signature

CREDENTIALS = Credentials("key", "key-secret", "token", "token-secret")


def test_signature_matches_the_twitter_documentation_example():
    # Worked example from Twitter's "Creating a signature" guide.
    params = {
        "status": "Hello Ladies + Gentlemen, a signed OAuth request!",
        "include_entities": "true",
        "oauth_consumer_key": "xvz1evFS4wEEPTGEFPHBog",
        "oauth_nonce": "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": "1318622958",
        "oauth_token": "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
        "oauth_version": "1.0",
    }
    signature = oauth1_signature(
        "post",
        "https://api.twitter.com/1.1/statuses/update.json",
        params,
        consumer_secret="kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
        token_secret="LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
    )
    assert signature == "hCtSmYh+iHYCEqBWrE7C7hYmtUk="


def test_post_sends_a_signed_json_request_and_returns_the_tweet_url():
    requests = []

    def send(method, url, headers, body):
        requests.append((method, url, headers, body))
        return Response(201, {}, {"data": {"id": "1234", "text": "hello"}})

    poster = TwitterPoster(CREDENTIALS, send=send, clock=lambda: 1700000000.9, nonce=lambda: "abc")

    assert poster.post("hello") == "https://x.com/i/web/status/1234"

    method, url, headers, body = requests[0]
    assert (method, url) == ("POST", TWEETS_URL)
    assert json.loads(body) == {"text": "hello"}
    assert headers["Content-Type"] == "application/json"
    expected = oauth1_signature(
        "POST",
        TWEETS_URL,
        {
            "oauth_consumer_key": "key",
            "oauth_nonce": "abc",
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": "1700000000",
            "oauth_token": "token",
            "oauth_version": "1.0",
        },
        "key-secret",
        "token-secret",
    )
    authorization = headers["Authorization"]
    assert authorization.startswith('OAuth oauth_consumer_key="key", oauth_nonce="abc", ')
    assert f'oauth_signature="{expected.replace("+", "%2B").replace("/", "%2F").replace("=", "%3D")}"' in authorization


def test_post_raises_with_the_api_detail_on_failure():
    def send(method, url, headers, body):
        return Response(403, {}, {"title": "Forbidden", "detail": "Duplicate content."})

    with pytest.raises(ApiError, match="error 403: Duplicate content."):
        TwitterPoster(CREDENTIALS, send=send).post("hello")


def test_credentials_are_optional_but_must_be_complete():
    assert Credentials.from_env({}) is None
    complete = {
        "TWITTER_API_KEY": "a",
        "TWITTER_API_SECRET": "b",
        "TWITTER_ACCESS_TOKEN": "c",
        "TWITTER_ACCESS_SECRET": "d",
    }
    assert Credentials.from_env(complete) == Credentials("a", "b", "c", "d")
    with pytest.raises(ConfigError, match="missing: TWITTER_API_SECRET, TWITTER_ACCESS_SECRET"):
        Credentials.from_env({"TWITTER_API_KEY": "a", "TWITTER_ACCESS_TOKEN": "c"})
