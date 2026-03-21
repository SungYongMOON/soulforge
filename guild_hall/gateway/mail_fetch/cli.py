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
    return repo_root / "guild_hall" / "state" / "gateway" / "mailbox" / "state" / "email_fetch.env"


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

    from collector.runner import build_config_from_env, run_once  # noqa: PLC0415

    args = _parse_args()
    env_from_var = str(os.environ.get("EMAIL_FETCH_ENV_FILE", "")).strip()
    env_file = (
        Path(args.env_file).expanduser()
        if args.env_file
        else (Path(env_from_var).expanduser() if env_from_var else _default_env_file(repo_root))
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
    except Exception:
        raise


if __name__ == "__main__":
    raise SystemExit(main())
