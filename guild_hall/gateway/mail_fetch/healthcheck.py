#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


def _resolve_paths() -> tuple[Path, Path]:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[3]
    capsule_root = script_path.parent
    return repo_root, capsule_root


def _default_env_file(repo_root: Path) -> Path:
    return repo_root / "guild_hall" / "state" / "gateway" / "mailbox" / "state" / "email_fetch.env"


def _default_telegram_env_file(repo_root: Path) -> Path:
    return repo_root / "guild_hall" / "state" / "town_crier" / "telegram_notify.env"


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


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Soulforge gateway mail fetch healthcheck.")
    parser.add_argument(
        "--env-file",
        default="",
        help="Path to gateway mail fetch env file. Default: guild_hall/state/gateway/mailbox/state/email_fetch.env",
    )
    parser.add_argument("--json", action="store_true", help="Print result as JSON.")
    return parser.parse_args()


def main() -> int:
    repo_root, capsule_root = _resolve_paths()
    sys.path.insert(0, str(capsule_root))

    from collector.ops.env_loader import env_int, load_env  # noqa: PLC0415
    from collector.ops.healthcheck import HealthConfig, run_healthcheck  # noqa: PLC0415

    args = _parse_args()
    env_file = Path(args.env_file).expanduser() if args.env_file else _default_env_file(repo_root)
    env = load_env(env_file)
    telegram_env = _parse_env_file(_default_telegram_env_file(repo_root))
    runtime_root = Path(
        str(
            env.get(
                "EMAIL_FETCH_RUNTIME_DIR",
                repo_root / "guild_hall" / "state" / "gateway" / "log" / "mail_fetch",
            )
        )
    ).expanduser()

    result = run_healthcheck(
        HealthConfig(
            runtime_root=runtime_root,
            max_stale_sec=max(env_int(env, "EMAIL_FETCH_HEALTH_MAX_STALE_SEC", 900), 1),
            fail_streak_threshold=max(env_int(env, "EMAIL_FETCH_HEALTH_FAIL_STREAK", 2), 1),
            partial_streak_threshold=max(env_int(env, "EMAIL_FETCH_HEALTH_PARTIAL_STREAK", 3), 1),
            alert_cooldown_sec=max(env_int(env, "EMAIL_FETCH_HEALTH_ALERT_COOLDOWN_SEC", 3600), 1),
            telegram_enabled=False,
            telegram_bot_token=str(telegram_env.get("TELEGRAM_BOT_TOKEN", "")).strip(),
            telegram_chat_id=str(telegram_env.get("TELEGRAM_CHAT_ID", "")).strip(),
        )
    )

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(
            "[gateway-mail-fetch-healthcheck]",
            f"status={result.get('status')}",
            f"reason={result.get('reason')}",
            f"alert_sent={result.get('alert', {}).get('sent')}",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
