from __future__ import annotations

from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from pathlib import Path

from guild_hall.gateway.mail_send.hiworks_gmail_forwarder import (
    ForwarderConfig,
    initialize_baseline,
    run_cycle,
)


class FakePop:
    def __init__(self, messages: list[tuple[str, bytes]]) -> None:
        self.messages = messages
        self.deleted: list[int] = []

    def user(self, _username: str) -> None:
        return None

    def pass_(self, _password: str) -> None:
        return None

    def uidl(self):
        return b"+OK", [f"{index} {uidl}".encode() for index, (uidl, _) in enumerate(self.messages, 1)], 0

    def retr(self, number: int):
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

    def fail(_config: ForwarderConfig, _raw_message: bytes) -> dict[str, object]:
        raise RuntimeError("synthetic_failure")

    message = ("uid-1", _raw("retry", "<retry@example.com>"))
    first = run_cycle(config, pop_factory=lambda _config: FakePop([message]), gmail_importer=fail)
    assert first["status"] == "partial"
    assert first["failed_count"] == 1

    importer = FakeImporter()
    second = run_cycle(config, pop_factory=lambda _config: FakePop([message]), gmail_importer=importer)
    assert second["imported_count"] == 1
    assert len(importer.messages) == 1


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
