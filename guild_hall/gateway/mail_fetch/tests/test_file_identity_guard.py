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

    runtime_path = Path(sys.executable)
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
