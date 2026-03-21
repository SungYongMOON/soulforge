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
    parser = argparse.ArgumentParser(description="Restore a state snapshot for Soulforge gateway mail fetch.")
    parser.add_argument("--env-file", default="", help="Path to gateway mail fetch env file.")
    parser.add_argument("--snapshot", default="", help="Snapshot id to restore.")
    parser.add_argument("--latest", action="store_true", help="Restore the latest snapshot.")
    parser.add_argument("--keep", type=int, default=0, help="Override backup keep count when >0.")
    parser.add_argument("--json", action="store_true", help="Print result as JSON.")
    return parser.parse_args()


def main() -> int:
    repo_root, capsule_root = _resolve_paths()
    sys.path.insert(0, str(capsule_root))

    from collector.ops.env_loader import env_int, load_env  # noqa: PLC0415
    from collector.ops.state_recovery import restore_state_snapshot  # noqa: PLC0415

    args = _parse_args()
    if not args.snapshot and not args.latest:
        raise SystemExit("either --snapshot or --latest is required")
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
    keep = args.keep if args.keep > 0 else max(env_int(env, "EMAIL_FETCH_STATE_BACKUP_KEEP", 30), 1)
    result = restore_state_snapshot(
        runtime_root,
        snapshot_id=str(args.snapshot or "").strip() or None,
        latest=bool(args.latest),
        keep=keep,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("[gateway-mail-fetch-restore]", f"restored_snapshot={result.get('snapshot_id')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
