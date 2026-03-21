from __future__ import annotations

from pathlib import Path

from collector.storage.cursor_store import CursorStore


def test_cursor_store_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "cursor.json"
    store = CursorStore(path)
    store.set_cursor("gmail", {"last_received_epoch": 12345})
    store.save()

    loaded = CursorStore(path)
    cursor = loaded.get_cursor("gmail")
    assert cursor is not None
    assert cursor["last_received_epoch"] == 12345
