from __future__ import annotations

from pathlib import Path

from collector.models import EmailEvent
from collector.pipeline.dedupe import DedupeStore


def _event(mid: str) -> EmailEvent:
    return EmailEvent(
        event_id=mid,
        source="gmail",
        provider_message_id=mid,
        subject="s",
        received_at="2026-03-05T00:00:00+00:00",
    )


def test_dedupe_filters_existing_keys(tmp_path: Path) -> None:
    store = DedupeStore(tmp_path / "dedupe.json")
    first = _event("a")
    second = _event("b")

    fresh, dup = store.filter_new([first, second])
    assert len(fresh) == 2
    assert dup == 0

    store.commit(fresh)
    fresh2, dup2 = store.filter_new([first, second])
    assert len(fresh2) == 0
    assert dup2 == 2
