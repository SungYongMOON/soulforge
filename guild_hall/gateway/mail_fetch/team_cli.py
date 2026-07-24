#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
from typing import Any


_NESTED_CREDENTIAL_SCHEMA = "soulforge.mail.nested_credentials.v1"
_NESTED_CREDENTIAL_ENV = "SOULFORGE_MAIL_NESTED_CREDENTIALS_B64"
_NESTED_CREDENTIAL_FIELD_BY_PROVIDER = {
    "gmail": "GMAIL_ACCESS_TOKEN_FILE",
    "hiworks": "HIWORKS_POP3_PASSWORD_FILE",
}
HPP_OUTLOOK_SENT_ALLOWED_WINDOWS_KST = "02:00-04:00,12:00-14:00"


def _resolve_paths() -> tuple[Path, Path]:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[3]
    capsule_root = script_path.parent
    return repo_root, capsule_root


def _hpp_capsule_env_overrides(data_root: Path) -> dict[str, str]:
    return {
        "EMAIL_FETCH_PRIVATE_CONFIG_ROOT": str(data_root / "config"),
        "EMAIL_FETCH_INBOX_ROOT": str(data_root / "ingress" / "mailbox"),
        "EMAIL_FETCH_RUNTIME_DIR": str(data_root / "runtime" / "mail_fetch"),
        "EMAIL_FETCH_MAIL_CANDIDATE_QUEUE_ROOT": str(data_root / "state" / "mail_candidate"),
        "OUTLOOK_SENT_ALLOWED_WINDOWS_KST": HPP_OUTLOOK_SENT_ALLOWED_WINDOWS_KST,
    }


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
    parser.add_argument("--private-config-root", default="", help=argparse.SUPPRESS)
    parser.add_argument("--discover-nested-credentials", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args()


def _digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _parse_env_text(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in str(text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _normalized_absolute(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(os.fspath(left)) == os.path.normcase(os.fspath(right))


def _inside(root: Path, target: Path) -> bool:
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def _plain_private_root(path: Path) -> Path:
    path = Path(path)
    if not path.is_absolute():
        raise RuntimeError("mail_nested_credential_root_invalid")
    lexical = _normalized_absolute(path)
    try:
        info = lexical.lstat()
        physical = lexical.resolve(strict=True)
    except OSError as exc:
        raise RuntimeError("mail_nested_credential_root_invalid") from exc
    if not stat.S_ISDIR(info.st_mode) or lexical.is_symlink() or not _same_path(lexical, physical):
        raise RuntimeError("mail_nested_credential_root_invalid")
    return lexical


def _plain_contained_file(path: Path, *, root: Path, code: str) -> Path:
    lexical = _normalized_absolute(path)
    if not _inside(root, lexical):
        raise RuntimeError(code)
    try:
        info = lexical.lstat()
        physical = lexical.resolve(strict=True)
    except OSError as exc:
        raise RuntimeError(code) from exc
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_nlink != 1
        or lexical.is_symlink()
        or not _same_path(lexical, physical)
    ):
        raise RuntimeError(code)
    return lexical


def _nested_credential_path(env_file: Path, raw_ref: str, *, private_root: Path) -> tuple[str, Path]:
    raw = str(raw_ref or "")
    if not raw or raw.strip() != raw:
        raise RuntimeError("mail_nested_credential_ref_invalid")
    normalized = raw.replace("\\", "/")
    if normalized.startswith(("/", "~")) or re.match(r"^[A-Za-z]:/", normalized):
        raise RuntimeError("mail_nested_credential_ref_invalid")
    parsed_parts = PurePosixPath(normalized).parts
    if not parsed_parts or any(part == ".." for part in parsed_parts):
        raise RuntimeError("mail_nested_credential_ref_invalid")
    parts = tuple(part for part in parsed_parts if part != ".")
    if not parts:
        raise RuntimeError("mail_nested_credential_ref_invalid")
    normalized = "/".join(parts)
    env_path = _plain_contained_file(
        env_file,
        root=private_root,
        code="mail_nested_credential_env_unsafe",
    )
    target = _plain_contained_file(
        env_path.parent.joinpath(*parts),
        root=private_root,
        code="mail_nested_credential_file_unsafe",
    )
    return normalized, target


def _expected_nested_credentials(
    mailboxes: list[Any],
    credential_texts: dict[str, str],
    private_config_root: Path,
) -> list[dict[str, str]]:
    private_root = _plain_private_root(private_config_root)
    expected: dict[tuple[str, str], dict[str, str]] = {}
    for mailbox in mailboxes:
        if not mailbox.enabled:
            continue
        credential_key = str(mailbox.env_file)
        if credential_key not in credential_texts:
            raise RuntimeError("mail_credential_not_preloaded")
        field = _NESTED_CREDENTIAL_FIELD_BY_PROVIDER.get(mailbox.provider)
        if field is None:
            continue
        raw_ref = _parse_env_text(credential_texts[credential_key]).get(field, "")
        if not raw_ref:
            continue
        normalized_ref, target = _nested_credential_path(
            mailbox.env_file,
            raw_ref,
            private_root=private_root,
        )
        key = (mailbox.env_file_ref, field)
        row = {
            "env_file": mailbox.env_file_ref,
            "field": field,
            "ref": normalized_ref,
            "path": str(target),
        }
        if key in expected and expected[key] != row:
            raise RuntimeError("mail_nested_credential_descriptor_invalid")
        expected[key] = row
    return [expected[key] for key in sorted(expected)]


def discover_nested_credentials(
    mailboxes: list[Any],
    credential_texts: dict[str, str],
    private_config_root: Path,
) -> dict[str, Any]:
    from file_identity_guard import file_identity  # noqa: PLC0415

    rows = []
    for expected in _expected_nested_credentials(mailboxes, credential_texts, private_config_root):
        rows.append({
            **expected,
            "identity": file_identity(
                Path(expected["path"]),
                unsafe_code="mail_nested_credential_file_unsafe",
            ),
        })
    return {
        "schema_version": _NESTED_CREDENTIAL_SCHEMA,
        "nested_credentials": rows,
    }


def preload_nested_credentials(
    payload: Any,
    mailboxes: list[Any],
    credential_texts: dict[str, str],
    private_config_root: Path,
) -> dict[str, str]:
    from file_identity_guard import normalize_identity, read_pinned_text  # noqa: PLC0415

    if not isinstance(payload, dict) or set(payload) != {"schema_version", "nested_credentials"}:
        raise RuntimeError("mail_nested_credential_descriptor_invalid")
    if payload.get("schema_version") != _NESTED_CREDENTIAL_SCHEMA:
        raise RuntimeError("mail_nested_credential_descriptor_invalid")
    rows = payload.get("nested_credentials")
    if not isinstance(rows, list):
        raise RuntimeError("mail_nested_credential_descriptor_invalid")
    expected_rows = _expected_nested_credentials(mailboxes, credential_texts, private_config_root)
    expected = {(row["env_file"], row["field"]): row for row in expected_rows}
    provided: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"env_file", "field", "ref", "path", "identity"}:
            raise RuntimeError("mail_nested_credential_descriptor_invalid")
        key = (row.get("env_file"), row.get("field"))
        if key in provided or key not in expected:
            raise RuntimeError("mail_nested_credential_descriptor_invalid")
        metadata = {field: row.get(field) for field in ("env_file", "field", "ref", "path")}
        if metadata != expected[key]:
            raise RuntimeError("mail_nested_credential_descriptor_invalid")
        provided[key] = {
            **metadata,
            "identity": normalize_identity(
                row.get("identity"),
                invalid_code="mail_nested_credential_descriptor_invalid",
            ),
        }
    if set(provided) != set(expected):
        raise RuntimeError("mail_nested_credential_descriptor_invalid")

    identities_by_path: dict[str, dict[str, str]] = {}
    for row in provided.values():
        path = str(row["path"])
        identity = row["identity"]
        if path in identities_by_path and identities_by_path[path] != identity:
            raise RuntimeError("mail_nested_credential_descriptor_invalid")
        identities_by_path[path] = identity
    return {
        path: read_pinned_text(
            Path(path),
            expected_identity=identity,
            unsafe_code="mail_nested_credential_file_unsafe",
            mismatch_code="mail_nested_credential_identity_mismatch",
        )
        for path, identity in identities_by_path.items()
    }


def _decode_nested_credential_payload(encoded: str) -> dict[str, Any]:
    if not encoded or len(encoded) > 1024 * 1024:
        raise RuntimeError("mail_nested_credential_descriptor_invalid")
    try:
        payload = base64.b64decode(encoded, validate=True)
        return json.loads(payload.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("mail_nested_credential_descriptor_invalid") from exc


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
    nested_credential_payload_b64 = os.environ.pop(_NESTED_CREDENTIAL_ENV, "")
    capsule_inputs = _capsule_inputs(args)
    if args.discover_nested_credentials and capsule_inputs is None:
        raise RuntimeError("mail_nested_credential_discovery_requires_capsule")

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
        capsule_env_overrides = _hpp_capsule_env_overrides(data_root)
        os.environ.update(capsule_env_overrides)
    register_from_env = str(os.environ.get("EMAIL_FETCH_TEAM_REGISTER", "")).strip()
    register_file = (
        Path(args.register).expanduser()
        if args.register
        else (Path(register_from_env).expanduser() if register_from_env else default_register_path(repo_root))
    )
    mailboxes = None
    credential_texts = None
    nested_credential_texts = None
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
        private_config_root = Path(args.private_config_root)
        if args.discover_nested_credentials:
            discovery = discover_nested_credentials(
                mailboxes,
                credential_texts,
                private_config_root,
            )
            print(json.dumps(discovery, ensure_ascii=True, separators=(",", ":")))
            return 0
        if nested_credential_payload_b64:
            nested_credential_texts = preload_nested_credentials(
                _decode_nested_credential_payload(nested_credential_payload_b64),
                mailboxes,
                credential_texts,
                private_config_root,
            )

    summary = run_team_mailboxes(
        repo_root=repo_root,
        register_file=register_file,
        dry_run=bool(args.dry_run),
        ingress_only=bool(args.ingress_only),
        limit=int(args.limit or 0),
        mailboxes=mailboxes,
        credential_texts_by_path=credential_texts,
        nested_credential_texts_by_path=nested_credential_texts,
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
