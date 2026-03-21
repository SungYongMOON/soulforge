from __future__ import annotations

from pathlib import Path

from collector.models import Attachment, EmailEvent
from collector.pipeline.link_downloader import (
    LinkDownloadConfig,
    _DownloadError,
    hydrate_link_attachments,
)


def _event_with_link(*, url: str) -> EmailEvent:
    return EmailEvent(
        event_id="evt-link-1",
        source="gmail",
        provider_message_id="msg-link-1",
        subject="subject",
        received_at="2026-03-05T00:00:00+00:00",
        attachments=[
            Attachment(
                type="body_link",
                url=url,
                metadata={},
            )
        ],
    )


def test_hydrate_link_attachments_downloads_allowed_host(tmp_path: Path) -> None:
    event = _event_with_link(url="https://drive.google.com/file/d/123/view")
    config = LinkDownloadConfig(
        enabled=True,
        allowed_hosts=("drive.google.com",),
        denied_hosts=(),
        max_bytes=1024,
        retry_max=1,
    )

    def fake_request(url: str):
        assert "drive.google.com" in url
        return b"hello-link", {"content_type": "text/plain", "final_url": url}

    events, result = hydrate_link_attachments(
        [event],
        source="gmail",
        attachment_root=tmp_path / "attachments",
        config=config,
        request_bytes=fake_request,
    )

    assert len(events) == 1
    assert result.attempted == 1
    assert result.downloaded == 1
    assert result.failed == 0
    attachment = events[0].attachments[0]
    assert attachment.local_path is not None
    assert Path(attachment.local_path).exists()
    assert attachment.metadata["link_download"]["status"] == "downloaded"


def test_hydrate_link_attachments_skips_not_allowed_host(tmp_path: Path) -> None:
    event = _event_with_link(url="https://example.com/files/abc.zip")
    config = LinkDownloadConfig(
        enabled=True,
        allowed_hosts=("drive.google.com",),
        denied_hosts=(),
        max_bytes=1024,
        retry_max=1,
    )

    events, result = hydrate_link_attachments(
        [event],
        source="gmail",
        attachment_root=tmp_path / "attachments",
        config=config,
        request_bytes=lambda _: (b"should-not-run", {"content_type": "application/octet-stream"}),
    )

    assert len(events) == 1
    assert result.attempted == 0
    assert result.downloaded == 0
    assert result.skipped_not_allowed_host == 1
    assert result.failed == 0
    attachment = events[0].attachments[0]
    assert attachment.local_path is None
    assert attachment.metadata["link_download"]["reason"] == "not_allowed_host"


def test_hydrate_link_attachments_skips_blocked_extension(tmp_path: Path) -> None:
    event = _event_with_link(url="https://drive.google.com/file/d/setup.exe")
    config = LinkDownloadConfig(
        enabled=True,
        allowed_hosts=("drive.google.com",),
        denied_hosts=(),
        blocked_extensions=(".exe",),
        max_bytes=1024,
        retry_max=1,
    )

    events, result = hydrate_link_attachments(
        [event],
        source="gmail",
        attachment_root=tmp_path / "attachments",
        config=config,
        request_bytes=lambda _: (b"should-not-run", {"content_type": "application/octet-stream"}),
    )

    assert len(events) == 1
    assert result.attempted == 0
    assert result.downloaded == 0
    assert result.skipped_blocked_extension == 1
    assert result.failed == 0
    attachment = events[0].attachments[0]
    assert attachment.metadata["link_download"]["reason"] == "blocked_extension"
    assert attachment.metadata["link_download"]["extension"] == ".exe"


def test_hydrate_link_attachments_marks_partial_on_unexpected_error(tmp_path: Path) -> None:
    event = _event_with_link(url="https://drive.google.com/file/d/123/view")
    config = LinkDownloadConfig(
        enabled=True,
        allowed_hosts=("drive.google.com",),
        denied_hosts=(),
        max_bytes=1024,
        retry_max=1,
    )

    def boom(_: str):
        raise RuntimeError("boom")

    events, result = hydrate_link_attachments(
        [event],
        source="gmail",
        attachment_root=tmp_path / "attachments",
        config=config,
        request_bytes=boom,
    )

    assert len(events) == 1
    assert result.attempted == 1
    assert result.downloaded == 0
    assert result.failed == 1
    assert result.errors
    assert result.errors[0].code == "link_download_unexpected_error"
    assert events[0].ingest_status == "partial"


def test_hydrate_link_attachments_skips_auth_required_without_partial(tmp_path: Path) -> None:
    event = _event_with_link(url="https://mail-api.office.hiworks.com/v2/office/x")
    config = LinkDownloadConfig(
        enabled=True,
        allowed_hosts=("mail-api.office.hiworks.com",),
        denied_hosts=(),
        max_bytes=1024,
        retry_max=1,
    )

    def auth_required(_: str):
        raise _DownloadError(
            code="link_http_401",
            message="링크 첨부 다운로드 실패(http 401)",
            retryable=False,
            detail={"status": 401},
        )

    events, result = hydrate_link_attachments(
        [event],
        source="hiworks",
        attachment_root=tmp_path / "attachments",
        config=config,
        request_bytes=auth_required,
    )

    assert len(events) == 1
    assert result.attempted == 1
    assert result.downloaded == 0
    assert result.skipped_auth_required == 1
    assert result.failed == 0
    assert result.errors == []
    assert events[0].ingest_status == "ok"
    assert events[0].attachments[0].metadata["link_download"]["reason"] == "auth_required"
