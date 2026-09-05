"""Bind the E14 contract kit without vendoring it.

The kit stays a read-only original outside this repository. This module puts its
`src` directory on `sys.path` for the current process only; nothing is copied,
written or re-declared here. If the kit is absent the lane fails closed instead
of falling back to a private re-implementation of the same contract.
"""
from __future__ import annotations

import sys
from pathlib import Path

_BOUND: Path | None = None


def bind(kit_root: Path) -> Path:
    """Make `sf_sewe` importable from the configured kit root."""
    global _BOUND
    src = Path(kit_root) / "src"
    if not (src / "sf_sewe" / "models.py").is_file():
        raise RuntimeError("KIT_ROOT_NOT_FOUND")
    # Importing from the kit would otherwise leave `__pycache__` inside it. The
    # kit must stay byte-identical to its manifest, so no bytecode is written.
    sys.dont_write_bytecode = True
    text = str(src)
    if text not in sys.path:
        sys.path.insert(0, text)
    _BOUND = src
    return src


def bound() -> Path | None:
    return _BOUND
