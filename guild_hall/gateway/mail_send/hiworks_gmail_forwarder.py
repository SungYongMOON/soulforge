#!/usr/bin/env python3
"""Import newly observed Hiworks POP3 messages into the owner's Gmail.

The scheduled task keeps its legacy filename so the existing runtime binding
does not break, but it no longer creates or sends wrapper emails through SMTP.
It retrieves each new RFC 822 message without POP3 deletion and imports those
exact bytes with Gmail API original-message semantics.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import poplib
import re
import ssl
import sys
from typing import Any, Callable

try:
    from .gmail_original_importer import MAX_IMPORT_BYTES, import_raw_message
except ImportError:  # Direct script execution from the scheduled task.
    from gmail_original_importer import MAX_IMPORT_BYTES, import_raw_message


DEFAULT_ACCOUNT = "seabot.moon@sonartech.com"
DEFAULT_GMAIL_TARGET = "seabot.moon@gmail.com"
DEFAULT_POP_HOST = "pop3s.hiworks.com"
FAILURE_THRESHOLD = 3
RETRY_BACKOFF_SECONDS = (5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60)
FAILURE_STATE_KEYS = {
    "failure_class",
    "failure_count",
    "last_attempt_at",
    "next_attempt_at",
}
FAILURE_CLASSES = {
    "error_timeout",
    "error_proto",
    "error_size",
    "error_import",
    "error_processing",
}
STATE_V2_KEYS = {
    "schema_version",
    "delivery_mode",
    "account",
    "target",
    "initialized_at",
    "updated_at",
    "seen_uidl_hashes",
}
STATE_V3_KEYS = {*STATE_V2_KEYS, "uidl_failures"}
SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class ForwarderConfig:
    account_env: Path
    state_root: Path
    expected_account: str
    gmail_target: str
    pop_host: str
    pop_port: int
    username: str
    password: str
    max_seen: int
    max_import_bytes: int
    timeout_sec: int
    gmail_config_root: Path
    oauth_client_path: Path
    oauth_token_path: Path
    receipt_root: Path


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _now() -> str:
    return _utc_now().isoformat()


def _parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _secret_from_env(env: dict[str, str], env_path: Path) -> str:
    direct = env.get("HIWORKS_POP3_PASSWORD", "").strip()
    if direct:
        return direct
    file_value = env.get("HIWORKS_POP3_PASSWORD_FILE", "").strip()
    if not file_value:
        return ""
    secret_path = Path(file_value)
    if not secret_path.is_absolute():
        secret_path = env_path.parent / secret_path
    base = env_path.parent.resolve()
    resolved = secret_path.resolve()
    try:
        resolved.relative_to(base)
    except ValueError as exc:
        raise ValueError("password_file_outside_account_config") from exc
    if resolved.is_symlink():
        raise ValueError("password_file_symlink_not_allowed")
    return resolved.read_text(encoding="utf-8").strip()


def load_config(
    account_env: Path,
    state_root: Path,
    gmail_config_root: Path,
    oauth_client_path: Path,
    oauth_token_path: Path,
    receipt_root: Path,
) -> ForwarderConfig:
    if not account_env.exists():
        raise ValueError("account_env_missing")
    env = _parse_env(account_env)
    username = env.get("HIWORKS_POP3_USERNAME", "").strip().lower()
    expected = os.environ.get("HIWORKS_GMAIL_FORWARD_EXPECTED_ACCOUNT", DEFAULT_ACCOUNT).strip().lower()
    if username != expected:
        raise ValueError("account_mismatch")
    password = _secret_from_env(env, account_env)
    if not password:
        raise ValueError("account_password_missing")
    return ForwarderConfig(
        account_env=account_env.resolve(),
        state_root=state_root.resolve(),
        expected_account=expected,
        gmail_target=os.environ.get("HIWORKS_GMAIL_FORWARD_TARGET", DEFAULT_GMAIL_TARGET).strip().lower(),
        pop_host=env.get("HIWORKS_POP3_HOST", DEFAULT_POP_HOST).strip(),
        pop_port=int(env.get("HIWORKS_POP3_PORT", "995")),
        username=username,
        password=password,
        max_seen=max(1, int(os.environ.get("HIWORKS_GMAIL_FORWARD_SEEN_WINDOW", "5000"))),
        max_import_bytes=max(1, int(os.environ.get("HIWORKS_GMAIL_IMPORT_MAX_BYTES", str(MAX_IMPORT_BYTES)))),
        timeout_sec=max(1, int(env.get("HIWORKS_POP3_TIMEOUT_SEC", "30"))),
        gmail_config_root=gmail_config_root.resolve(),
        oauth_client_path=oauth_client_path.resolve(),
        oauth_token_path=oauth_token_path.resolve(),
        receipt_root=receipt_root.resolve(),
    )


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def _state_path(config: ForwarderConfig) -> Path:
    return config.state_root / "state.json"


def _events_path(config: ForwarderConfig) -> Path:
    return config.state_root / "events.jsonl"


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def _append_event(config: ForwarderConfig, payload: dict[str, Any]) -> None:
    path = _events_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"observed_at": _now(), **payload}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


def _read_state(config: ForwarderConfig) -> dict[str, Any]:
    path = _state_path(config)
    if not path.exists():
        raise ValueError("baseline_not_initialized")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("state_schema_invalid")
    if data.get("account") != config.expected_account or data.get("target") != config.gmail_target:
        raise ValueError("state_account_mismatch")
    schema_version = data.get("schema_version")
    if schema_version not in {2, 3}:
        raise ValueError("state_schema_invalid")
    expected_keys = STATE_V2_KEYS if schema_version == 2 else STATE_V3_KEYS
    if set(data) != expected_keys:
        raise ValueError("state_schema_invalid")
    initialized_at = _parse_timestamp(data.get("initialized_at"))
    updated_at = _parse_timestamp(data.get("updated_at"))
    if (
        data.get("delivery_mode") != "gmail_api_original_import"
        or initialized_at is None
        or updated_at is None
        or initialized_at > updated_at
    ):
        raise ValueError("state_schema_invalid")
    hashes = data.get("seen_uidl_hashes")
    if (
        not isinstance(hashes, list)
        or not all(isinstance(item, str) and SHA256_HEX.fullmatch(item) for item in hashes)
        or len(hashes) != len(set(hashes))
        or len(hashes) > config.max_seen
    ):
        raise ValueError("state_schema_invalid")
    failures = data.get("uidl_failures", {}) if schema_version == 3 else {}
    if (
        not isinstance(failures, dict)
        or len(failures) > config.max_seen
        or not set(failures).isdisjoint(hashes)
    ):
        raise ValueError("state_schema_invalid")
    for uidl_hash, failure in failures.items():
        last_attempt_at = _parse_timestamp(failure.get("last_attempt_at")) if isinstance(failure, dict) else None
        next_attempt_at = _parse_timestamp(failure.get("next_attempt_at")) if isinstance(failure, dict) else None
        if (
            not isinstance(uidl_hash, str)
            or SHA256_HEX.fullmatch(uidl_hash) is None
            or not isinstance(failure, dict)
            or set(failure) != FAILURE_STATE_KEYS
            or failure.get("failure_class") not in FAILURE_CLASSES
            or not isinstance(failure.get("failure_count"), int)
            or isinstance(failure.get("failure_count"), bool)
            or failure["failure_count"] < 1
            or last_attempt_at is None
            or next_attempt_at is None
            or last_attempt_at > next_attempt_at
        ):
            raise ValueError("state_schema_invalid")
    # Version 2 had no retry ledger. Migrate it in memory without changing the
    # existing seen window; the next atomic state write completes migration.
    data["schema_version"] = 3
    data["uidl_failures"] = failures
    return data


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _failure_class(exc: Exception) -> str:
    if isinstance(exc, (TimeoutError, ssl.SSLError)):
        return "error_timeout"
    if isinstance(exc, poplib.error_proto):
        return "error_proto"
    if isinstance(exc, RuntimeError):
        reason = str(exc)
        if reason.startswith("pop_"):
            return "error_proto"
        if reason == "message_size_not_allowed":
            return "error_size"
        if reason.startswith("gmail_"):
            return "error_import"
    return "error_processing"


def _next_failure(
    previous: dict[str, Any] | None,
    failure_class: str,
    attempted_at: datetime,
) -> dict[str, Any]:
    previous_count = 0
    if previous and previous.get("failure_class") == failure_class:
        try:
            previous_count = max(0, int(previous.get("failure_count", 0)))
        except (TypeError, ValueError):
            previous_count = 0
    failure_count = previous_count + 1
    backoff = RETRY_BACKOFF_SECONDS[min(failure_count - 1, len(RETRY_BACKOFF_SECONDS) - 1)]
    return {
        "failure_class": failure_class,
        "failure_count": failure_count,
        "last_attempt_at": attempted_at.isoformat(),
        "next_attempt_at": (attempted_at + timedelta(seconds=backoff)).isoformat(),
    }


def _pop_factory(config: ForwarderConfig) -> poplib.POP3_SSL:
    return poplib.POP3_SSL(
        config.pop_host,
        config.pop_port,
        timeout=config.timeout_sec,
        context=ssl.create_default_context(),
    )


def _gmail_importer(config: ForwarderConfig, raw_message: bytes) -> dict[str, Any]:
    return import_raw_message(
        raw_message,
        config.oauth_client_path,
        None,
        config.oauth_token_path,
        config.gmail_config_root,
        config.receipt_root,
        allow_existing=True,
    )


def _uidl_rows(client: Any, max_seen: int) -> list[tuple[int, str]]:
    response, lines, _ = client.uidl()
    if not response.startswith(b"+OK"):
        raise RuntimeError("pop_uidl_failed")
    rows: list[tuple[int, str]] = []
    for raw in lines:
        parts = raw.decode("utf-8", errors="replace").split(maxsplit=1)
        if len(parts) != 2:
            continue
        rows.append((int(parts[0]), parts[1]))
    return rows[-max_seen:]


def initialize_baseline(
    config: ForwarderConfig,
    pop_factory: Callable[[ForwarderConfig], Any] = _pop_factory,
) -> dict[str, Any]:
    client = pop_factory(config)
    try:
        client.user(config.username)
        client.pass_(config.password)
        rows = _uidl_rows(client, config.max_seen)
    finally:
        try:
            client.quit()
        except Exception:
            pass
    state = {
        "schema_version": 3,
        "delivery_mode": "gmail_api_original_import",
        "account": config.expected_account,
        "target": config.gmail_target,
        "initialized_at": _now(),
        "updated_at": _now(),
        "seen_uidl_hashes": [_hash(uidl) for _, uidl in rows],
        "uidl_failures": {},
    }
    _write_json_atomic(_state_path(config), state)
    _append_event(config, {"action": "initialize", "status": "ok", "message_count": len(rows)})
    return {"status": "initialized", "baseline_count": len(rows), "imported_count": 0}


def run_cycle(
    config: ForwarderConfig,
    pop_factory: Callable[[ForwarderConfig], Any] = _pop_factory,
    gmail_importer: Callable[[ForwarderConfig, bytes], dict[str, Any]] = _gmail_importer,
    now: Callable[[], datetime] = _utc_now,
) -> dict[str, Any]:
    state = _read_state(config)
    seen = set(state["seen_uidl_hashes"])
    failures: dict[str, dict[str, Any]] = state["uidl_failures"]
    client = pop_factory(config)
    imported_count = 0
    already_imported_count = 0
    failed_count = 0
    deferred_count = 0
    held_count = 0
    rows: list[tuple[int, str]] = []
    try:
        client.user(config.username)
        client.pass_(config.password)
        rows = _uidl_rows(client, config.max_seen)
        pending = [(number, uidl, _hash(uidl)) for number, uidl in rows if _hash(uidl) not in seen]
        for number, _, uidl_hash in pending:
            cycle_now = now().astimezone(timezone.utc)
            previous_failure = failures.get(uidl_hash)
            due_at = _parse_timestamp(previous_failure.get("next_attempt_at")) if previous_failure else None
            if due_at is not None and due_at > cycle_now:
                deferred_count += 1
                if int(previous_failure.get("failure_count", 0)) >= FAILURE_THRESHOLD:
                    held_count += 1
                continue
            try:
                response, lines, _ = client.retr(number)
                if not response.startswith(b"+OK"):
                    raise RuntimeError("pop_retr_failed")
                raw_message = b"\r\n".join(lines) + b"\r\n"
                if len(raw_message) > config.max_import_bytes:
                    raise RuntimeError("message_size_not_allowed")
                import_result = gmail_importer(config, raw_message)
                status = str(import_result.get("status", ""))
                if status not in {"imported", "already_imported"}:
                    raise RuntimeError("gmail_import_status_invalid")
                seen.add(uidl_hash)
                failures.pop(uidl_hash, None)
                if status == "imported":
                    imported_count += 1
                else:
                    already_imported_count += 1
                _append_event(
                    config,
                    {
                        "action": "import_original",
                        "status": status,
                        "uidl_sha256": uidl_hash,
                        "message_bytes": len(raw_message),
                        "inbox_requested": bool(import_result.get("inbox_requested")),
                    },
                )
            except Exception as exc:
                failed_count += 1
                failure = _next_failure(previous_failure, _failure_class(exc), cycle_now)
                failures[uidl_hash] = failure
                if failure["failure_count"] >= FAILURE_THRESHOLD:
                    held_count += 1
                _append_event(
                    config,
                    {
                        "action": "import_original",
                        "status": "failed",
                        "uidl_sha256": uidl_hash,
                        **failure,
                    },
                )
    finally:
        try:
            client.quit()
        except Exception:
            pass

    retained = list(dict.fromkeys([*state["seen_uidl_hashes"], *seen]))[-config.max_seen :]
    state["schema_version"] = 3
    state["delivery_mode"] = "gmail_api_original_import"
    state["seen_uidl_hashes"] = retained
    state["uidl_failures"] = failures
    state["updated_at"] = _now()
    _write_json_atomic(_state_path(config), state)
    next_attempt_at = min(
        (failure["next_attempt_at"] for failure in failures.values()),
        default=None,
    )
    tracked_held_count = sum(
        1 for failure in failures.values()
        if int(failure["failure_count"]) >= FAILURE_THRESHOLD
    )
    result = {
        "status": "ok" if len(failures) == 0 else "partial",
        "collector_status": "ok",
        "retry_state": "clear" if len(failures) == 0
        else "held" if tracked_held_count > 0 else "retrying",
        "next_attempt_at": next_attempt_at,
        "delivery_mode": "gmail_api_original_import",
        "observed_count": len(rows),
        "imported_count": imported_count,
        "already_imported_count": already_imported_count,
        "failed_count": failed_count,
        "deferred_count": deferred_count,
        "held_count": held_count,
        "tracked_held_count": tracked_held_count,
        "tracked_failure_count": len(failures),
    }
    _append_event(config, {"action": "cycle", **result})
    return result


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import new Hiworks POP3 mail into the owner's Gmail Inbox.")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--initialize", action="store_true", help="Record current UIDLs without importing mail.")
    action.add_argument("--apply", action="store_true", help="Import only UIDLs absent from the baseline.")
    parser.add_argument("--account-env", required=True, help="Existing owner Hiworks account env file.")
    parser.add_argument("--state-root", required=True, help="Private local collector state directory.")
    parser.add_argument("--gmail-config-root", required=True, help="Private root containing Gmail OAuth files.")
    parser.add_argument("--oauth-client", required=True, help="Desktop OAuth client JSON path.")
    parser.add_argument("--oauth-token", required=True, help="Private Gmail import refresh-token JSON path.")
    parser.add_argument("--receipt-root", required=True, help="Private Gmail import receipt directory.")
    parser.add_argument("--json", action="store_true", help="Print a sanitized result object.")
    return parser.parse_args()


def main() -> int:
    args = _arguments()
    try:
        config = load_config(
            Path(args.account_env),
            Path(args.state_root),
            Path(args.gmail_config_root),
            Path(args.oauth_client),
            Path(args.oauth_token),
            Path(args.receipt_root),
        )
        result = initialize_baseline(config) if args.initialize else run_cycle(config)
        print(json.dumps(result, ensure_ascii=False) if args.json else result["status"])
        return 0 if result.get("status") in {"ok", "initialized"} else 2
    except Exception as exc:
        error = {"status": "failed", "error": type(exc).__name__, "reason": str(exc)}
        print(json.dumps(error, ensure_ascii=False) if args.json else f"failed: {error['reason']}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
