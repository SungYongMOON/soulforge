from __future__ import annotations

from datetime import datetime, timedelta, timezone
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import sys

import pytest

import guild_hall.gateway.mail_send.hiworks_gmail_forwarder as forwarder

from guild_hall.gateway.mail_send.hiworks_gmail_forwarder import (
    ForwarderConfig,
    initialize_baseline,
    run_cycle,
)


class FakePop:
    def __init__(self, messages: list[tuple[str, bytes]]) -> None:
        self.messages = messages
        self.deleted: list[int] = []
        self.retrieved: list[int] = []

    def user(self, _username: str) -> None:
        return None

    def pass_(self, _password: str) -> None:
        return None

    def uidl(self):
        return b"+OK", [f"{index} {uidl}".encode() for index, (uidl, _) in enumerate(self.messages, 1)], 0

    def retr(self, number: int):
        self.retrieved.append(number)
        raw = self.messages[number - 1][1]
        return b"+OK", raw.replace(b"\r\n", b"\n").split(b"\n"), len(raw)

    def dele(self, number: int) -> None:
        self.deleted.append(number)

    def quit(self) -> None:
        return None


class FakeImporter:
    def __init__(self, status: str = "imported") -> None:
        self.status = status
        self.messages: list[bytes] = []

    def __call__(self, _config: ForwarderConfig, raw: bytes) -> dict[str, object]:
        self.messages.append(raw)
        return {"status": self.status, "inbox_requested": True}


