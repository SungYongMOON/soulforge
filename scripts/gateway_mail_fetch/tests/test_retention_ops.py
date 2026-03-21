from __future__ import annotations

import json
import os
from pathlib import Path

from collector.ops.retention import RetentionConfig, run_retention_cleanup


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _touch_with_epoch(path: Path, *, epoch: int, content: str = "x") -> None:
    _write(path, content)
    os.utime(path, (epoch, epoch))


def test_retention_report_only_keeps_company_and_reports_personal_candidates(tmp_path: Path) -> None:
    now_epoch = 1_800_000_000
    runtime_root = tmp_path / "runtime-email-fetch"
    inbox_root = tmp_path / "_inbox"

    company_file = inbox_root / "company" / "mail" / "keep.txt"
    personal_old = inbox_root / "personal" / "ads" / "old.txt"
    personal_new = inbox_root / "personal" / "ads" / "new.txt"

    _touch_with_epoch(company_file, epoch=now_epoch - 500 * 86400)
    _touch_with_epoch(personal_old, epoch=now_epoch - 400 * 86400)
    _touch_with_epoch(personal_new, epoch=now_epoch - 10 * 86400)

    report = run_retention_cleanup(
        RetentionConfig(
            runtime_root=runtime_root,
            inbox_root=inbox_root,
            report_only=True,
            now_epoch=now_epoch,
        )
    )

    candidate_paths = [row["path"] for row in report["candidates"]["personal_files"]]
    assert str(personal_old) in candidate_paths
    assert str(company_file) not in candidate_paths
    assert report["actions"]["moved_to_trash"] == []


def test_retention_apply_moves_personal_files_to_trash(tmp_path: Path) -> None:
    now_epoch = 1_800_000_000
    runtime_root = tmp_path / "runtime-email-fetch"
    inbox_root = tmp_path / "_inbox"

    target = inbox_root / "personal" / "quarantine" / "old.exe"
    company_file = inbox_root / "company" / "mail" / "must_keep.txt"
    _touch_with_epoch(target, epoch=now_epoch - 500 * 86400)
    _touch_with_epoch(company_file, epoch=now_epoch - 500 * 86400)

    report = run_retention_cleanup(
        RetentionConfig(
            runtime_root=runtime_root,
            inbox_root=inbox_root,
            report_only=False,
            now_epoch=now_epoch,
        )
    )

    moved = report["actions"]["moved_to_trash"]
    assert any(str(target) == row["src"] for row in moved)
    assert not target.exists()
    assert company_file.exists()


def test_retention_apply_prunes_jsonl_and_purges_old_trash(tmp_path: Path) -> None:
    now_epoch = 1_800_000_000
    runtime_root = tmp_path / "runtime-email-fetch"
    inbox_root = tmp_path / "_inbox"

    runs = runtime_root / "logs" / "runs.jsonl"
    debug = runtime_root / "logs" / "collector_debug.jsonl"
    _write(
        runs,
        "\n".join(
            [
                json.dumps({"finished_at": "2020-01-01T00:00:00+00:00", "partial": False}),
                json.dumps({"finished_at": "2027-01-10T00:00:00+00:00", "partial": False}),
            ]
        )
        + "\n",
    )
    _write(
        debug,
        "\n".join(
            [
                json.dumps({"ts": "2020-01-01T00:00:00+00:00", "event": "old"}),
                json.dumps({"ts": "2027-01-10T00:00:00+00:00", "event": "new"}),
            ]
        )
        + "\n",
    )

    old_trash = inbox_root / "_trash" / "email-fetch" / "20200101"
    _write(old_trash / "stale.txt", "stale")

    report = run_retention_cleanup(
        RetentionConfig(
            runtime_root=runtime_root,
            inbox_root=inbox_root,
            report_only=False,
            trash_grace_days=14,
            now_epoch=now_epoch,
        )
    )

    rewritten = report["actions"]["jsonl_rewritten"]
    assert len(rewritten) == 2
    assert "2027-01-10" in runs.read_text(encoding="utf-8")
    assert "2020-01-01" not in runs.read_text(encoding="utf-8")
    assert "2027-01-10" in debug.read_text(encoding="utf-8")
    assert "2020-01-01" not in debug.read_text(encoding="utf-8")

    purged = report["actions"]["purged_trash"]
    assert any(row["path"] == str(old_trash) for row in purged)
    assert not old_trash.exists()
