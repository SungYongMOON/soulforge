from __future__ import annotations

from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
import hashlib
import io
import os
from pathlib import Path
import poplib
import stat
from types import SimpleNamespace
from typing import Dict

import pytest

from collector.connectors.hiworks import HiworksPop3Connector
from collector.pipeline.normalize import normalize_events
from collector.storage import source_custody as source_custody_module
from collector.storage.source_custody import SourceCustodyError, persist_hiworks_rfc822


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


class _LargeLinePop3(_FakePop3):
    def __init__(self, messages: Dict[int, bytes], uidl_map: Dict[int, str]) -> None:
        super().__init__(messages=messages, uidl_map=uidl_map)
        self.file = io.BytesIO()
        self.commands: list[str] = []

    def _putcmd(self, line: str) -> None:
        self.commands.append(line)
        parts = str(line).strip().split()
        msg_num = int(parts[1])
        self.file = io.BytesIO(self._messages[msg_num] + b".\r\n")

    def _getresp(self) -> bytes:
        return b"+OK"

    def retr(self, msg_num: int):
        raise AssertionError("large-line path should bypass poplib.retr")


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


def _build_raw_message_with_long_body_line(*, body_size: int) -> bytes:
    return b"".join(
        [
            b"Message-ID: <long-line@example.com>\r\n",
            b"From: Alice <alice@example.com>\r\n",
            b"To: Bob <bob@example.com>\r\n",
            b"Date: Thu, 05 Mar 2026 09:00:00 +0900\r\n",
            b"Subject: long line\r\n",
            b"Content-Type: text/plain; charset=utf-8\r\n",
            b"\r\n",
            b"x" * body_size,
            b"\r\n",
        ]
    )


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


def test_hiworks_connector_uses_last_uidl_when_seen_window_rolled() -> None:
    messages = {
        1: _build_message(message_id="<old-1@example.com>", subject="old 1", text="old 1"),
        2: _build_message(message_id="<old-2@example.com>", subject="old 2", text="old 2"),
        3: _build_message(message_id="<last@example.com>", subject="last", text="last"),
        4: _build_message(message_id="<new@example.com>", subject="new", text="new"),
    }
    connector = HiworksPop3Connector(
        host="pop3.example.com",
        username="user@example.com",
        password="pw",
        pop3_factory=lambda host, port, use_ssl, timeout_sec: _FakePop3(
            messages=messages,
            uidl_map={1: "UID-OLD-1", 2: "UID-OLD-2", 3: "UID-LAST", 4: "UID-NEW"},
        ),
    )

    result = connector.fetch_since(cursor={"seen_uidls": ["UID-LAST"], "last_uidl": "UID-LAST"}, limit=10)

    assert result.partial is False
    assert len(result.events) == 1
    assert result.events[0].provider_message_id == "new@example.com"
    assert result.next_cursor["seen_uidls"] == ["UID-LAST", "UID-NEW"]
    assert result.next_cursor["last_uidl"] == "UID-NEW"


def test_hiworks_connector_reads_message_line_longer_than_poplib_default() -> None:
    raw = _build_raw_message_with_long_body_line(body_size=poplib._MAXLINE + 512)
    fake = _LargeLinePop3(messages={1: raw}, uidl_map={1: "UID-LONG"})
    connector = HiworksPop3Connector(
        host="pop3.example.com",
        username="user@example.com",
        password="pw",
        max_line_bytes=poplib._MAXLINE + 1024,
        pop3_factory=lambda host, port, use_ssl, timeout_sec: fake,
    )

    result = connector.fetch_since(cursor=None, limit=10)

    assert result.partial is False
    assert result.errors == []
    assert len(result.events) == 1
    assert result.events[0].provider_message_id == "long-line@example.com"
    assert result.events[0].body_text == "x" * (poplib._MAXLINE + 512)
    assert fake.commands == ["RETR 1"]


def test_hiworks_connector_marks_partial_when_line_exceeds_configured_limit() -> None:
    raw = _build_raw_message_with_long_body_line(body_size=poplib._MAXLINE + 512)
    fake = _LargeLinePop3(messages={1: raw}, uidl_map={1: "UID-LONG"})
    connector = HiworksPop3Connector(
        host="pop3.example.com",
        username="user@example.com",
        password="pw",
        max_line_bytes=poplib._MAXLINE + 128,
        pop3_factory=lambda host, port, use_ssl, timeout_sec: fake,
    )

    result = connector.fetch_since(cursor=None, limit=10)

    assert result.partial is True
    assert result.events == []
    assert result.errors[0].code == "pop3_line_too_long"
    assert result.errors[0].detail["max_line_bytes"] == poplib._MAXLINE + 128


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


