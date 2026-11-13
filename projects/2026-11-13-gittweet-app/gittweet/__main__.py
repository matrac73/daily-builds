"""Allow running the tool with ``python -m gittweet``."""

import sys

from .cli import main

sys.exit(main())
