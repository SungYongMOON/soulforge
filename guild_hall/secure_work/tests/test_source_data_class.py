"""Source data-class declaration tests.

The lane stamps every job, receipt and outbox summary with what the pinned
source directory holds. That stamp is what a later reader trusts, so it must
come from an explicit declaration by whoever placed the source -- never from a
default and never from the bytes. These cover the two ways that can go wrong:
an undeclared source starting a job, and the stamp drifting back to a literal.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from soulforge_secure_work.config import (
    SOURCE_DATA_CLASSES,
    Config,
    ConfigError,
)


def _config(tmp_path: Path, declared: str | None) -> Config:
    return Config(
        path=tmp_path / "secure_work.config.json",
        kit_root=tmp_path / "kit",
        pilot_root=tmp_path / "pilot",
        status_path=tmp_path / "status.json",
        recipe_root=tmp_path / "recipes",
        adapters={},
        source_data_class=declared,
    )


def test_the_declared_vocabulary_names_synthetic_and_real(tmp_path):
    assert set(SOURCE_DATA_CLASSES) == {"SYNTHETIC_ONLY", "REAL_RESTRICTED"}
    for declared in SOURCE_DATA_CLASSES:
        assert _config(tmp_path, declared).required_source_data_class() == declared


@pytest.mark.parametrize("declared", [None, "", "synthetic_only", "REAL", "UNKNOWN"])
def test_an_undeclared_or_unknown_source_class_fails_closed(tmp_path, declared):
    with pytest.raises(ConfigError) as caught:
        _config(tmp_path, declared).required_source_data_class()
    assert caught.value.code == "SOURCE_DATA_CLASS_UNDECLARED"


def test_the_engine_never_writes_a_literal_source_class():
    """A default here would mark real material as a rehearsal. Keep it derived."""
    source = (Path(__file__).resolve().parents[1] / "src" / "soulforge_secure_work"
              / "engine.py").read_text(encoding="utf-8")
    # Built from parts so a repository source scan does not read this probe as
    # the very literal it forbids.
    literal = '"data_class"' + ': "' + "SYNTHETIC_ONLY" + '"'
    assert literal not in source
    assert '"data_class": data_class' in source