class FixedClock:
    def __init__(self) -> None:
        self.value = datetime(2026, 8, 13, 0, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.value

    def advance(self, **kwargs: int) -> None:
        self.value += timedelta(**kwargs)


def _raw(subject: str, message_id: str) -> bytes:
    message = EmailMessage()
    message["From"] = "external@example.com"
    message["To"] = "seabot.moon@sonartech.com"
    message["Cc"] = "cc@example.com"
    message["Date"] = "Fri, 07 Aug 2026 10:00:00 +0900"
    message["Message-ID"] = message_id
    message["Subject"] = subject
    message.set_content("original body")
    return message.as_bytes(policy=policy.SMTP)


def _config(tmp_path: Path) -> ForwarderConfig:
    return ForwarderConfig(
        account_env=tmp_path / "account.env",
        state_root=tmp_path / "state",
        expected_account="seabot.moon@sonartech.com",
        gmail_target="seabot.moon@gmail.com",
        pop_host="pop3s.hiworks.com",
        pop_port=995,
        username="seabot.moon@sonartech.com",
        password="not-a-real-secret",
        max_seen=5000,
        max_import_bytes=150 * 1024 * 1024,
        timeout_sec=30,
        gmail_config_root=tmp_path / "gmail-config",
        oauth_client_path=tmp_path / "gmail-config" / "client.json",
        oauth_token_path=tmp_path / "gmail-config" / "token.json",
        receipt_root=tmp_path / "receipts",
    )


def _state(config: ForwarderConfig) -> dict[str, object]:
    return json.loads((config.state_root / "state.json").read_text(encoding="utf-8"))


def _uidl_hash(uidl: str) -> str:
    return hashlib.sha256(uidl.encode()).hexdigest()


def test_baseline_imports_nothing_and_never_deletes(tmp_path: Path) -> None:
    pop = FakePop([("old-1", _raw("old", "<old@example.com>"))])
    result = initialize_baseline(_config(tmp_path), pop_factory=lambda _config: pop)
    assert result == {"status": "initialized", "baseline_count": 1, "imported_count": 0}
    assert pop.deleted == []


def test_only_new_mail_is_imported_once_as_original_bytes(tmp_path: Path) -> None:
    config = _config(tmp_path)
    old = ("old-1", _raw("old", "<old@example.com>"))
    initialize_baseline(config, pop_factory=lambda _config: FakePop([old]))

    new = ("new-1", _raw("new subject", "<new@example.com>"))
    pop = FakePop([old, new])
    importer = FakeImporter()
    first = run_cycle(config, pop_factory=lambda _config: pop, gmail_importer=importer)
    assert first["delivery_mode"] == "gmail_api_original_import"
    assert first["imported_count"] == 1
    assert first["failed_count"] == 0
    assert pop.deleted == []
    assert len(importer.messages) == 1
    message = BytesParser(policy=policy.default).parsebytes(importer.messages[0])
    assert str(message["From"]) == "external@example.com"
    assert str(message["To"]) == "seabot.moon@sonartech.com"
    assert str(message["Cc"]) == "cc@example.com"
    assert str(message["Date"]) == "Fri, 07 Aug 2026 10:00:00 +0900"
    assert str(message["Message-ID"]) == "<new@example.com>"
    assert str(message["Subject"]) == "new subject"

    second_importer = FakeImporter()
    second_pop = FakePop([old, new])
    second = run_cycle(config, pop_factory=lambda _config: second_pop, gmail_importer=second_importer)
    assert second["imported_count"] == 0
    assert second_importer.messages == []
    assert second_pop.deleted == []


def test_existing_import_receipt_marks_uidl_seen_without_duplicate(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    importer = FakeImporter(status="already_imported")
    result = run_cycle(
        config,
        pop_factory=lambda _config: FakePop([("uid-1", _raw("same", "<same@example.com>"))]),
        gmail_importer=importer,
    )
    assert result["imported_count"] == 0
    assert result["already_imported_count"] == 1
    assert result["failed_count"] == 0


def test_failed_import_is_not_marked_seen_and_retries(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    clock = FixedClock()

    def fail(_config: ForwarderConfig, _raw_message: bytes) -> dict[str, object]:
        raise RuntimeError("synthetic_failure")

    message = ("uid-1", _raw("retry", "<retry@example.com>"))
    first_pop = FakePop([message])
    first = run_cycle(
        config,
        pop_factory=lambda _config: first_pop,
        gmail_importer=fail,
        now=clock,
    )
    assert first["status"] == "partial"
    assert first["failed_count"] == 1
    assert _uidl_hash("uid-1") not in _state(config)["seen_uidl_hashes"]
    assert first_pop.deleted == []

    clock.advance(minutes=5)
    importer = FakeImporter()
    second_pop = FakePop([message])
    second = run_cycle(
        config,
        pop_factory=lambda _config: second_pop,
        gmail_importer=importer,
        now=clock,
    )
    assert second["imported_count"] == 1
    assert len(importer.messages) == 1
    assert _state(config)["uidl_failures"] == {}
    assert second_pop.deleted == []


def test_state_v2_migration_preserves_seen_uidl_hashes(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(
        config,
        pop_factory=lambda _config: FakePop([("seen-1", _raw("seen", "<seen@example.com>"))]),
    )
    before = _state(config)
    before["schema_version"] = 2
    before.pop("uidl_failures")
    (config.state_root / "state.json").write_text(json.dumps(before), encoding="utf-8")

    run_cycle(config, pop_factory=lambda _config: FakePop([]))

    migrated = _state(config)
    assert migrated["schema_version"] == 3
    assert migrated["seen_uidl_hashes"] == before["seen_uidl_hashes"]
    assert migrated["uidl_failures"] == {}


def test_failure_state_is_sanitized_and_quarantines_at_threshold(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    clock = FixedClock()
    message = ("private-uidl-value", _raw("held", "<held@example.com>"))

    def fail(_config: ForwarderConfig, _raw_message: bytes) -> dict[str, object]:
        raise RuntimeError("provider response must not be stored")

    results = []
    pops = []
    for advance_minutes in (0, 5, 15):
        clock.advance(minutes=advance_minutes)
        pop = FakePop([message])
        pops.append(pop)
        results.append(
            run_cycle(config, pop_factory=lambda _config, pop=pop: pop, gmail_importer=fail, now=clock)
        )

    state = _state(config)
    uidl_hash = _uidl_hash(message[0])
    assert state["seen_uidl_hashes"] == []
    assert list(state["uidl_failures"]) == [uidl_hash]
    assert state["uidl_failures"][uidl_hash] == {
        "failure_class": "error_processing",
        "failure_count": 3,
        "last_attempt_at": clock.value.isoformat(),
        "next_attempt_at": (clock.value + timedelta(hours=1)).isoformat(),
    }
    assert "private-uidl-value" not in json.dumps(state)
    assert "provider response" not in json.dumps(state)
    assert results[-1]["held_count"] == 1
    assert all(pop.deleted == [] for pop in pops)


def test_not_due_failure_is_skipped_while_other_mail_progresses(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    clock = FixedClock()
    poison = ("poison-uidl", _raw("poison", "<poison@example.com>"))

    def first_failure(_config: ForwarderConfig, _raw_message: bytes) -> dict[str, object]:
        raise RuntimeError("synthetic_failure")

    run_cycle(
        config,
        pop_factory=lambda _config: FakePop([poison]),
        gmail_importer=first_failure,
        now=clock,
    )
    clock.advance(minutes=1)
    healthy = ("healthy-uidl", _raw("healthy", "<healthy@example.com>"))
    pop = FakePop([poison, healthy])
    importer = FakeImporter()

    result = run_cycle(config, pop_factory=lambda _config: pop, gmail_importer=importer, now=clock)

    assert result["deferred_count"] == 1
    assert result["status"] == "partial"
    assert result["tracked_failure_count"] == 1
    assert result["imported_count"] == 1
    assert pop.retrieved == [2]
    assert len(importer.messages) == 1
    state = _state(config)
    assert _uidl_hash("poison-uidl") in state["uidl_failures"]
    assert _uidl_hash("poison-uidl") not in state["seen_uidl_hashes"]
    assert _uidl_hash("healthy-uidl") in state["seen_uidl_hashes"]
    assert pop.deleted == []


def test_retry_ledger_rejects_extra_or_malformed_state_fields(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    state = _state(config)
    state["uidl_failures"] = {
        _uidl_hash("uid-1"): {
            "failure_class": "error_proto",
            "failure_count": 3,
            "last_attempt_at": "2026-08-13T00:00:00+00:00",
            "next_attempt_at": "2026-08-13T01:00:00+00:00",
            "raw_provider_detail": "must never survive",
        },
    }
    (config.state_root / "state.json").write_text(json.dumps(state), encoding="utf-8")

    try:
        run_cycle(config, pop_factory=lambda _config: FakePop([]))
    except ValueError as exc:
        assert str(exc) == "state_schema_invalid"
    else:
        raise AssertionError("malformed retry state must fail closed")


def test_state_rejects_unknown_root_fields_and_nonhex_hashes(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    path = config.state_root / "state.json"

    unknown_field = _state(config)
    unknown_field["raw_provider_detail"] = "must never survive"
    path.write_text(json.dumps(unknown_field), encoding="utf-8")
    with pytest.raises(ValueError, match="^state_schema_invalid$"):
        run_cycle(config, pop_factory=lambda _config: FakePop([]))


def test_state_rejects_invalid_delivery_mode_and_root_timestamps(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    path = config.state_root / "state.json"

    for field, value in (
        ("delivery_mode", "raw_private_payload"),
        ("initialized_at", "secret=must_reject"),
        ("updated_at", "not-a-time"),
    ):
        invalid = _state(config)
        invalid[field] = value
        path.write_text(json.dumps(invalid), encoding="utf-8")
        with pytest.raises(ValueError, match="^state_schema_invalid$"):
            run_cycle(config, pop_factory=lambda _config: FakePop([]))

    reversed_clock = _state(config)
    reversed_clock["initialized_at"] = "2026-08-13T01:00:00+00:00"
    reversed_clock["updated_at"] = "2026-08-13T00:00:00+00:00"
    path.write_text(json.dumps(reversed_clock), encoding="utf-8")
    with pytest.raises(ValueError, match="^state_schema_invalid$"):
        run_cycle(config, pop_factory=lambda _config: FakePop([]))


def test_state_rejects_duplicate_seen_and_inconsistent_failure_identity(tmp_path: Path) -> None:
    config = _config(tmp_path)
    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    path = config.state_root / "state.json"
    uidl_hash = _uidl_hash("uid-1")

    duplicate_seen = _state(config)
    duplicate_seen["seen_uidl_hashes"] = [uidl_hash, uidl_hash]
    path.write_text(json.dumps(duplicate_seen), encoding="utf-8")
    with pytest.raises(ValueError, match="^state_schema_invalid$"):
        run_cycle(config, pop_factory=lambda _config: FakePop([]))

    inconsistent = _state(config)
    inconsistent["seen_uidl_hashes"] = [uidl_hash]
    inconsistent["uidl_failures"] = {
        uidl_hash: {
            "failure_class": "error_proto",
            "failure_count": 1,
            "last_attempt_at": "2026-08-13T01:00:00+00:00",
            "next_attempt_at": "2026-08-13T00:00:00+00:00",
        },
    }
    path.write_text(json.dumps(inconsistent), encoding="utf-8")
    with pytest.raises(ValueError, match="^state_schema_invalid$"):
        run_cycle(config, pop_factory=lambda _config: FakePop([]))

    initialize_baseline(config, pop_factory=lambda _config: FakePop([]))
    nonhex_hash = _state(config)
    nonhex_hash["seen_uidl_hashes"] = ["Z" * 64]
    path.write_text(json.dumps(nonhex_hash), encoding="utf-8")
    with pytest.raises(ValueError, match="^state_schema_invalid$"):
        run_cycle(config, pop_factory=lambda _config: FakePop([]))


def test_main_returns_partial_exit_for_deferred_failures(monkeypatch, capsys) -> None:
    monkeypatch.setattr(sys, "argv", [
        "hiworks_gmail_forwarder.py",
        "--apply",
        "--account-env", "account.env",
        "--state-root", "state",
        "--gmail-config-root", "gmail",
        "--oauth-client", "client.json",
        "--oauth-token", "token.json",
        "--receipt-root", "receipts",
        "--json",
    ])
    monkeypatch.setattr(forwarder, "load_config", lambda *_args: object())
    monkeypatch.setattr(forwarder, "run_cycle", lambda _config: {
        "status": "partial",
        "failed_count": 0,
        "deferred_count": 1,
        "held_count": 1,
        "tracked_failure_count": 1,
    })

    assert forwarder.main() == 2
    assert json.loads(capsys.readouterr().out)["status"] == "partial"


def test_main_returns_success_for_initialize(monkeypatch, capsys) -> None:
    monkeypatch.setattr(sys, "argv", [
        "hiworks_gmail_forwarder.py",
        "--initialize",
        "--account-env", "account.env",
        "--state-root", "state",
        "--gmail-config-root", "gmail",
        "--oauth-client", "client.json",
        "--oauth-token", "token.json",
        "--receipt-root", "receipts",
        "--json",
    ])
    monkeypatch.setattr(forwarder, "load_config", lambda *_args: object())
    monkeypatch.setattr(forwarder, "initialize_baseline", lambda _config: {
        "status": "initialized",
        "observed_count": 0,
    })

    assert forwarder.main() == 0
    assert json.loads(capsys.readouterr().out)["status"] == "initialized"


def test_seen_window_does_not_reintroduce_older_mail(tmp_path: Path) -> None:
    base = _config(tmp_path)
    config = ForwarderConfig(**{**base.__dict__, "max_seen": 2})
    messages = [
        ("uid-1", _raw("one", "<one@example.com>")),
        ("uid-2", _raw("two", "<two@example.com>")),
        ("uid-3", _raw("three", "<three@example.com>")),
    ]
    result = initialize_baseline(config, pop_factory=lambda _config: FakePop(messages))
    assert result["baseline_count"] == 2
    importer = FakeImporter()
    cycle = run_cycle(config, pop_factory=lambda _config: FakePop(messages), gmail_importer=importer)
    assert cycle["observed_count"] == 2
    assert cycle["imported_count"] == 0
    assert importer.messages == []
