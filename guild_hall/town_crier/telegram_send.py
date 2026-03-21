#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import urllib.parse
import urllib.request


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


def _load_env(path: Path | None) -> dict[str, str]:
    payload: dict[str, str] = {}
    if path is not None:
        payload.update(_parse_env_file(path))
    payload.update(os.environ)
    return payload


def _resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_env_file(repo_root: Path) -> Path:
    return repo_root / "guild_hall" / "state" / "town_crier" / "telegram_notify.env"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send a one-shot Telegram notification for Soulforge town_crier.")
    parser.add_argument("--env-file", default="", help="Path to local telegram env file.")
    parser.add_argument("--text", default="", help="Inline message text.")
    parser.add_argument("--text-file", default="", help="Path to a UTF-8 text file containing the message.")
    parser.add_argument("--json", action="store_true", help="Print result as JSON.")
    return parser.parse_args()


def _read_message(args: argparse.Namespace) -> str:
    if args.text_file:
        return Path(args.text_file).expanduser().read_text(encoding="utf-8").strip()
    return str(args.text or "").strip()


def _send(bot_token: str, chat_id: str, text: str, timeout_sec: int = 10) -> dict[str, object]:
    if not bot_token or not chat_id:
        return {"ok": False, "error": "missing_telegram_credentials"}
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
            return {"ok": True, "status": response.status}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def main() -> int:
    repo_root = _resolve_repo_root()
    args = _parse_args()
    env_file = Path(args.env_file).expanduser() if args.env_file else _default_env_file(repo_root)
    env = _load_env(env_file)
    text = _read_message(args)
    if not text:
        raise SystemExit("message text is required")

    result = _send(
        str(env.get("TELEGRAM_BOT_TOKEN", "")).strip(),
        str(env.get("TELEGRAM_CHAT_ID", "")).strip(),
        text,
    )
    result["env_file"] = str(env_file)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(
            "[town-crier]",
            f"ok={result.get('ok')}",
            f"error={result.get('error', '')}",
        )
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
