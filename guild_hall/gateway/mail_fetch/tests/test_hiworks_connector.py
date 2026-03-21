from __future__ import annotations

from email.message import EmailMessage
from pathlib import Path
import poplib
from typing import Dict

from collector.connectors.hiworks import HiworksPop3Connector


class _FakePop3:
    def __init__(self, messages: Dict[int, bytes], uidl_map: Dict[int, str]) -> None:
        self._messages = dict(messages)
        self._uidl_map = dict(uidl_map)
        self.logged_in = False
        self.closed = False

    def user(self, username: str) -> bytes:
        if not username:
            raise poplib.error_proto("missing user")
        return b"+OK"

    def pass_(self, password: str) -> bytes:
        if not password:
            raise poplib.error_proto("missing pass")
        self.logged_in = True
        return b"+OK"

    def uidl(self):
        rows = [f"{num} {uidl}".encode("utf-8") for num, uidl in sorted(self._uidl_map.items())]
        return b"+OK", rows, len(rows)

    def retr(self, msg_num: int):
        raw = self._messages[int(msg_num)]
        return b"+OK", raw.splitlines(), len(raw)

    def quit(self) -> bytes:
        self.closed = True
        return b"+OK"


def _build_message(*, message_id: str, subject: str, text: str, attachment: bytes | None = None, filename: str = "") -> bytes:
    msg = EmailMessage()
    msg["Message-ID"] = message_id
    msg["From"] = "Alice <alice@example.com>"
    msg["To"] = "Bob <bob@example.com>"
    msg["Date"] = "Thu, 05 Mar 2026 09:00:00 +0900"
    msg["Subject"] = subject
    msg.set_content(text)
    if attachment is not None:
        msg.add_attachment(
            attachment,
            maintype="application",
            subtype="octet-stream",
            filename=filename or "file.bin",
        )
    return msg.as_bytes()


def test_hiworks_connector_fetches_new_messages_and_updates_cursor(tmp_path: Path) -> None:
    raw_1 = _build_message(
        message_id="<msg-1@example.com>",
        subject="P2 테스트 1",
        text="first body",
        attachment=b"small-bytes",
        filename="hello.txt",
    )
    raw_2 = _build_message(
        message_id="<msg-2@example.com>",
        subject="P2 테스트 2",
        text="second body",
        attachment=b"x" * 64,
        filename="large.bin",
    )

    fake = _FakePop3(messages={1: raw_1, 2: raw_2}, uidl_map={1: "UID-1", 2: "UID-2"})
    connector = HiworksPop3Connector(
        host="pop3.example.com",
        username="user@example.com",
        password="pw",
        attachment_root=tmp_path / "attachments",
        attachment_max_bytes=32,
        pop3_factory=lambda host, port, use_ssl, timeout_sec: fake,
    )

    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is False
    assert result.errors == []
    assert len(result.events) == 2
    assert fake.logged_in is True
    assert fake.closed is True

    first, second = result.events
    assert first.source == "hiworks"
    assert first.provider_message_id == "msg-1@example.com"
    assert first.attachments[0].type == "binary_attachment"
    assert first.attachments[0].local_path
    assert Path(first.attachments[0].local_path).exists()

    assert second.provider_message_id == "msg-2@example.com"
    assert second.attachments[0].type == "reference_attachment"
    assert second.attachments[0].url == "source://hiworks/UID-2/large.bin"

    assert result.next_cursor is not None
    assert result.next_cursor["seen_uidls"] == ["UID-1", "UID-2"]
    assert result.next_cursor["last_uidl"] == "UID-2"


def test_hiworks_connector_skips_seen_uidls_from_cursor() -> None:
    raw_1 = _build_message(message_id="<msg-1@example.com>", subject="seen", text="seen body")
    raw_2 = _build_message(message_id="<msg-2@example.com>", subject="new", text="new body")
    connector = HiworksPop3Connector(
        host="pop3.example.com",
        username="user@example.com",
        password="pw",
        pop3_factory=lambda host, port, use_ssl, timeout_sec: _FakePop3(
            messages={1: raw_1, 2: raw_2},
            uidl_map={1: "UID-1", 2: "UID-2"},
        ),
    )

    result = connector.fetch_since(cursor={"seen_uidls": ["UID-1"]}, limit=10)
    assert result.partial is False
    assert len(result.events) == 1
    assert result.events[0].provider_message_id == "msg-2@example.com"
    assert result.next_cursor["seen_uidls"] == ["UID-1", "UID-2"]


def test_hiworks_connector_returns_partial_when_config_missing() -> None:
    connector = HiworksPop3Connector(host="", username="", password="")
    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is True
    assert result.events == []
    assert result.errors
    assert result.errors[0].code == "missing_config"


def test_hiworks_connector_does_not_download_blocked_extension(tmp_path: Path) -> None:
    raw = _build_message(
        message_id="<msg-blocked@example.com>",
        subject="blocked",
        text="body",
        attachment=b"binary",
        filename="installer.dmg",
    )
    fake = _FakePop3(messages={1: raw}, uidl_map={1: "UID-BLOCK"})
    connector = HiworksPop3Connector(
        host="pop3.example.com",
        username="user@example.com",
        password="pw",
        attachment_root=tmp_path / "attachments",
        blocked_attachment_extensions=(".dmg", ".exe"),
        pop3_factory=lambda host, port, use_ssl, timeout_sec: fake,
    )

    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is False
    assert len(result.events) == 1
    attachment = result.events[0].attachments[0]
    assert attachment.type == "reference_attachment"
    assert attachment.local_path is None
    assert attachment.metadata["blocked_extension"] == ".dmg"
