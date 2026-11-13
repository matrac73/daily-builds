"""Exceptions raised by GitTweet. All of them carry a user-facing message."""


class GitTweetError(Exception):
    """Base class for every error the CLI reports to the user."""


class ApiError(GitTweetError):
    """A GitHub or Twitter API call failed."""


class ConfigError(GitTweetError):
    """Required configuration (user name, credentials) is missing or incomplete."""


class DateError(GitTweetError):
    """The scan date is missing, malformed or in the future."""


class SelectionError(GitTweetError):
    """The repository selection is empty or refers to an unknown repository."""


class StateError(GitTweetError):
    """The persisted state file cannot be read."""


class TemplateError(GitTweetError):
    """The custom tweet message is empty or uses an unknown placeholder."""
