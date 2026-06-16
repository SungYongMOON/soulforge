#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys


def _resolve_paths() -> tuple[Path, Path]:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[3]
    capsule_root = script_path.parent
    return repo_root, capsule_root


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Soulforge gateway team mailbox fetch collector.")
    parser.add_argument(
        "--register",
        default="",
        help="Path to metadata-only team mailbox register. Default: guild_hall/state/gateway/mailbox/state/team_mailboxes.json",
    )
    parser.add_argument("--once", action="store_true", help="Run once and exit.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch without writing cursor/sink files.")
    parser.add_argument("--limit", type=int, default=0, help="Override EMAIL_FETCH_LIMIT when >0.")
    parser.add_argument("--json", action="store_true", help="Print summary as JSON.")
    return parser.parse_args()


def main() -> int:
    repo_root, capsule_root = _resolve_paths()
    sys.path.insert(0, str(capsule_root))

    from collector.runner import sanitize_for_operator_output  # noqa: PLC0415
    from collector.team_mailboxes import (  # noqa: PLC0415
        default_register_path,
        run_team_mailboxes,
    )

    args = _parse_args()
    register_from_env = str(os.environ.get("EMAIL_FETCH_TEAM_REGISTER", "")).strip()
    register_file = (
        Path(args.register).expanduser()
        if args.register
        else (Path(register_from_env).expanduser() if register_from_env else default_register_path(repo_root))
    )

    try:
        summary = run_team_mailboxes(
            repo_root=repo_root,
            register_file=register_file,
            dry_run=bool(args.dry_run),
            limit=int(args.limit or 0),
        )
        if args.json:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
        else:
            print(
                "[gateway-mail-fetch-team]",
                f"mailboxes={summary.get('mailboxes_enabled', 0)}",
                f"run={summary.get('mailboxes_run', 0)}",
                f"events={summary.get('total_events', 0)}",
                f"new={summary.get('total_new_events', 0)}",
                f"dupe={summary.get('total_duplicates', 0)}",
                f"partial={summary.get('partial')}",
            )
        return 0 if not summary.get("partial") else 1
    except Exception as exc:  # noqa: BLE001
        payload = sanitize_for_operator_output(
            {
                "schema_version": "email.fetch.team_cli_error.v1",
                "error": {
                    "code": "gateway_mail_fetch_team_cli_error",
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
                "[gateway-mail-fetch-team]",
                f"error={error.get('code', 'gateway_mail_fetch_team_cli_error')}",
                f"type={error.get('type', 'unknown')}",
                f"message={error.get('message', '')}",
                file=sys.stderr,
            )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
