from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

import collector.outlook_sent as outlook_sent
from collector.outlook_sent import (
    OutlookSentConfig,
    OutlookSentError,
    build_outlook_sent_config,
    build_outlook_sent_powershell_script,
    run_outlook_sent,
)


STORE_PIN = f"sha256:{'1' * 64}"
FOLDER_PIN = f"sha256:{'2' * 64}"
NOW = datetime(2026, 7, 23, 6, 0, 0, tzinfo=timezone.utc)


def _digest(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def _config(tmp_path: Path, **overrides) -> OutlookSentConfig:
    values = {
        "enabled": True,
        "dry_run": False,
        "capsule_bound": True,
        "source_custody_root": tmp_path / "data" / "ingress" / "mail" / "source_custody",
        "shadow_state_file": tmp_path / "data" / "runtime" / "outlook_sent_shadow.json",
        "source_ref": "source_outlook_sent:synthetic",
        "source_scope_ref": "scope_outlook_sent:synthetic",
        "account_ref": "account:synthetic",
        "account_role": "team",
        "folder_ref": "folder:synthetic",
        "default_store_fingerprint": STORE_PIN,
        "default_folder_fingerprint": FOLDER_PIN,
        "overlap_seconds": 300,
        "initial_window_seconds": 3600,
        "max_items": 10,
        "max_msg_bytes": 1024 * 1024,
        "allowed_windows_kst": (
            (15 * 60, 15 * 60 + 1),
            (15 * 60 + 1, 15 * 60 + 2),
        ),
    }
    values.update(overrides)
    return OutlookSentConfig(**values)


def _exporter(
    *,
    body: bytes = b"synthetic unicode msg with body and attachment bytes",
    message_id: str = "<mail-001@example.test>",
    native: str = "store-entry-001",
    truncated: bool = False,
    gaps: list[str] | None = None,
    recipient_seed: str = "private-recipient@example.test",
    sent_at: str = "2026-07-23T05:59:00Z",
):
    def export(config, staging_root, window_start, window_end):
        assert window_start < window_end
        staged = staging_root / "opaque.msg"
        staged.write_bytes(body)
        return {
            "store_fingerprint": config.default_store_fingerprint,
            "folder_fingerprint": config.default_folder_fingerprint,
            "records": [
                {
                    "staged_msg": str(staged),
                    "rfc_message_id": message_id,
                    "native_observation_fingerprint": _digest(native),
                    "sent_at": sent_at,
                    "recipients": [
                        {
                            "role": "to",
                            "party_ref": f"party:{hashlib.sha256(recipient_seed.encode()).hexdigest()}",
                        },
                        {
                            "role": "bcc",
                            "party_ref": f"party:{hashlib.sha256(b'private-bcc').hexdigest()}",
                        },
                    ],
                }
            ],
            "truncated": truncated,
            "gap_codes": list(gaps or []),
        }

    return export


def test_feature_off_and_dry_run_never_call_exporter_or_write(tmp_path: Path) -> None:
    calls = 0

    def forbidden(*_args):
        nonlocal calls
        calls += 1
        raise AssertionError("exporter must not run")

    off = run_outlook_sent(_config(tmp_path, enabled=False), exporter=forbidden, now=NOW)
    dry = run_outlook_sent(_config(tmp_path, dry_run=True), exporter=forbidden, now=NOW)
    assert off["status"] == "feature_off"
    assert dry["status"] == "dry_run"
    assert calls == 0
    assert not (tmp_path / "data").exists()


def test_schedule_runs_at_most_once_per_kst_lunch_and_night_slot(tmp_path: Path) -> None:
    config = _config(
        tmp_path,
        allowed_windows_kst=((12 * 60, 14 * 60), (20 * 60, 23 * 60)),
    )
    calls = 0

    def counted(*args):
        nonlocal calls
        calls += 1
        return _exporter(sent_at="2026-07-23T03:00:00Z")(*args)

    before_lunch = run_outlook_sent(
        config,
        exporter=counted,
        now=datetime(2026, 7, 23, 2, 59, 0, tzinfo=timezone.utc),
    )
    lunch = run_outlook_sent(
        config,
        exporter=counted,
        now=datetime(2026, 7, 23, 3, 5, 0, tzinfo=timezone.utc),
    )
    lunch_repeat = run_outlook_sent(
        config,
        exporter=counted,
        now=datetime(2026, 7, 23, 4, 0, 0, tzinfo=timezone.utc),
    )
    night = run_outlook_sent(
        config,
        exporter=counted,
        now=datetime(2026, 7, 23, 11, 5, 0, tzinfo=timezone.utc),
    )
    assert before_lunch["status"] == "outside_schedule"
    assert lunch["status"] == "ok"
    assert lunch_repeat["status"] == "already_collected_in_slot"
    assert night["status"] == "ok"
    assert calls == 2


@pytest.mark.parametrize(
    "schedule",
    ["", "12:00", "14:00-12:00", "12:00-14:00,13:00-15:00", "25:00-26:00"],
)
def test_enabled_config_requires_valid_nonoverlapping_kst_schedule(
    tmp_path: Path, schedule: str
) -> None:
    values = {
        "OUTLOOK_SENT_ENABLED": "true",
        "OUTLOOK_SENT_DEFAULT_STORE_FINGERPRINT": STORE_PIN,
        "OUTLOOK_SENT_DEFAULT_FOLDER_FINGERPRINT": FOLDER_PIN,
        "OUTLOOK_SENT_ALLOWED_WINDOWS_KST": schedule,
        "EMAIL_FETCH_INBOX_ROOT": str(tmp_path / "inbox"),
        "EMAIL_FETCH_RUNTIME_DIR": str(tmp_path / "runtime"),
    }
    with pytest.raises(
        OutlookSentError,
        match="outlook_sent_schedule_(?:required|invalid)",
    ):
        build_outlook_sent_config(
            mailbox_id="owner-sent",
            account_id="owner",
            account_role="owner",
            workspace="company",
            env_text="",
            env_overrides=values,
            capsule_bound=True,
        )


def test_synthetic_apply_replay_exact_identity_and_msg_only_custody(tmp_path: Path) -> None:
    config = _config(tmp_path)
    first = run_outlook_sent(config, exporter=_exporter(), now=NOW)
    second = run_outlook_sent(
        config,
        exporter=_exporter(),
        now=datetime(2026, 7, 23, 6, 1, 0, tzinfo=timezone.utc),
    )
    assert first["total_new_events"] == 1
    assert first["custody_objects_written"] == 1
    assert first["cursor_advanced"] is True
    assert second["total_new_events"] == 0
    assert second["total_duplicates"] == 1
    assert second["custody_objects_written"] == 0

    msg_files = list(config.source_custody_root.glob("outlook_sent/sha256/*/*.msg"))
    assert len(msg_files) == 1
    assert msg_files[0].read_bytes().startswith(b"synthetic unicode msg")
    assert not list(config.source_custody_root.rglob("*.bin"))
    assert not list(config.source_custody_root.rglob("*.attachment"))

    state = json.loads(config.shadow_state_file.read_text(encoding="utf-8"))
    occurrence = next(iter(state["occurrences"].values()))
    assert occurrence["identity_status"] == "confirmed_exact"
    assert occurrence["exact_occurrence_ref"]["value"] == "<mail-001@example.test>"
    observation = next(iter(state["observations"].values()))
    assert observation["native_observation_ref"].startswith("outlook_native:")
    assert observation["occurred_at"] == "2026-07-23T05:59:00Z"
    assert observation["observed_at"] == "2026-07-23T06:00:00Z"
    assert observation["participant_relations"][0]["role"] == "bcc"
    assert observation["participant_relations"][0]["evidence"] == "sender_copy"


def test_replay_reuses_first_custody_when_outlook_saveas_bytes_are_nondeterministic(
    tmp_path: Path,
) -> None:
    config = _config(tmp_path, overlap_seconds=86_400)
    first = run_outlook_sent(
        config,
        exporter=_exporter(body=b"first Outlook SaveAs bytes"),
        now=NOW,
    )
    second = run_outlook_sent(
        config,
        exporter=_exporter(body=b"same item, different SaveAs bytes"),
        now=datetime(2026, 7, 23, 6, 1, 0, tzinfo=timezone.utc),
    )
    assert first["total_new_events"] == 1
    assert second["total_duplicates"] == 1
    assert second["custody_objects_written"] == 0
    msg_files = list(config.source_custody_root.glob("outlook_sent/sha256/*/*.msg"))
    assert len(msg_files) == 1
    assert msg_files[0].read_bytes() == b"first Outlook SaveAs bytes"


def test_missing_rfc_message_id_stays_unmatched_and_store_entry_is_not_identity(
    tmp_path: Path,
) -> None:
    config = _config(tmp_path)
    run_outlook_sent(config, exporter=_exporter(message_id=""), now=NOW)
    state = json.loads(config.shadow_state_file.read_text(encoding="utf-8"))
    occurrence = next(iter(state["occurrences"].values()))
    assert occurrence["identity_status"] == "unmatched"
    assert occurrence["exact_occurrence_ref"] is None


@pytest.mark.parametrize(
    "truncated,gaps",
    [(True, []), (False, ["item_export_failed"])],
)
def test_cursor_does_not_advance_past_truncation_or_gap(
    tmp_path: Path, truncated: bool, gaps: list[str]
) -> None:
    config = _config(tmp_path)
    result = run_outlook_sent(
        config,
        exporter=_exporter(truncated=truncated, gaps=gaps),
        now=NOW,
    )
    assert result["partial"] is True
    assert result["cursor_advanced"] is False
    state = json.loads(config.shadow_state_file.read_text(encoding="utf-8"))
    assert state["cursors"][config.source_scope_ref].startswith("outlook_cursor:")


def test_existing_content_hash_conflict_fails_closed(tmp_path: Path) -> None:
    config = _config(tmp_path)
    run_outlook_sent(config, exporter=_exporter(), now=NOW)
    msg_file = next(config.source_custody_root.glob("outlook_sent/sha256/*/*.msg"))
    msg_file.write_bytes(b"corrupt")
    with pytest.raises(OutlookSentError, match="source_custody_existing_mismatch"):
        run_outlook_sent(
            config,
            exporter=_exporter(),
            now=datetime(2026, 7, 23, 6, 1, 0, tzinfo=timezone.utc),
        )


def test_raw_and_private_value_sentinels(tmp_path: Path) -> None:
    private_recipient = "private-recipient@example.test"
    config = _config(tmp_path)
    result = run_outlook_sent(
        config,
        exporter=_exporter(recipient_seed=private_recipient),
        now=NOW,
    )
    rendered_result = json.dumps(result, sort_keys=True)
    rendered_state = config.shadow_state_file.read_text(encoding="utf-8")
    for forbidden in (
        private_recipient,
        "StoreID",
        "EntryID",
        "subject",
        "attachment_name",
        "body_text",
        str(config.source_custody_root),
    ):
        assert forbidden not in rendered_result
        assert forbidden not in rendered_state


def test_powershell_is_active_attach_sent_only_unicode_export_static_safe() -> None:
    script = build_outlook_sent_powershell_script()
    assert "GetActiveObject('Outlook.Application')" in script
    assert "GetDefaultFolder(5)" in script
    assert ".SaveAs($temporaryPath, 9)" in script
    for forbidden in (
        "New-Object",
        "CreateObject",
        "SendAndReceive",
        "GetDefaultFolder(6)",
        ".Move(",
        ".Delete(",
        ".Send(",
        ".Save(",
    ):
        assert forbidden not in script


@pytest.mark.skipif(os.name != "nt", reason="Windows PowerShell path contract")
def test_active_outlook_export_uses_absolute_system_powershell(
    monkeypatch, tmp_path: Path
) -> None:
    staging = tmp_path / "staging"
    staging.mkdir()
    seen = {}

    def fake_run(args, **kwargs):
        seen["executable"] = args[0]
        manifest = Path(kwargs["env"]["SOULFORGE_OUTLOOK_MANIFEST"])
        manifest.write_text(
            json.dumps(
                {
                    "store_fingerprint": STORE_PIN,
                    "folder_fingerprint": FOLDER_PIN,
                    "records": [],
                    "truncated": False,
                    "gap_codes": [],
                }
            ),
            encoding="utf-8",
        )
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(outlook_sent.subprocess, "run", fake_run)
    result = outlook_sent._export_with_active_outlook(
        _config(tmp_path),
        staging,
        NOW,
        NOW.replace(minute=1),
    )

    assert Path(seen["executable"]).is_absolute()
    assert Path(seen["executable"]).name.lower() == "powershell.exe"
    assert result["records"] == []
