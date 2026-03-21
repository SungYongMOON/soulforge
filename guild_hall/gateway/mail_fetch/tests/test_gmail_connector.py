from __future__ import annotations

import json
from pathlib import Path

from collector.connectors.gmail import GmailConnector
from collector.connectors.base import ConnectorExecutionError


def test_gmail_connector_fetch_since_parses_message(tmp_path: Path) -> None:
    message_payload = {
        "id": "msg_1",
        "threadId": "th_1",
        "internalDate": "1700000000000",
        "payload": {
            "headers": [
                {"name": "Subject", "value": "테스트"},
                {"name": "From", "value": "Alice <a@example.com>"},
                {"name": "To", "value": "Bob <b@example.com>"},
            ],
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": "aGVsbG8="},
                },
                {
                    "mimeType": "application/pdf",
                    "filename": "file.pdf",
                    "body": {"attachmentId": "att_1", "size": 100},
                },
            ],
        },
    }

    def fake_request_json(*, method: str, path: str, query=None, body=None):
        if path == "/messages":
            return {"messages": [{"id": "msg_1"}]}
        if path == "/messages/msg_1":
            return message_payload
        if path == "/messages/msg_1/attachments/att_1":
            return {"data": "ZmlsZV9ieXRlcw=="}
        raise AssertionError(path)

    connector = GmailConnector(
        access_token="token",
        attachment_root=tmp_path / "att",
        request_json=fake_request_json,
    )

    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is False
    assert len(result.events) == 1
    event = result.events[0]
    assert event.subject == "테스트"
    assert event.body_text == "hello"
    assert event.attachments
    assert event.attachments[0].local_path is not None


def test_gmail_connector_refreshes_access_token_on_expiry(tmp_path: Path) -> None:
    message_payload = {
        "id": "msg_2",
        "threadId": "th_2",
        "internalDate": "1700000000000",
        "payload": {
            "headers": [{"name": "Subject", "value": "refresh"}],
            "mimeType": "multipart/mixed",
            "parts": [],
        },
    }
    called = {"token": 0}

    def fake_request_json(*, method: str, path: str, query=None, body=None):
        if path == "/messages":
            return {"messages": [{"id": "msg_2"}]}
        if path == "/messages/msg_2":
            return message_payload
        raise AssertionError(path)

    def fake_token_request_json(*, token_uri: str, refresh_token: str, client_id: str, client_secret: str, timeout_sec: int):
        called["token"] += 1
        assert token_uri == "https://oauth2.googleapis.com/token"
        assert refresh_token == "refresh-1"
        assert client_id == "cid-1"
        assert client_secret == "secret-1"
        return {"access_token": "new-access", "expires_in": 3600, "token_type": "Bearer"}

    token_store = tmp_path / "gmail_token.json"
    connector = GmailConnector(
        access_token="old-access",
        refresh_token="refresh-1",
        client_id="cid-1",
        client_secret="secret-1",
        access_token_expires_at=1.0,
        token_store_path=token_store,
        request_json=fake_request_json,
        token_request_json=fake_token_request_json,
    )

    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is False
    assert len(result.events) == 1
    assert called["token"] == 1
    assert connector.access_token == "new-access"
    saved = json.loads(token_store.read_text(encoding="utf-8"))
    assert saved["access_token"] == "new-access"
    assert saved["refresh_token"] == "refresh-1"


def test_gmail_connector_retries_after_401_with_refresh(tmp_path: Path) -> None:
    called = {"messages": 0, "token": 0}

    def fake_request_json(*, method: str, path: str, query=None, body=None):
        if path == "/messages":
            called["messages"] += 1
            if called["messages"] == 1:
                raise ConnectorExecutionError(code="http_401", message="unauthorized", retryable=False)
            return {"messages": []}
        raise AssertionError(path)

    def fake_token_request_json(*, token_uri: str, refresh_token: str, client_id: str, client_secret: str, timeout_sec: int):
        called["token"] += 1
        return {"access_token": "new-access", "expires_in": 3600}

    connector = GmailConnector(
        access_token="expired",
        refresh_token="refresh-2",
        client_id="cid-2",
        client_secret="secret-2",
        request_json=fake_request_json,
        token_request_json=fake_token_request_json,
    )

    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is False
    assert called["token"] == 1
    assert called["messages"] == 2


def test_gmail_connector_applies_query_and_label_filters() -> None:
    captured = {"query": None}

    def fake_request_json(*, method: str, path: str, query=None, body=None):
        if path == "/messages":
            captured["query"] = dict(query or {})
            return {"messages": []}
        raise AssertionError(path)

    connector = GmailConnector(
        access_token="token",
        query_filter="from:no-reply@accounts.google.com newer_than:7d",
        label_ids=["INBOX", "UNREAD"],
        include_spam_trash=False,
        initial_after_epoch=1700000000,
        request_json=fake_request_json,
    )

    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is False
    assert isinstance(captured["query"], dict)
    query = captured["query"]
    assert query["maxResults"] == 10
    assert query["includeSpamTrash"] == "false"
    assert query["labelIds"] == ["INBOX", "UNREAD"]
    assert "after:1700000000" in query["q"]
    assert "from:no-reply@accounts.google.com" in query["q"]


def test_gmail_connector_does_not_download_blocked_extension(tmp_path: Path) -> None:
    message_payload = {
        "id": "msg_3",
        "threadId": "th_3",
        "internalDate": "1700000000000",
        "payload": {
            "headers": [{"name": "Subject", "value": "blocked"}],
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "application/octet-stream",
                    "filename": "setup.exe",
                    "body": {"attachmentId": "att_3", "size": 100},
                }
            ],
        },
    }

    def fake_request_json(*, method: str, path: str, query=None, body=None):
        if path == "/messages":
            return {"messages": [{"id": "msg_3"}]}
        if path == "/messages/msg_3":
            return message_payload
        if path == "/messages/msg_3/attachments/att_3":
            raise AssertionError("blocked extension should not be downloaded")
        raise AssertionError(path)

    connector = GmailConnector(
        access_token="token",
        attachment_root=tmp_path / "att",
        blocked_attachment_extensions=(".exe", ".dmg"),
        request_json=fake_request_json,
    )

    result = connector.fetch_since(cursor=None, limit=10)
    assert result.partial is False
    assert len(result.events) == 1
    attachment = result.events[0].attachments[0]
    assert attachment.type == "reference_attachment"
    assert attachment.local_path is None
    assert attachment.metadata["blocked_extension"] == ".exe"
