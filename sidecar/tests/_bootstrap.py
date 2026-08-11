"""Puts the sidecar root on sys.path so `from builder import ...` resolves.

Needed because these files run two ways: directly (`uv run python
tests/test_smoke.py`, which puts tests/ on sys.path, not sidecar/) and under
pytest (conftest.py imports this for the same reason).
"""

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
