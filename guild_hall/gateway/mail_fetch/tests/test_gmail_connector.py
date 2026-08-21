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


def test_gmail_oauth_error_classification_invalid_grant() -> None:
    import io
    import urllib.error
    from collector.connectors.gmail import _classify_oauth_error

    secret_raw = "SECRET_TOKEN_VALUE_XYZ"
    fp = io.BytesIO(f'{{"error": "invalid_grant", "error_description": "Token has been expired or revoked: {secret_raw}"}}'.encode("utf-8"))
    http_error = urllib.error.HTTPError(
        url="https://oauth2.googleapis.com/token",
        code=400,
        msg="Bad Request",
        hdrs={},
        fp=fp,
    )

    code, retryable, detail = _classify_oauth_error(http_error)
    assert code == "auth_invalid_grant"
    assert retryable is False
    assert detail == {"status": 400, "auth_error": "auth_invalid_grant"}
    assert "body" not in detail
    assert "error_description" not in detail
    assert secret_raw not in json.dumps(detail)
    assert "Token has been expired" not in json.dumps(detail)


def test_gmail_oauth_error_classification_terminal_and_transient() -> None:
    import io
    import urllib.error
    from collector.connectors.gmail import _classify_oauth_error

    # 1. Revoked -> auth_token_revoked, retryable=False
    fp_rev = io.BytesIO(b'{"error": "unauthorized", "error_description": "Token has been revoked"}')
    h_rev = urllib.error.HTTPError("https://oauth2.googleapis.com/token", 400, "Bad Request", {}, fp_rev)
    c, r, d = _classify_oauth_error(h_rev)
    assert c == "auth_token_revoked"
    assert r is False
    assert d == {"status": 400, "auth_error": "auth_token_revoked"}

    # 2. Consent required -> auth_consent_required, retryable=False
    fp_con = io.BytesIO(b'{"error": "consent_required", "error_description": "User consent required"}')
    h_con = urllib.error.HTTPError("https://oauth2.googleapis.com/token", 400, "Bad Request", {}, fp_con)
    c, r, d = _classify_oauth_error(h_con)
    assert c == "auth_consent_required"
    assert r is False
    assert d == {"status": 400, "auth_error": "auth_consent_required"}

    # 3. MFA required -> auth_mfa_required, retryable=False
    fp_mfa = io.BytesIO(b'{"error": "mfa_required", "error_description": "Two-step verification required"}')
    h_mfa = urllib.error.HTTPError("https://oauth2.googleapis.com/token", 400, "Bad Request", {}, fp_mfa)
    c, r, d = _classify_oauth_error(h_mfa)
    assert c == "auth_mfa_required"
    assert r is False
    assert d == {"status": 400, "auth_error": "auth_mfa_required"}

    # 4. Invalid client -> auth_invalid_client, retryable=False
    fp_cli = io.BytesIO(b'{"error": "invalid_client", "error_description": "Client authentication failed"}')
    h_cli = urllib.error.HTTPError("https://oauth2.googleapis.com/token", 401, "Unauthorized", {}, fp_cli)
    c, r, d = _classify_oauth_error(h_cli)
    assert c == "auth_invalid_client"
    assert r is False
    assert d == {"status": 401, "auth_error": "auth_invalid_client"}

    # 5. 503 Service Unavailable -> auth_transient_retry, retryable=True
    fp_503 = io.BytesIO(b"Service Unavailable")
    h_503 = urllib.error.HTTPError("https://oauth2.googleapis.com/token", 503, "Service Unavailable", {}, fp_503)
    c, r, d = _classify_oauth_error(h_503)
    assert c == "auth_transient_retry"
    assert r is True
    assert d == {"status": 503, "auth_error": "auth_transient_retry"}
    assert "body" not in d

    # 6. 429 Rate Limit -> auth_transient_retry, retryable=True
    fp_429 = io.BytesIO(b"Too Many Requests")
    h_429 = urllib.error.HTTPError("https://oauth2.googleapis.com/token", 429, "Too Many Requests", {}, fp_429)
    c, r, d = _classify_oauth_error(h_429)
    assert c == "auth_transient_retry"
    assert r is True
    assert d == {"status": 429, "auth_error": "auth_transient_retry"}

    # 7. Unknown 400 error -> auth_unknown_failure, retryable=False
    fp_unk = io.BytesIO(b"Unknown client failure")
    h_unk = urllib.error.HTTPError("https://oauth2.googleapis.com/token", 400, "Bad Request", {}, fp_unk)
    c, r, d = _classify_oauth_error(h_unk)
    assert c == "auth_unknown_failure"
    assert r is False
    assert d == {"status": 400, "auth_error": "auth_unknown_failure"}
