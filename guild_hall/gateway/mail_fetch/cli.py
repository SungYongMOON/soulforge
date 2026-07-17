#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import time


def _resolve_paths() -> tuple[Path, Path]:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[3]
    capsule_root = script_path.parent
    return repo_root, capsule_root


def _default_env_file(repo_root: Path) -> Path:
    private_root = str(os.environ.get("EMAIL_FETCH_PRIVATE_CONFIG_ROOT", "")).strip()
    root = _resolve_private_root(repo_root, private_root) if private_root else repo_root
    return root / "guild_hall" / "state" / "gateway" / "mailbox" / "state" / "email_fetch.env"


def _resolve_private_root(repo_root: Path, raw: str) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = repo_root / path
    return path.resolve()


def _resolve_env_file(repo_root: Path, raw: str) -> Path:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path.resolve()
    private_root = str(os.environ.get("EMAIL_FETCH_PRIVATE_CONFIG_ROOT", "")).strip()
    root = _resolve_private_root(repo_root, private_root) if private_root else repo_root
    return (root / path).resolve()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Soulforge gateway mail fetch collector.")
    parser.add_argument(
        "--env-file",
        default="",
        help="Path to gateway mail fetch env file. Default: guild_hall/state/gateway/mailbox/state/email_fetch.env",
    )
    parser.add_argument("--once", action="store_true", help="Run once and exit (default if --loop not set).")
    parser.add_argument("--loop", action="store_true", help="Run in loop mode.")
    parser.add_argument("--interval-sec", type=int, default=300, help="Loop interval seconds (default: 300).")
    parser.add_argument("--dry-run", action="store_true", help="Do not write cursor/sink files.")
    parser.add_argument("--limit", type=int, default=0, help="Override EMAIL_FETCH_LIMIT when >0.")
    parser.add_argument("--json", action="store_true", help="Print summary as JSON.")
    return parser.parse_args()


def main() -> int:
    repo_root, capsule_root = _resolve_paths()
    sys.path.insert(0, str(capsule_root))

    from collector.runner import (  # noqa: PLC0415
        build_config_from_env,
        run_once,
        sanitize_for_operator_output,
    )

    args = _parse_args()
    env_from_var = str(os.environ.get("EMAIL_FETCH_ENV_FILE", "")).strip()
    env_file = (
        _resolve_env_file(repo_root, args.env_file)
        if args.env_file
        else (_resolve_env_file(repo_root, env_from_var) if env_from_var else _default_env_file(repo_root))
    )
    config = build_config_from_env(repo_root=repo_root, env_file=env_file)

    if args.dry_run:
        config.dry_run = True
    if args.limit and args.limit > 0:
        config.limit = int(args.limit)

    loop_mode = bool(args.loop)
    if not args.once and not args.loop:
        args.once = True

    def render(summary: dict) -> None:
        if args.json:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return
        print(
            "[gateway-mail-fetch]",
            f"events={summary.get('total_events', 0)}",
            f"new={summary.get('total_new_events', 0)}",
            f"dupe={summary.get('total_duplicates', 0)}",
            f"partial={summary.get('partial')}",
        )

    try:
        if loop_mode:
            interval = max(int(args.interval_sec), 10)
            while True:
                summary = run_once(config)
                render(summary)
                time.sleep(interval)

        summary = run_once(config)
        render(summary)
        return 0
    except Exception as exc:  # noqa: BLE001
        payload = sanitize_for_operator_output(
            {
                "schema_version": "email.fetch.cli_error.v1",
                "error": {
                    "code": "gateway_mail_fetch_cli_error",
                    "type": type(exc).__name__,
                    "message": str(exc),
                },
            }
        )
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)
        else:
            error = payload.get("error", {}) if isinstance(payload, dict) else {}
            print(
                "[gateway-mail-fetch]",
                f"error={error.get('code', 'gateway_mail_fetch_cli_error')}",
                f"type={error.get('type', 'unknown')}",
                f"message={error.get('message', '')}",
                file=sys.stderr,
            )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
