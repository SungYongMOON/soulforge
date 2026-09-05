"""Test bindings.

The E14 contract kit is a read-only original outside this repository, so the
tests that need it are skipped when no runtime config names one. The adapter
boundary tests that matter most — a missing key file, a missing bearer, a
forbidden value in a released body — need no kit and always run.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

PACKAGE_SRC = Path(__file__).resolve().parents[1] / "src"
if str(PACKAGE_SRC) not in sys.path:
    sys.path.insert(0, str(PACKAGE_SRC))


def _kit_src() -> Path | None:
    raw = os.environ.get("SOULFORGE_SECURE_WORK_CONFIG")
    if not raw or not Path(raw).is_file():
        return None
    try:
        data = json.loads(Path(raw).read_text(encoding="utf-8"))
    except ValueError:
        return None
    root = data.get("kit_root")
    if not root:
        return None
    src = Path(root) / "src"
    return src if (src / "sf_sewe" / "models.py").is_file() else None


@pytest.fixture(scope="session")
def kit():
    src = _kit_src()
    if src is None:
        pytest.skip("E14 contract kit not bound; set SOULFORGE_SECURE_WORK_CONFIG")
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))
    import sf_sewe  # noqa: F401  - import proves the binding

    return src
