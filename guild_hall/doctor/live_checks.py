#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import poplib
from pathlib import Path
import smtplib
import ssl
import sys
import urllib.request


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _parse_env_file(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def _load_env(path: Path) -> dict[str, str]:
    payload = _parse_env_file(path)
    payload.update(os.environ)
    return payload


def _resolve_secret(env: dict[str, str], key: str, file_key: str, base_dir: Path) -> str:
    value = str(env.get(key, "")).strip()
    if value:
        return value
    file_value = str(env.get(file_key, "")).strip()
    if not file_value:
        return ""
    secret_path = Path(file_value).expanduser()
    if not secret_path.is_absolute():
        secret_path = (base_dir / secret_path).resolve()
    if not secret_path.exists():
        return ""
    return secret_path.read_text(encoding="utf-8").strip()


def _bool(value: str, default: bool = False) -> bool:
    lowered = str(value or "").strip().lower()
    if lowered in {"1", "true", "yes", "on"}:
        return True
    if lowered in {"0", "false", "no", "off"}:
        return False
    return default


def _result(check_id: str, label: str, status: str, detail: str, required: bool = True) -> dict[str, object]:
    return {
        "id": check_id,
        "label": label,
        "category": "live_smoke",
        "required": required,
        "status": status,
        "detail": detail,
    }


def _check_hiworks_pop3(repo_root: Path) -> dict[str, object]:
    env_path = repo_root / "guild_hall" / "state" / "gateway" / "mailbox" / "state" / "email_fetch.env"
    if not env_path.exists():
        return _result("hiworks_pop3_live", "Hiworks POP3 live auth", "blocked", f"missing env: {env_path}")
    env = _load_env(env_path)
    if not _bool(env.get("EMAIL_FETCH_SOURCE_HIWORKS_ENABLED", ""), default=True):
        return _result("hiworks_pop3_live", "Hiworks POP3 live auth", "skipped", "hiworks source disabled")

    host = str(env.get("HIWORKS_POP3_HOST", "")).strip()
    port = int(str(env.get("HIWORKS_POP3_PORT", "995") or "995"))
    username = str(env.get("HIWORKS_POP3_USERNAME", "")).strip()
    password = _resolve_secret(env, "HIWORKS_POP3_PASSWORD", "HIWORKS_POP3_PASSWORD_FILE", env_path.parent)
    use_ssl = _bool(env.get("HIWORKS_POP3_USE_SSL", ""), default=True)
    timeout_sec = int(str(env.get("HIWORKS_POP3_TIMEOUT_SEC", "30") or "30"))

    if not host or not username or not password:
        return _result("hiworks_pop3_live", "Hiworks POP3 live auth", "blocked", "missing host/username/password")

    client = None
    try:
        if use_ssl:
            client = poplib.POP3_SSL(host, port, timeout=timeout_sec)
        else:
            client = poplib.POP3(host, port, timeout=timeout_sec)
        client.user(username)
        client.pass_(password)
        client.quit()
        return _result("hiworks_pop3_live", "Hiworks POP3 live auth", "ok", f"authenticated: {host}:{port}")
    except Exception as exc:  # noqa: BLE001
        try:
            if client is not None:
                client.quit()
        except Exception:  # noqa: BLE001
            pass
        return _result("hiworks_pop3_live", "Hiworks POP3 live auth", "failed", str(exc))


def _check_hiworks_smtp(repo_root: Path) -> dict[str, object]:
    env_path = repo_root / "guild_hall" / "state" / "gateway" / "mailbox" / "state" / "mail_send.env"
    if not env_path.exists():
        return _result("hiworks_smtp_live", "Hiworks SMTP live auth", "blocked", f"missing env: {env_path}")
    env = _load_env(env_path)

    host = str(env.get("HIWORKS_SMTP_HOST", "")).strip()
    port = int(str(env.get("HIWORKS_SMTP_PORT", "465") or "465"))
    username = str(env.get("HIWORKS_SMTP_USERNAME", "")).strip()
    password = _resolve_secret(env, "HIWORKS_SMTP_PASSWORD", "HIWORKS_SMTP_PASSWORD_FILE", env_path.parent)
    use_ssl = _bool(env.get("HIWORKS_SMTP_USE_SSL", ""), default=False)
    use_starttls = _bool(env.get("HIWORKS_SMTP_USE_STARTTLS", ""), default=False)

    if not host or not username or not password:
        return _result("hiworks_smtp_live", "Hiworks SMTP live auth", "blocked", "missing host/username/password")

    try:
        if use_ssl:
            client = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            client = smtplib.SMTP(host, port, timeout=15)
            client.ehlo()
            if use_starttls:
                context = ssl.create_default_context()
                client.starttls(context=context)
                client.ehlo()
        client.login(username, password)
        client.quit()
        return _result("hiworks_smtp_live", "Hiworks SMTP live auth", "ok", f"authenticated: {host}:{port}")
    except Exception as exc:  # noqa: BLE001
        try:
            client.quit()
        except Exception:  # noqa: BLE001
            pass
        return _result("hiworks_smtp_live", "Hiworks SMTP live auth", "failed", str(exc))


def _check_telegram(repo_root: Path) -> dict[str, object]:
    env_path = repo_root / "guild_hall" / "state" / "town_crier" / "telegram_notify.env"
    if not env_path.exists():
        return _result("telegram_live", "Telegram live auth", "blocked", f"missing env: {env_path}")
    env = _load_env(env_path)
    token = str(env.get("TELEGRAM_BOT_TOKEN", "")).strip()
    chat_id = str(env.get("TELEGRAM_CHAT_ID", "")).strip()
    if not token or not chat_id:
        return _result("telegram_live", "Telegram live auth", "blocked", "missing token/chat_id")

    url = f"https://api.telegram.org/bot{token}/getMe"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace")
            payload = json.loads(body)
            if response.status >= 400 or not payload.get("ok"):
                return _result("telegram_live", "Telegram live auth", "failed", body[:500])
            username = payload.get("result", {}).get("username", "")
            return _result("telegram_live", "Telegram live auth", "ok", f"bot reachable: {username or 'unknown'}")
    except Exception as exc:  # noqa: BLE001
        return _result("telegram_live", "Telegram live auth", "failed", str(exc))


def main() -> int:
    repo_root = _repo_root()
    results = [
        _check_hiworks_pop3(repo_root),
        _check_hiworks_smtp(repo_root),
        _check_telegram(repo_root),
    ]
    ok = all(item["status"] == "ok" for item in results)
    payload = {
        "mode": "live",
        "repo_root": str(repo_root),
        "ready": ok,
        "results": results,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
