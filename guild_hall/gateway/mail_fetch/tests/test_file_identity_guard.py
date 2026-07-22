from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest

import file_identity_guard
from file_identity_guard import CredentialIdentityError, file_identity, read_pinned_text
import collector.team_mailboxes as team_mailboxes
import team_cli


def test_path_swap_between_identity_pin_and_open_fails_before_use(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credential = tmp_path / "mailbox.env"
    replacement = tmp_path / "replacement.env"
    credential.write_text("SYNTHETIC_VALUE=trusted\n", encoding="utf-8")
    replacement.write_text("SYNTHETIC_VALUE=swapped\n", encoding="utf-8")
    expected = file_identity(credential, unsafe_code="unsafe")
    real_open = file_identity_guard._open_readonly
    swapped = False
    credential_open_count = 0

    def swap_then_open(path: Path, *, unsafe_code: str) -> int:
        nonlocal credential_open_count, swapped
        if Path(path) == credential:
            credential_open_count += 1
            if credential_open_count == 2:
                swapped = True
                os.replace(replacement, credential)
        return real_open(path, unsafe_code=unsafe_code)

    monkeypatch.setattr(file_identity_guard, "_open_readonly", swap_then_open)
    side_effects = []
    with pytest.raises(CredentialIdentityError, match="mail_credential_identity_mismatch"):
        value = read_pinned_text(credential, expected_identity=expected)
        side_effects.append(value)

    assert swapped is True
    assert side_effects == []


def test_team_cli_rejects_credential_swap_before_mailbox_runner(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data_root = tmp_path / "data"
    config_root = data_root / "config"
    capsule_root = tmp_path / "capsule"
    config_root.mkdir(parents=True)
    capsule_root.mkdir()
    credential = config_root / "mailbox.env"
    replacement = config_root / "replacement.env"
    credential.write_text("SYNTHETIC_VALUE=trusted\n", encoding="utf-8")
    replacement.write_text("SYNTHETIC_VALUE=swapped\n", encoding="utf-8")
    register_origin = config_root / "team_mailboxes.json"
    register_snapshot = capsule_root / "team_mailboxes.json"
    register_text = json.dumps(
        {
            "schema_version": "email.fetch.team_mailbox_register.v1",
            "mailboxes": [
                {
                    "id": "synthetic",
                    "email": "synthetic@example.test",
                    "provider": "gmail",
                    "enabled": True,
                    "env_file": "mailbox.env",
                }
            ],
        }
    ) + "\n"
    register_snapshot.write_bytes(register_text.encode("utf-8"))

    runtime_path = Path(sys.executable).resolve(strict=True)
    runtime_sha256 = hashlib.sha256(runtime_path.read_bytes()).hexdigest()
    manifest = {
        "schema_version": "soulforge.ingress.mail_identity_manifest.v1",
        "python": {
            "identity": file_identity(runtime_path, unsafe_code="unsafe"),
            "sha256": runtime_sha256,
        },
        "credentials": [
            {
                "env_file": "mailbox.env",
                "identity": file_identity(credential, unsafe_code="unsafe"),
            }
        ],
    }
    manifest_text = json.dumps(manifest) + "\n"
    manifest_path = capsule_root / "identity-manifest.json"
    manifest_path.write_bytes(manifest_text.encode("utf-8"))
    args = argparse.Namespace(
        register=str(register_snapshot),
        once=True,
        dry_run=False,
        ingress_only=True,
        data_root=str(data_root),
        limit=25,
        json=True,
        register_origin=str(register_origin),
        register_sha256=hashlib.sha256(register_text.encode("utf-8")).hexdigest(),
        identity_manifest=str(manifest_path),
        identity_manifest_sha256=hashlib.sha256(manifest_text.encode("utf-8")).hexdigest(),
        private_config_root=str(config_root),
        discover_nested_credentials=False,
    )
    real_open = file_identity_guard._open_readonly
    swapped = False
    credential_open_count = 0
    mailbox_runner_called = False

    def swap_then_open(path: Path, *, unsafe_code: str) -> int:
        nonlocal credential_open_count, swapped
        if Path(path) == credential:
            credential_open_count += 1
            if credential_open_count == 2:
                swapped = True
                os.replace(replacement, credential)
        return real_open(path, unsafe_code=unsafe_code)

    def mailbox_runner(**_kwargs: object) -> dict:
        nonlocal mailbox_runner_called
        mailbox_runner_called = True
        return {}

    monkeypatch.setenv("EMAIL_FETCH_PRIVATE_CONFIG_ROOT", str(data_root / "config"))
    monkeypatch.setenv("EMAIL_FETCH_INBOX_ROOT", str(data_root / "ingress" / "mailbox"))
    monkeypatch.setenv("EMAIL_FETCH_RUNTIME_DIR", str(data_root / "runtime" / "mail_fetch"))
    monkeypatch.setenv("EMAIL_FETCH_MAIL_CANDIDATE_QUEUE_ROOT", str(data_root / "state" / "mail_candidate"))
    monkeypatch.setattr(file_identity_guard.sys, "executable", str(runtime_path))
    monkeypatch.setattr(file_identity_guard, "_open_readonly", swap_then_open)
    monkeypatch.setattr(team_mailboxes, "run_team_mailboxes", mailbox_runner)
    with pytest.raises(CredentialIdentityError, match="mail_credential_identity_mismatch"):
        team_cli._run(args)

    assert swapped is True
    assert mailbox_runner_called is False


@pytest.mark.skipif(os.name != "nt", reason="Windows ChangeTime contract")
def test_windows_identity_matches_node_bigint_stat(tmp_path: Path) -> None:
    target = tmp_path / "identity.txt"
    target.write_text("synthetic\n", encoding="utf-8")
    script = """
const fs = require("fs");
const info = fs.statSync(process.argv[1], { bigint: true });
console.log(JSON.stringify({
  dev: String(info.dev),
  ino: String(info.ino),
  size: String(info.size),
  mtime_ns: String(info.mtimeNs),
  birthtime_ns: String(info.birthtimeNs),
  change_ns: String(info.ctimeNs),
}));
"""
    completed = subprocess.run(
        ["node", "-e", script, str(target)],
        check=True,
        capture_output=True,
        text=True,
    )

    assert file_identity(target, unsafe_code="unsafe") == json.loads(completed.stdout)


@pytest.mark.skipif(os.name != "nt", reason="Windows ChangeTime contract")
def test_same_size_edit_with_restored_mtime_changes_identity(tmp_path: Path) -> None:
    credential = tmp_path / "mailbox.env"
    credential.write_text("trusted\n", encoding="utf-8")
    expected = file_identity(credential, unsafe_code="unsafe")
    original = credential.stat()

    time.sleep(0.02)
    credential.write_text("changed\n", encoding="utf-8")
    os.utime(credential, ns=(original.st_atime_ns, original.st_mtime_ns))
    changed = file_identity(credential, unsafe_code="unsafe")

    assert changed["size"] == expected["size"]
    assert changed["mtime_ns"] == expected["mtime_ns"]
    assert changed["change_ns"] != expected["change_ns"]
    with pytest.raises(CredentialIdentityError, match="mail_credential_identity_mismatch"):
        read_pinned_text(credential, expected_identity=expected)


def test_non_regular_path_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(CredentialIdentityError, match="unsafe"):
        file_identity(tmp_path, unsafe_code="unsafe")


def test_reparse_path_is_rejected(tmp_path: Path) -> None:
    target = tmp_path / "target.txt"
    link = tmp_path / "target-link.txt"
    target.write_text("synthetic\n", encoding="utf-8")
    try:
        link.symlink_to(target)
    except OSError:
        pytest.skip("symlink creation is unavailable")
    with pytest.raises(CredentialIdentityError, match="unsafe"):
        file_identity(link, unsafe_code="unsafe")


def _nested_mailbox_fixture(tmp_path: Path, nested_ref: str = "./secrets/password.txt") -> tuple:
    config_root = tmp_path / "config"
    config_root.mkdir()
    register = config_root / "team_mailboxes.json"
    register.write_text(
        json.dumps(
            {
                "schema_version": "email.fetch.team_mailbox_register.v1",
                "mailboxes": [
                    {
                        "id": "synthetic",
                        "email": "synthetic@example.test",
                        "provider": "hiworks",
                        "enabled": True,
                        "env_file": "mailbox.env",
                    }
                ],
            }
        )
        + "\n",
        encoding="utf-8",
    )
    env_file = config_root / "mailbox.env"
    env_text = "\n".join(
        [
            "HIWORKS_POP3_HOST=pop3.example.test",
            "HIWORKS_POP3_USERNAME=synthetic",
            f"HIWORKS_POP3_PASSWORD_FILE={nested_ref}",
            "",
        ]
    )
    env_file.write_text(env_text, encoding="utf-8")
    mailboxes = team_mailboxes.load_team_mailbox_register(tmp_path, register)
    return config_root, register, env_file, env_text, mailboxes


def test_capsule_nested_password_file_is_preloaded_before_mailbox_effect(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_root, register, env_file, env_text, mailboxes = _nested_mailbox_fixture(tmp_path)
    password_file = config_root / "secrets" / "password.txt"
    password_file.parent.mkdir()
    password_file.write_text("synthetic-password\n", encoding="utf-8")
    credential_texts = {str(env_file): env_text}

    discovery = team_cli.discover_nested_credentials(mailboxes, credential_texts, config_root)
    serialized = json.dumps(discovery)
    assert "synthetic-password" not in serialized
    nested_texts = team_cli.preload_nested_credentials(
        discovery,
        mailboxes,
        credential_texts,
        config_root,
    )
    seen = []

    def fake_run_once(config: object) -> dict:
        seen.append(config.hiworks_pop3_password)
        return {
            "partial": False,
            "total_events": 0,
            "total_new_events": 0,
            "total_duplicates": 0,
        }

    monkeypatch.setattr(team_mailboxes.runner, "run_once", fake_run_once)
    summary = team_mailboxes.run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        mailboxes=mailboxes,
        credential_texts_by_path=credential_texts,
        nested_credential_texts_by_path=nested_texts,
        capsule_env_overrides={"EMAIL_FETCH_RUNTIME_DIR": str(tmp_path / "runtime")},
    )

    assert seen == ["synthetic-password"]
    assert summary["partial"] is False
    assert "synthetic-password" not in json.dumps(summary)


def test_capsule_nested_gmail_token_file_is_preloaded_without_persistence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_root = tmp_path / "config"
    config_root.mkdir()
    register = config_root / "team_mailboxes.json"
    register.write_text(
        json.dumps(
            {
                "schema_version": "email.fetch.team_mailbox_register.v1",
                "mailboxes": [
                    {
                        "id": "gmail-synthetic",
                        "email": "gmail@example.test",
                        "provider": "gmail",
                        "enabled": True,
                        "env_file": "gmail.env",
                    }
                ],
            }
        )
        + "\n",
        encoding="utf-8",
    )
    env_file = config_root / "gmail.env"
    env_text = "GMAIL_ACCESS_TOKEN_FILE=secrets/gmail-token.json\n"
    env_file.write_text(env_text, encoding="utf-8")
    token_file = config_root / "secrets" / "gmail-token.json"
    token_file.parent.mkdir()
    token_file.write_text(json.dumps({"access_token": "synthetic-token"}) + "\n", encoding="utf-8")
    mailboxes = team_mailboxes.load_team_mailbox_register(tmp_path, register)
    credential_texts = {str(env_file): env_text}
    discovery = team_cli.discover_nested_credentials(mailboxes, credential_texts, config_root)
    nested_texts = team_cli.preload_nested_credentials(
        discovery,
        mailboxes,
        credential_texts,
        config_root,
    )
    seen = []

    def fake_run_once(config: object) -> dict:
        seen.append((config.gmail_access_token, config.gmail_token_store_file))
        return {
            "partial": False,
            "total_events": 0,
            "total_new_events": 0,
            "total_duplicates": 0,
        }

    monkeypatch.setattr(team_mailboxes.runner, "run_once", fake_run_once)
    summary = team_mailboxes.run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        mailboxes=mailboxes,
        credential_texts_by_path=credential_texts,
        nested_credential_texts_by_path=nested_texts,
        capsule_env_overrides={"EMAIL_FETCH_RUNTIME_DIR": str(tmp_path / "runtime")},
    )

    assert seen == [("synthetic-token", None)]
    assert summary["partial"] is False
    assert "synthetic-token" not in json.dumps(summary)


def test_capsule_nested_credential_path_escape_is_rejected(tmp_path: Path) -> None:
    config_root, _register, env_file, env_text, mailboxes = _nested_mailbox_fixture(
        tmp_path,
        "../outside-password.txt",
    )
    (tmp_path / "outside-password.txt").write_text("synthetic\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="mail_nested_credential_ref_invalid"):
        team_cli.discover_nested_credentials(
            mailboxes,
            {str(env_file): env_text},
            config_root,
        )


def test_capsule_nested_credential_reparse_path_is_rejected(tmp_path: Path) -> None:
    config_root, _register, env_file, env_text, mailboxes = _nested_mailbox_fixture(
        tmp_path,
        "linked/password.txt",
    )
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "password.txt").write_text("synthetic\n", encoding="utf-8")
    link = config_root / "linked"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("symlink or junction creation is unavailable")

    with pytest.raises(RuntimeError, match="mail_nested_credential_file_unsafe"):
        team_cli.discover_nested_credentials(
            mailboxes,
            {str(env_file): env_text},
            config_root,
        )


def test_capsule_nested_credential_identity_replacement_is_rejected(tmp_path: Path) -> None:
    config_root, _register, env_file, env_text, mailboxes = _nested_mailbox_fixture(tmp_path)
    password_file = config_root / "secrets" / "password.txt"
    password_file.parent.mkdir()
    password_file.write_text("synthetic-original\n", encoding="utf-8")
    replacement = config_root / "replacement.txt"
    replacement.write_text("synthetic-swapped\n", encoding="utf-8")
    credential_texts = {str(env_file): env_text}
    discovery = team_cli.discover_nested_credentials(mailboxes, credential_texts, config_root)
    os.replace(replacement, password_file)

    with pytest.raises(CredentialIdentityError, match="mail_nested_credential_identity_mismatch"):
        team_cli.preload_nested_credentials(
            discovery,
            mailboxes,
            credential_texts,
            config_root,
        )