def test_hiworks_connector_preserves_exact_rfc822_and_attachment_in_source_custody(tmp_path: Path) -> None:
    attachment_bytes = b"\x00synthetic-attachment\xff\r\nexact"
    message = EmailMessage()
    message["Message-ID"] = "<custody@example.com>"
    message["From"] = "Alice <alice@example.com>"
    message["To"] = "Bob <bob@example.com>"
    message["Date"] = "Thu, 05 Mar 2026 09:00:00 +0900"
    message["Subject"] = "synthetic custody"
    message.set_content("source body")
    message.add_attachment(
        attachment_bytes,
        maintype="application",
        subtype="octet-stream",
        filename="recover.bin",
    )
    raw = message.as_bytes(policy=policy.SMTP)
    custody_root = tmp_path / "mail" / "source_custody"
    attachment_root = tmp_path / "mail" / "attachments"

    connector = HiworksPop3Connector(
        host="pop3.example.com",
        username="user@example.com",
        password="pw",
        download_attachments=False,
        attachment_root=attachment_root,
        source_custody_root=custody_root,
        pop3_factory=lambda host, port, use_ssl, timeout_sec: _FakePop3(
            messages={1: raw},
            uidl_map={1: "../../provider-controlled-uidl"},
        ),
    )

    first = connector.fetch_since(cursor=None, limit=10)
    assert first.partial is False
    assert len(first.events) == 1
    source_custody = first.events[0].raw["source_custody"]
    expected_sha256 = hashlib.sha256(raw).hexdigest()
    assert source_custody == {
        "sha256": expected_sha256,
        "size": len(raw),
        "storage_ref": f"hiworks/sha256/{expected_sha256[:2]}/{expected_sha256}.eml",
        "media_type": "message/rfc822",
    }
    normalized = normalize_events(first.events, allowed_hosts=(), attachment_max_bytes=0)[0]
    assert normalized.to_dict()["raw"]["source_custody"] == source_custody

    stored = custody_root.joinpath(*source_custody["storage_ref"].split("/"))
    assert stored.read_bytes() == raw
    assert "provider-controlled-uidl" not in stored.as_posix()
    assert not attachment_root.exists()

    reparsed = BytesParser(policy=policy.default).parsebytes(stored.read_bytes())
    recovered = [
        part.get_payload(decode=True)
        for part in reparsed.walk()
        if part.get_filename() == "recover.bin"
    ]
    assert recovered == [attachment_bytes]

    before = stored.stat()
    replay = connector.fetch_since(cursor=None, limit=10)
    after = stored.stat()
    assert replay.partial is False
    assert replay.events[0].raw["source_custody"] == source_custody
    assert (after.st_ino, after.st_size, after.st_mtime_ns) == (
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
    )
    assert list(stored.parent.glob("*.partial")) == []


def test_source_custody_fails_closed_on_existing_hash_path_mismatch(tmp_path: Path) -> None:
    raw = b"Message-ID: <collision@example.com>\r\n\r\nexpected\r\n"
    digest = hashlib.sha256(raw).hexdigest()
    custody_root = tmp_path / "source_custody"
    target = custody_root / "hiworks" / "sha256" / digest[:2] / f"{digest}.eml"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"different bytes")

    with pytest.raises(SourceCustodyError) as error:
        persist_hiworks_rfc822(custody_root, raw)

    assert error.value.code == "source_custody_existing_mismatch"
    assert target.read_bytes() == b"different bytes"


def test_source_custody_rejects_symlink_or_reparse_root(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    custody_root = tmp_path / "source_custody"
    try:
        os.symlink(outside, custody_root, target_is_directory=True)
    except (NotImplementedError, OSError):
        pytest.skip("directory symlink creation is unavailable on this host")

    with pytest.raises(SourceCustodyError) as error:
        persist_hiworks_rfc822(custody_root, b"Message-ID: <unsafe@example.com>\r\n\r\n")

    assert error.value.code == "source_custody_reparse_forbidden"
    assert list(outside.iterdir()) == []


def test_source_custody_rejects_windows_reparse_attribute(monkeypatch, tmp_path: Path) -> None:
    custody_root = tmp_path / "source_custody"
    custody_root.mkdir()
    original_lstat = source_custody_module._lstat

    def fake_lstat(path: Path, *, missing_ok: bool = False):
        if Path(path) == custody_root:
            return SimpleNamespace(
                st_mode=stat.S_IFDIR,
                st_file_attributes=source_custody_module._REPARSE_POINT_ATTRIBUTE,
            )
        return original_lstat(path, missing_ok=missing_ok)

    monkeypatch.setattr(source_custody_module, "_lstat", fake_lstat)
    with pytest.raises(SourceCustodyError) as error:
        persist_hiworks_rfc822(custody_root, b"Message-ID: <unsafe@example.com>\r\n\r\n")

    assert error.value.code == "source_custody_reparse_forbidden"


def test_source_custody_parent_swap_during_publish_is_blocked_or_detected(
    monkeypatch, tmp_path: Path
) -> None:
    raw = b"Message-ID: <parent-swap@example.test>\r\n\r\nexact bytes\r\n"
    digest = hashlib.sha256(raw).hexdigest()
    custody_root = tmp_path / "source_custody"
    parent = custody_root / "hiworks" / "sha256" / digest[:2]
    moved_parent = parent.with_name(f"{parent.name}-moved")
    original_publish = source_custody_module._publish_at
    swap_attempted = False

    def adversarial_publish(directory, temporary: str, target: str) -> None:
        nonlocal swap_attempted
        swap_attempted = True
        if os.name == "nt":
            with pytest.raises(OSError):
                parent.rename(moved_parent)
        else:
            parent.rename(moved_parent)
            parent.mkdir()
        original_publish(directory, temporary, target)

    monkeypatch.setattr(source_custody_module, "_publish_at", adversarial_publish)
    if os.name == "nt":
        record = persist_hiworks_rfc822(custody_root, raw)
        assert record.written is True
        assert (parent / f"{digest}.eml").read_bytes() == raw
    else:
        with pytest.raises(SourceCustodyError) as error:
            persist_hiworks_rfc822(custody_root, raw)
        assert error.value.code == "source_custody_parent_changed"
        assert list(parent.iterdir()) == []
        assert list(moved_parent.iterdir()) == []
    assert swap_attempted is True


@pytest.mark.skipif(os.name != "nt", reason="Windows directory identity handle contract")
def test_source_custody_windows_directory_handle_blocks_rename(tmp_path: Path) -> None:
    parent = tmp_path / "retained-parent"
    renamed = tmp_path / "renamed-parent"
    parent.mkdir()

    with source_custody_module._RetainedDirectoryChain(parent) as retained:
        retained.assert_stable()
        with pytest.raises(OSError):
            parent.rename(renamed)

    parent.rename(renamed)
    assert renamed.is_dir()
