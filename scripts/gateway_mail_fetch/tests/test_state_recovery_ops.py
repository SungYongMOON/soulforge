from __future__ import annotations

import json
from pathlib import Path

import pytest

from collector.ops.state_recovery import create_state_backup, restore_state_snapshot


def _write_state(runtime_root: Path, *, cursor_marker: str, dedupe_marker: str) -> None:
    state_dir = runtime_root / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "cursor_state.json").write_text(
        json.dumps({"schema_version": "email.fetch.cursor.v1", "marker": cursor_marker}, ensure_ascii=False),
        encoding="utf-8",
    )
    (state_dir / "dedupe_keys.json").write_text(
        json.dumps({"keys": [dedupe_marker]}, ensure_ascii=False),
        encoding="utf-8",
    )


def test_create_state_backup_writes_manifest_and_rotates(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime-email-fetch"
    _write_state(runtime_root, cursor_marker="A", dedupe_marker="A")

    first = create_state_backup(runtime_root, keep=2, snapshot_id="snap-1")
    second = create_state_backup(runtime_root, keep=2, snapshot_id="snap-2")
    third = create_state_backup(runtime_root, keep=2, snapshot_id="snap-3")

    assert first["file_count"] == 2
    assert second["file_count"] == 2
    assert third["file_count"] == 2

    backups = sorted(path.name for path in (runtime_root / "state_backups").iterdir() if path.is_dir())
    assert backups == ["snap-2", "snap-3"]

    manifest = json.loads((runtime_root / "state_backups" / "snap-3" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["schema_version"] == "email.fetch.state.backup.v1"
    assert manifest["file_count"] == 2


def test_restore_state_snapshot_restores_previous_content(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime-email-fetch"
    _write_state(runtime_root, cursor_marker="ORIGINAL", dedupe_marker="ORIGINAL")

    backup = create_state_backup(runtime_root, keep=10, snapshot_id="snap-good")

    _write_state(runtime_root, cursor_marker="BROKEN", dedupe_marker="BROKEN")
    result = restore_state_snapshot(runtime_root, snapshot_id="snap-good", keep=10)

    restored_cursor = json.loads((runtime_root / "state" / "cursor_state.json").read_text(encoding="utf-8"))
    restored_dedupe = json.loads((runtime_root / "state" / "dedupe_keys.json").read_text(encoding="utf-8"))

    assert restored_cursor["marker"] == "ORIGINAL"
    assert restored_dedupe["keys"] == ["ORIGINAL"]
    assert result["snapshot_id"] == "snap-good"
    assert result["restored_file_count"] == 2
    assert str(result["pre_restore_backup"]["snapshot_id"]).startswith("pre_restore_")
    assert backup["snapshot_id"] == "snap-good"


def test_restore_state_snapshot_fails_when_required_file_missing(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime-email-fetch"
    _write_state(runtime_root, cursor_marker="X", dedupe_marker="X")
    create_state_backup(runtime_root, keep=10, snapshot_id="snap-bad")

    broken = runtime_root / "state_backups" / "snap-bad" / "state" / "dedupe_keys.json"
    broken.unlink()

    with pytest.raises(ValueError, match="필수 state 파일 누락"):
        restore_state_snapshot(runtime_root, snapshot_id="snap-bad", keep=10)
