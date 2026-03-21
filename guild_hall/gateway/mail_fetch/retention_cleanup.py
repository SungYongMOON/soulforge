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


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run retention cleanup for Soulforge gateway mail fetch.")
    parser.add_argument("--env-file", default="", help="Path to gateway mail fetch env file.")
    parser.add_argument("--apply", action="store_true", help="Apply retention actions instead of report-only.")
    parser.add_argument("--json", action="store_true", help="Print result as JSON.")
    return parser.parse_args()


def main() -> int:
    repo_root, capsule_root = _resolve_paths()
    sys.path.insert(0, str(capsule_root))

    from collector.ops.env_loader import env_bool, env_int, load_env  # noqa: PLC0415
    from collector.ops.retention import RetentionConfig, run_retention_cleanup  # noqa: PLC0415

    args = _parse_args()
    env_file = Path(args.env_file).expanduser() if args.env_file else _default_env_file(repo_root)
    env = load_env(env_file)
    runtime_root = Path(
        str(
            env.get(
                "EMAIL_FETCH_RUNTIME_DIR",
                repo_root / "guild_hall" / "state" / "gateway" / "log" / "mail_fetch",
            )
        )
    ).expanduser()
    inbox_root = Path(
        str(
            env.get(
                "EMAIL_FETCH_INBOX_ROOT",
                repo_root / "guild_hall" / "state" / "gateway" / "mailbox",
            )
        )
    ).expanduser()
    report_only = not args.apply if args.apply else env_bool(env, "EMAIL_FETCH_RETENTION_REPORT_ONLY", True)
    result = run_retention_cleanup(
        RetentionConfig(
            runtime_root=runtime_root,
            inbox_root=inbox_root,
            report_only=report_only,
            trash_grace_days=max(env_int(env, "EMAIL_FETCH_RETENTION_TRASH_GRACE_DAYS", 14), 1),
        )
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(
            "[gateway-mail-fetch-retention]",
            f"report_only={result.get('report_only')}",
            f"report_path={result.get('report_path')}",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
