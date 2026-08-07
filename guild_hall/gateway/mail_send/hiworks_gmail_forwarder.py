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
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import poplib
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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    if data.get("account") != config.expected_account or data.get("target") != config.gmail_target:
        raise ValueError("state_account_mismatch")
    hashes = data.get("seen_uidl_hashes")
    if not isinstance(hashes, list) or not all(isinstance(item, str) for item in hashes):
        raise ValueError("state_schema_invalid")
    return data


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
        "schema_version": 2,
        "delivery_mode": "gmail_api_original_import",
        "account": config.expected_account,
        "target": config.gmail_target,
        "initialized_at": _now(),
        "updated_at": _now(),
        "seen_uidl_hashes": [_hash(uidl) for _, uidl in rows],
    }
    _write_json_atomic(_state_path(config), state)
    _append_event(config, {"action": "initialize", "status": "ok", "message_count": len(rows)})
    return {"status": "initialized", "baseline_count": len(rows), "imported_count": 0}


def run_cycle(
    config: ForwarderConfig,
    pop_factory: Callable[[ForwarderConfig], Any] = _pop_factory,
    gmail_importer: Callable[[ForwarderConfig, bytes], dict[str, Any]] = _gmail_importer,
) -> dict[str, Any]:
    state = _read_state(config)
    seen = set(state["seen_uidl_hashes"])
    client = pop_factory(config)
    imported_count = 0
    already_imported_count = 0
    failed_count = 0
    rows: list[tuple[int, str]] = []
    try:
        client.user(config.username)
        client.pass_(config.password)
        rows = _uidl_rows(client, config.max_seen)
        pending = [(number, uidl, _hash(uidl)) for number, uidl in rows if _hash(uidl) not in seen]
        for number, _, uidl_hash in pending:
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
                _append_event(
                    config,
                    {
                        "action": "import_original",
                        "status": "failed",
                        "uidl_sha256": uidl_hash,
                        "error": type(exc).__name__,
                    },
                )
    finally:
        try:
            client.quit()
        except Exception:
            pass

    retained = [_hash(uidl) for _, uidl in rows if _hash(uidl) in seen]
    state["schema_version"] = 2
    state["delivery_mode"] = "gmail_api_original_import"
    state["seen_uidl_hashes"] = retained[-config.max_seen :]
    state["updated_at"] = _now()
    _write_json_atomic(_state_path(config), state)
    result = {
        "status": "ok" if failed_count == 0 else "partial",
        "delivery_mode": "gmail_api_original_import",
        "observed_count": len(rows),
        "imported_count": imported_count,
        "already_imported_count": already_imported_count,
        "failed_count": failed_count,
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
        return 0 if result.get("failed_count", 0) == 0 else 2
    except Exception as exc:
        error = {"status": "failed", "error": type(exc).__name__, "reason": str(exc)}
        print(json.dumps(error, ensure_ascii=False) if args.json else f"failed: {error['reason']}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
