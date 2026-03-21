from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Sequence, Tuple


HEALTH_SCHEMA_VERSION = "email.fetch.health.v1"


@dataclass
class HealthConfig:
    runtime_root: Path
    max_stale_sec: int = 900
    fail_streak_threshold: int = 2
    partial_streak_threshold: int = 3
    alert_cooldown_sec: int = 3600
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _now_epoch() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _parse_iso_epoch(value: Any) -> Optional[int]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp())


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        row = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return row if isinstance(row, dict) else {}


def _write_json_atomic(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def _load_recent_runs(path: Path, limit: int = 200) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fp:
        for raw in fp:
            line = raw.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            if isinstance(row, dict):
                rows.append(row)
    if limit > 0:
        return rows[-limit:]
    return rows


def _compute_streaks(runs: Sequence[Dict[str, Any]]) -> Tuple[int, int]:
    fail_streak = 0
    partial_streak = 0

    for row in reversed(runs):
        is_partial = bool(row.get("partial", False))
        if not is_partial:
            break
        partial_streak += 1

    for row in reversed(runs):
        is_partial = bool(row.get("partial", False))
        errors = row.get("errors")
        has_errors = bool(errors)
        if not (is_partial and has_errors):
            break
        fail_streak += 1

    return fail_streak, partial_streak


def _build_assessment(config: HealthConfig, now_epoch: int) -> Dict[str, Any]:
    summary_path = config.runtime_root / "logs" / "last_run_summary.json"
    runs_path = config.runtime_root / "logs" / "runs.jsonl"

    summary = _load_json(summary_path)
    runs = _load_recent_runs(runs_path)

    finished_epoch = _parse_iso_epoch(summary.get("finished_at"))
    stale_sec: Optional[int] = None
    if finished_epoch is not None:
        stale_sec = max(now_epoch - finished_epoch, 0)

    fail_streak, partial_streak = _compute_streaks(runs)
    status = "NORMAL"
    reason = "ok"

    if finished_epoch is None:
        status = "CRITICAL"
        reason = "missing_summary"
    elif stale_sec is not None and stale_sec > config.max_stale_sec:
        status = "CRITICAL"
        reason = "stale"
    elif fail_streak >= config.fail_streak_threshold:
        status = "CRITICAL"
        reason = "fail_streak"
    elif partial_streak >= config.partial_streak_threshold:
        status = "WARN"
        reason = "partial_streak"

    fingerprint = f"{status}:{reason}"

    return {
        "status": status,
        "reason": reason,
        "fingerprint": fingerprint,
        "metrics": {
            "finished_at": summary.get("finished_at"),
            "stale_sec": stale_sec,
            "max_stale_sec": config.max_stale_sec,
            "fail_streak": fail_streak,
            "fail_streak_threshold": config.fail_streak_threshold,
            "partial_streak": partial_streak,
            "partial_streak_threshold": config.partial_streak_threshold,
        },
    }


def _default_state() -> Dict[str, Any]:
    return {
        "schema_version": HEALTH_SCHEMA_VERSION,
        "last_status": "UNKNOWN",
        "last_alert_at": 0,
        "last_fingerprint": "",
        "updated_at": _now_iso(),
    }


def _load_state(path: Path) -> Dict[str, Any]:
    row = _default_state()
    loaded = _load_json(path)
    if not loaded:
        return row
    if str(loaded.get("schema_version", "")).strip() != HEALTH_SCHEMA_VERSION:
        return row
    row["last_status"] = str(loaded.get("last_status", "UNKNOWN")).strip() or "UNKNOWN"
    row["last_alert_at"] = int(loaded.get("last_alert_at", 0) or 0)
    row["last_fingerprint"] = str(loaded.get("last_fingerprint", "")).strip()
    row["updated_at"] = str(loaded.get("updated_at", "")).strip() or row["updated_at"]
    return row


def _build_alert_decision(
    *,
    assessment: Dict[str, Any],
    state: Dict[str, Any],
    now_epoch: int,
    cooldown_sec: int,
) -> Dict[str, Any]:
    status = str(assessment.get("status", "NORMAL"))
    fingerprint = str(assessment.get("fingerprint", ""))
    previous_status = str(state.get("last_status", "UNKNOWN"))
    previous_fingerprint = str(state.get("last_fingerprint", ""))
    last_alert_at = int(state.get("last_alert_at", 0) or 0)

    should_alert = False
    alert_kind = ""
    alert_fingerprint = ""

    if status in {"WARN", "CRITICAL"}:
        same_fingerprint = fingerprint == previous_fingerprint
        is_cooldown_active = same_fingerprint and (now_epoch - last_alert_at < cooldown_sec)
        if not is_cooldown_active:
            should_alert = True
            alert_kind = status
            alert_fingerprint = fingerprint
    elif status == "NORMAL" and previous_status in {"WARN", "CRITICAL"}:
        should_alert = True
        alert_kind = "RECOVERY"
        alert_fingerprint = f"RECOVERY:{previous_status}->{status}"

    return {
        "should_alert": should_alert,
        "alert_kind": alert_kind,
        "alert_fingerprint": alert_fingerprint,
        "previous_status": previous_status,
        "previous_fingerprint": previous_fingerprint,
    }


def _send_telegram_alert(bot_token: str, chat_id: str, text: str, timeout_sec: int = 10) -> Dict[str, Any]:
    if not bot_token or not chat_id:
        return {
            "ok": False,
            "error": "missing_telegram_credentials",
        }

    payload = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    request = urllib.request.Request(
        url=f"https://api.telegram.org/bot{bot_token}/sendMessage",
        data=payload,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:
            body = response.read().decode("utf-8", errors="replace")
            if response.status >= 400:
                return {"ok": False, "error": f"http_{response.status}", "body": body[:500]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}

    return {"ok": True}


def _render_alert_message(
    *,
    kind: str,
    assessment: Dict[str, Any],
    runtime_root: Path,
) -> str:
    metrics = assessment.get("metrics", {})
    reason = assessment.get("reason", "")
    if kind == "RECOVERY":
        return (
            "[email-fetch][RECOVERY] 수집기가 정상 상태로 복구되었습니다.\n"
            f"runtime={runtime_root}\n"
            f"last_finished_at={metrics.get('finished_at')}"
        )

    return (
        f"[email-fetch][{kind}] 수집기 이상 감지\n"
        f"reason={reason}\n"
        f"runtime={runtime_root}\n"
        f"finished_at={metrics.get('finished_at')}\n"
        f"stale_sec={metrics.get('stale_sec')}\n"
        f"fail_streak={metrics.get('fail_streak')}\n"
        f"partial_streak={metrics.get('partial_streak')}"
    )


def run_healthcheck(config: HealthConfig) -> Dict[str, Any]:
    now_epoch = _now_epoch()
    now_iso = _now_iso()

    state_path = config.runtime_root / "monitor" / "health_state.json"
    state = _load_state(state_path)
    assessment = _build_assessment(config, now_epoch)
    decision = _build_alert_decision(
        assessment=assessment,
        state=state,
        now_epoch=now_epoch,
        cooldown_sec=max(config.alert_cooldown_sec, 1),
    )

    alert_result: Dict[str, Any] = {
        "enabled": config.telegram_enabled,
        "sent": False,
        "kind": decision["alert_kind"],
        "error": "",
    }

    if decision["should_alert"] and config.telegram_enabled:
        message = _render_alert_message(
            kind=decision["alert_kind"],
            assessment=assessment,
            runtime_root=config.runtime_root,
        )
        sent = _send_telegram_alert(
            config.telegram_bot_token,
            config.telegram_chat_id,
            message,
        )
        alert_result["sent"] = bool(sent.get("ok", False))
        if not alert_result["sent"]:
            alert_result["error"] = str(sent.get("error", "alert_send_failed"))
    elif decision["should_alert"] and not config.telegram_enabled:
        alert_result["error"] = "telegram_alert_disabled"

    next_state = dict(state)
    next_state["last_status"] = assessment["status"]
    next_state["updated_at"] = now_iso
    if decision["should_alert"] and (alert_result["sent"] or not config.telegram_enabled):
        next_state["last_alert_at"] = now_epoch
        next_state["last_fingerprint"] = decision["alert_fingerprint"]

    _write_json_atomic(state_path, next_state)

    return {
        "schema_version": HEALTH_SCHEMA_VERSION,
        "checked_at": now_iso,
        "runtime_root": str(config.runtime_root),
        "status": assessment["status"],
        "reason": assessment["reason"],
        "fingerprint": assessment["fingerprint"],
        "metrics": assessment["metrics"],
        "previous_status": decision["previous_status"],
        "alert": alert_result,
        "monitor_state_file": str(state_path),
    }
