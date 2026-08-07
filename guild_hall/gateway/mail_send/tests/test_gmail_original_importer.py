from __future__ import annotations

from email import policy
from email.message import EmailMessage
import io
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

from guild_hall.gateway.mail_send.gmail_original_importer import (
    EXPECTED_GMAIL_ACCOUNT,
    ImporterError,
    import_message,
    import_raw_message,
    inspect_source,
    preview_document,
)


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.body = io.BytesIO(json.dumps(payload).encode("utf-8"))

    def read(self) -> bytes:
        return self.body.read()

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None


class FakeGoogle:
    def __init__(self) -> None:
        self.requests = []

    def __call__(self, request, **_kwargs):
        self.requests.append(request)
        if request.full_url == "https://oauth2.googleapis.com/token":
            return FakeResponse({"access_token": "test-access-token"})
        return FakeResponse({"id": "gmail-message-123", "threadId": "gmail-thread-123"})


def _write_eml(root: Path, name: str = "source.eml") -> Path:
    message = EmailMessage()
    message["From"] = "Kim Min Jae <mjkim@sonartech.com>"
    message["To"] = "seabot.moon@sonartech.com"
    message["Cc"] = "team@sonartech.com"
    message["Date"] = "Thu, 06 Aug 2026 17:40:00 +0900"
    message["Message-ID"] = "<source-message@sonartech.com>"
    message["Subject"] = "DSSS STM 납기 정보입니다."
    message.set_content("original plain body")
    message.add_alternative("<html><body><b>original html body</b></body></html>", subtype="html")
    path = root / name
    path.write_bytes(message.as_bytes(policy=policy.SMTP))
    return path


