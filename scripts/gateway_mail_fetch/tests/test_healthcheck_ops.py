from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from collector.ops.healthcheck import HealthConfig, run_healthcheck


def _write_summary(runtime_root: Path, *, finished_at: str, partial: bool = False, errors: List[Dict[str, Any]] | None = None) -> None:
    logs_dir = runtime_root / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": "email.fetch.run.v1",
        "started_at": finished_at,
        "finished_at": finished_at,
        "partial": partial,
        "errors": errors or [],
    }
    (logs_dir / "last_run_summary.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _write_runs(runtime_root: Path, rows: List[Dict[str, Any]]) -> None:
    logs_dir = runtime_root / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    with (logs_dir / "runs.jsonl").open("w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")


def test_healthcheck_warn_and_cooldown_suppression(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime-email-fetch"
    finished = "2026-03-05T00:00:00+00:00"
    _write_summary(runtime_root, finished_at=finished, partial=True)
    _write_runs(
        runtime_root,
        [
            {"partial": True, "errors": []},
            {"partial": True, "errors": []},
            {"partial": True, "errors": []},
        ],
    )

    config = HealthConfig(
        runtime_root=runtime_root,
        max_stale_sec=999999999,
        fail_streak_threshold=2,
        partial_streak_threshold=3,
        alert_cooldown_sec=3600,
        telegram_enabled=False,
    )

    first = run_healthcheck(config)
    second = run_healthcheck(config)

    assert first["status"] == "WARN"
    assert first["alert"]["kind"] == "WARN"
    assert first["alert"]["error"] == "telegram_alert_disabled"

    assert second["status"] == "WARN"
    assert second["alert"]["kind"] == ""


def test_healthcheck_critical_on_fail_streak(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime-email-fetch"
    finished = "2026-03-05T00:00:00+00:00"
    _write_summary(runtime_root, finished_at=finished, partial=True, errors=[{"code": "x"}])
    _write_runs(
        runtime_root,
        [
            {"partial": True, "errors": [{"code": "x"}]},
            {"partial": True, "errors": [{"code": "y"}]},
        ],
    )

    config = HealthConfig(
        runtime_root=runtime_root,
        max_stale_sec=999999999,
        fail_streak_threshold=2,
        partial_streak_threshold=3,
        alert_cooldown_sec=10,
        telegram_enabled=False,
    )

    row = run_healthcheck(config)
    assert row["status"] == "CRITICAL"
    assert row["reason"] == "fail_streak"
    assert row["metrics"]["fail_streak"] == 2


def test_healthcheck_recovery_alert_when_return_to_normal(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime-email-fetch"
    monitor_dir = runtime_root / "monitor"
    monitor_dir.mkdir(parents=True, exist_ok=True)
    (monitor_dir / "health_state.json").write_text(
        json.dumps(
            {
                "schema_version": "email.fetch.health.v1",
                "last_status": "WARN",
                "last_alert_at": 0,
                "last_fingerprint": "WARN:partial_streak",
                "updated_at": "2026-03-05T00:00:00+00:00",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    finished = "2026-03-05T00:00:00+00:00"
    _write_summary(runtime_root, finished_at=finished, partial=False, errors=[])
    _write_runs(runtime_root, [{"partial": False, "errors": []}])

    config = HealthConfig(
        runtime_root=runtime_root,
        max_stale_sec=999999999,
        fail_streak_threshold=2,
        partial_streak_threshold=3,
        alert_cooldown_sec=3600,
        telegram_enabled=False,
    )

    row = run_healthcheck(config)
    assert row["status"] == "NORMAL"
    assert row["alert"]["kind"] == "RECOVERY"
    assert row["alert"]["error"] == "telegram_alert_disabled"
