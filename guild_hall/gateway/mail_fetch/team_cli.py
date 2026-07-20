#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
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
    parser.add_argument(
        "--ingress-only",
        action="store_true",
        help="Write mailbox raw/events and collector state only; skip project history, candidates, notifications, and triggers.",
    )
    parser.add_argument(
        "--data-root",
        default="",
        help="Stable data root. Derives private config, inbox, runtime, and candidate paths without changing account secrets.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Override EMAIL_FETCH_LIMIT when >0.")
    parser.add_argument("--json", action="store_true", help="Print summary as JSON.")
    parser.add_argument("--register-origin", default="", help=argparse.SUPPRESS)
    parser.add_argument("--register-sha256", default="", help=argparse.SUPPRESS)
    parser.add_argument("--identity-manifest", default="", help=argparse.SUPPRESS)
    parser.add_argument("--identity-manifest-sha256", default="", help=argparse.SUPPRESS)
    return parser.parse_args()


def _digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _capsule_inputs(args: argparse.Namespace) -> tuple[dict, str] | None:
    values = (
        args.register_origin,
        args.register_sha256,
        args.identity_manifest,
        args.identity_manifest_sha256,
    )
    if not any(values):
        return None
    if not all(values):
        raise RuntimeError("mail_capsule_arguments_incomplete")

    from file_identity_guard import (  # noqa: PLC0415
        assert_runtime_identity,
        read_pinned_bytes,
    )

    manifest_bytes = read_pinned_bytes(
        Path(args.identity_manifest),
        unsafe_code="mail_identity_manifest_unsafe",
        mismatch_code="mail_identity_manifest_unstable",
    )
    if _digest(manifest_bytes) != args.identity_manifest_sha256:
        raise RuntimeError("mail_identity_manifest_digest_mismatch")
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    if not isinstance(manifest, dict) or set(manifest) != {
        "schema_version",
        "python",
        "credentials",
    } or manifest.get("schema_version") != "soulforge.ingress.mail_identity_manifest.v1":
        raise RuntimeError("mail_identity_manifest_invalid")
    runtime = manifest.get("python")
    if not isinstance(runtime, dict) or set(runtime) != {"identity", "sha256"}:
        raise RuntimeError("mail_identity_manifest_invalid")
    assert_runtime_identity(runtime.get("identity"), runtime.get("sha256"))

    register_bytes = read_pinned_bytes(
        Path(args.register),
        unsafe_code="mail_register_capsule_unsafe",
        mismatch_code="mail_register_capsule_unstable",
    )
    if _digest(register_bytes) != args.register_sha256:
        raise RuntimeError("mail_register_capsule_digest_mismatch")
    return manifest, register_bytes.decode("utf-8")


def _run(args: argparse.Namespace) -> int:
    repo_root, capsule_root = _resolve_paths()
    sys.path.insert(0, str(capsule_root))
    capsule_inputs = _capsule_inputs(args)

    from collector.team_mailboxes import (  # noqa: PLC0415
        default_register_path,
        load_team_mailbox_register,
        run_team_mailboxes,
    )
    from file_identity_guard import read_pinned_text  # noqa: PLC0415

    capsule_env_overrides = {}
    if args.data_root:
        data_root = Path(args.data_root).expanduser()
        if not data_root.is_absolute():
            print("[gateway-mail-fetch-team] error=data_root_must_be_absolute", file=sys.stderr)
            return 2
        data_root = data_root.resolve()
        capsule_env_overrides = {
            "EMAIL_FETCH_PRIVATE_CONFIG_ROOT": str(data_root / "config"),
            "EMAIL_FETCH_INBOX_ROOT": str(data_root / "ingress" / "mailbox"),
            "EMAIL_FETCH_RUNTIME_DIR": str(data_root / "runtime" / "mail_fetch"),
            "EMAIL_FETCH_MAIL_CANDIDATE_QUEUE_ROOT": str(data_root / "state" / "mail_candidate"),
        }
        os.environ.update(capsule_env_overrides)
    register_from_env = str(os.environ.get("EMAIL_FETCH_TEAM_REGISTER", "")).strip()
    register_file = (
        Path(args.register).expanduser()
        if args.register
        else (Path(register_from_env).expanduser() if register_from_env else default_register_path(repo_root))
    )
    mailboxes = None
    credential_texts = None
    if capsule_inputs is not None:
        manifest, register_text = capsule_inputs
        register_origin = Path(args.register_origin).expanduser()
        if not register_origin.is_absolute():
            raise RuntimeError("mail_register_origin_invalid")
        mailboxes = load_team_mailbox_register(
            repo_root=repo_root,
            register_file=register_origin,
            register_text=register_text,
        )
        credential_rows = manifest.get("credentials")
        if not isinstance(credential_rows, list):
            raise RuntimeError("mail_identity_manifest_invalid")
        identities = {}
        for row in credential_rows:
            if not isinstance(row, dict) or set(row) != {"env_file", "identity"}:
                raise RuntimeError("mail_identity_manifest_invalid")
            env_file = row.get("env_file")
            if not isinstance(env_file, str) or not env_file or env_file in identities:
                raise RuntimeError("mail_identity_manifest_invalid")
            identities[env_file] = row.get("identity")
        enabled_refs = {mailbox.env_file_ref for mailbox in mailboxes if mailbox.enabled}
        if set(identities) != enabled_refs:
            raise RuntimeError("mail_identity_manifest_invalid")
        credential_texts = {}
        for mailbox in mailboxes:
            if not mailbox.enabled:
                continue
            credential_texts[str(mailbox.env_file)] = read_pinned_text(
                mailbox.env_file,
                expected_identity=identities[mailbox.env_file_ref],
            )

    summary = run_team_mailboxes(
        repo_root=repo_root,
        register_file=register_file,
        dry_run=bool(args.dry_run),
        ingress_only=bool(args.ingress_only),
        limit=int(args.limit or 0),
        mailboxes=mailboxes,
        credential_texts_by_path=credential_texts,
        capsule_env_overrides=capsule_env_overrides if capsule_inputs is not None else None,
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


def main() -> int:
    args = _parse_args()
    try:
        return _run(args)
    except Exception as exc:  # noqa: BLE001
        payload = {
            "schema_version": "email.fetch.team_cli_error.v1",
            "error": {
                "code": "gateway_mail_fetch_team_cli_error",
                "type": type(exc).__name__,
                "message": str(getattr(exc, "code", "gateway_mail_fetch_team_cli_error")),
            },
        }
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