def _write_oauth_files(config_root: Path) -> tuple[Path, Path]:
    client = config_root / "client.json"
    client.write_text(
        json.dumps(
            {
                "installed": {
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            }
        ),
        encoding="utf-8",
    )
    token = config_root / "token.json"
    token.write_text(
        json.dumps({"refresh_token": "refresh-token", "authorized_account": EXPECTED_GMAIL_ACCOUNT}),
        encoding="utf-8",
    )
    return client, token


def _write_oauth_env(config_root: Path) -> Path:
    path = config_root / "mail_fetch.env"
    path.write_text(
        "GMAIL_CLIENT_ID=client-id\n"
        "GMAIL_CLIENT_SECRET=client-secret\n"
        "GMAIL_TOKEN_URI=https://oauth2.googleapis.com/token\n",
        encoding="utf-8",
    )
    return path


def test_preview_preserves_original_metadata_and_emits_approval_token(tmp_path: Path) -> None:
    source = _write_eml(tmp_path)
    preview = inspect_source(source, tmp_path)
    document = preview_document(preview)
    assert document["status"] == "approval_required"
    assert document["target_account"] == EXPECTED_GMAIL_ACCOUNT
    assert document["from"] == "Kim Min Jae <mjkim@sonartech.com>"
    assert document["date"] == "Thu, 06 Aug 2026 17:40:00 +0900"
    assert document["message_id"] == "<source-message@sonartech.com>"
    assert document["subject"] == "DSSS STM 납기 정보입니다."
    assert document["approval_token"] == preview.sha256[:16]
    assert document["gmail_internal_date_source"] == "dateHeader"


def test_preview_rejects_source_outside_custody_root(tmp_path: Path) -> None:
    custody = tmp_path / "custody"
    custody.mkdir()
    source = _write_eml(tmp_path)
    with pytest.raises(ImporterError, match="path_outside_allowed_root"):
        inspect_source(source, custody)


def test_apply_requires_exact_preview_token(tmp_path: Path) -> None:
    source = _write_eml(tmp_path)
    preview = inspect_source(source, tmp_path)
    client, token = _write_oauth_files(tmp_path)
    with pytest.raises(ImporterError, match="approval_token_mismatch"):
        import_message(preview, "wrong", client, None, token, tmp_path, tmp_path / "receipts", opener=FakeGoogle())


def test_apply_imports_original_rfc822_to_inbox_and_writes_receipt(tmp_path: Path) -> None:
    source = _write_eml(tmp_path)
    original = source.read_bytes()
    preview = inspect_source(source, tmp_path)
    client, token = _write_oauth_files(tmp_path)
    google = FakeGoogle()
    receipts = tmp_path / "receipts"
    result = import_message(
        preview,
        preview.approval_token,
        client,
        None,
        token,
        tmp_path,
        receipts,
        opener=google,
    )
    assert result["status"] == "imported"
    assert result["target_account"] == EXPECTED_GMAIL_ACCOUNT
    assert result["receipt_written"] is True
    assert len(google.requests) == 2
    upload = google.requests[1]
    query = parse_qs(urlparse(upload.full_url).query)
    assert query["uploadType"] == ["multipart"]
    assert query["internalDateSource"] == ["dateHeader"]
    assert query["neverMarkSpam"] == ["true"]
    assert upload.headers["Content-type"].startswith("multipart/related;")
    assert b'{"labelIds":["INBOX"]}' in upload.data
    assert original in upload.data
    receipt = receipts / f"{preview.sha256}.json"
    assert receipt.is_file()
    stored = json.loads(receipt.read_text(encoding="utf-8"))
    assert stored["source_sha256"] == preview.sha256
    assert stored["requested_labels"] == ["INBOX"]
    assert "gmail_message_id" not in stored


def test_apply_can_reuse_private_mail_fetch_client_without_reusing_its_token(tmp_path: Path) -> None:
    source = _write_eml(tmp_path)
    preview = inspect_source(source, tmp_path)
    _, token = _write_oauth_files(tmp_path)
    client_env = _write_oauth_env(tmp_path)
    google = FakeGoogle()
    result = import_message(
        preview,
        preview.approval_token,
        None,
        client_env,
        token,
        tmp_path,
        tmp_path / "receipts",
        opener=google,
    )
    assert result["status"] == "imported"
    token_request = google.requests[0].data.decode("ascii")
    assert "refresh-token" in token_request
    assert "GMAIL_REFRESH_TOKEN" not in token_request


def test_apply_is_idempotent_after_receipt(tmp_path: Path) -> None:
    source = _write_eml(tmp_path)
    preview = inspect_source(source, tmp_path)
    client, token = _write_oauth_files(tmp_path)
    receipts = tmp_path / "receipts"
    import_message(preview, preview.approval_token, client, None, token, tmp_path, receipts, opener=FakeGoogle())
    with pytest.raises(ImporterError, match="message_already_imported"):
        import_message(preview, preview.approval_token, client, None, token, tmp_path, receipts, opener=FakeGoogle())


def test_continuous_raw_import_treats_existing_receipt_as_success(tmp_path: Path) -> None:
    source = _write_eml(tmp_path)
    original = source.read_bytes()
    client, token = _write_oauth_files(tmp_path)
    receipts = tmp_path / "receipts"
    first = import_raw_message(original, client, None, token, tmp_path, receipts, opener=FakeGoogle())
    second = import_raw_message(original, client, None, token, tmp_path, receipts, opener=FakeGoogle())
    assert first["status"] == "imported"
    assert second["status"] == "already_imported"
    assert second["inbox_requested"] is True


def test_apply_detects_source_change_after_preview(tmp_path: Path) -> None:
    source = _write_eml(tmp_path)
    preview = inspect_source(source, tmp_path)
    client, token = _write_oauth_files(tmp_path)
    source.write_bytes(source.read_bytes() + b"changed")
    google = FakeGoogle()
    with pytest.raises(ImporterError, match="source_changed_after_preview"):
        import_message(
            preview,
            preview.approval_token,
            client,
            None,
            token,
            tmp_path,
            tmp_path / "receipts",
            opener=google,
        )
    assert google.requests == []
