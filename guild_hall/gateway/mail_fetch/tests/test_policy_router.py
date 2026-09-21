from __future__ import annotations

from pathlib import Path

from collector.models import Address, Attachment, EmailEvent
from collector.pipeline.policy_router import DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS, apply_mail_policies


def _event_with_attachment(*, subject: str, attachment: Attachment) -> EmailEvent:
    return EmailEvent(
        event_id="evt-policy-1",
        source="hiworks",
        provider_message_id="msg-policy-1",
        subject=subject,
        from_addrs=[Address(name="", address="sender@example.com")],
        received_at="2026-03-05T00:00:00+00:00",
        attachments=[attachment],
        raw={"headers": {"list-unsubscribe": "<mailto:unsubscribe@example.com>"}},
    )


def test_apply_mail_policies_routes_ads_and_moves_attachment(tmp_path: Path) -> None:
    src_dir = tmp_path / "src"
    src_dir.mkdir(parents=True, exist_ok=True)
    src_file = src_dir / "banner.png"
    src_file.write_bytes(b"image-bytes")

    event = _event_with_attachment(
        subject="[광고] 프로모션 안내",
        attachment=Attachment(type="binary_attachment", name="banner.png", local_path=str(src_file)),
    )

    out = apply_mail_policies(
        [event],
        source="hiworks",
        inbox_root=tmp_path / "_inbox",
        workspace="company",
        blocked_extensions=(),
        ad_keywords=("[광고]",),
        ad_sender_domains=(),
    )

    assert len(out) == 1
    result = out[0]
    assert result.metadata["classification"]["bucket"] == "ads"
    moved_path = Path(result.attachments[0].local_path or "")
    assert moved_path.exists()
    assert "/company/ads/attachments/hiworks/" in moved_path.as_posix()


def test_apply_mail_policies_routes_quarantine_for_blocked_extension(tmp_path: Path) -> None:
    event = _event_with_attachment(
        subject="업무 전달",
        attachment=Attachment(type="reference_attachment", name="installer.dmg", local_path=None),
    )

    out = apply_mail_policies(
        [event],
        source="hiworks",
        inbox_root=tmp_path / "_inbox",
        workspace="company",
        blocked_extensions=(".dmg", ".exe"),
        ad_keywords=("[광고]",),
        ad_sender_domains=(),
    )

    assert len(out) == 1
    result = out[0]
    assert result.metadata["classification"]["bucket"] == "quarantine"
    assert result.metadata["classification"]["blocked_attachment_count"] == 1
    assert "blocked_attachment_extension" in result.metadata["classification"]["reasons"]
    policy = result.attachments[0].metadata["policy"]
    assert policy["blocked_extension"] == ".dmg"


def test_apply_mail_policies_body_link_com_url_not_quarantined(tmp_path: Path) -> None:
    """Golden case: body_link URL path ends with an email address (.../user@example.com).
    The URL suffix must not be treated as an attachment extension."""
    event = EmailEvent(
        event_id="evt-link-com",
        source="hiworks",
        provider_message_id="msg-link-com",
        subject="수신확인 링크 메일",
        from_addrs=[Address(name="", address="sender@example.com")],
        received_at="2026-09-17T13:11:01+00:00",
        attachments=[
            Attachment(
                type="body_link",
                name=None,
                mime="text/uri-list",
                url="https://mail-api.example.com/v2/office/00000/receipt-confirm/20260101000000_0000000000_example.com_user/email/user@example.com",
            )
        ],
        raw=None,
    )

    out = apply_mail_policies(
        [event],
        source="hiworks",
        inbox_root=tmp_path / "_inbox",
        workspace="company",
        blocked_extensions=DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS,
        ad_keywords=(),
        ad_sender_domains=(),
    )

    result = out[0]
    assert result.metadata["classification"]["bucket"] == "mail"
    assert result.metadata["classification"]["blocked_attachment_count"] == 0
    assert "blocked_attachment_extension" not in result.metadata["classification"]["reasons"]
    assert (result.attachments[0].metadata or {}).get("policy", {}).get("blocked_extension") is None


def test_apply_mail_policies_real_com_file_still_quarantined(tmp_path: Path) -> None:
    """A real attachment whose filename is *.com must stay quarantined."""
    event = EmailEvent(
        event_id="evt-file-com",
        source="hiworks",
        provider_message_id="msg-file-com",
        subject="실행 파일 첨부",
        from_addrs=[Address(name="", address="sender@example.com")],
        received_at="2026-09-17T13:11:01+00:00",
        attachments=[Attachment(type="binary_attachment", name="payload.com", local_path=None)],
        raw=None,
    )

    out = apply_mail_policies(
        [event],
        source="hiworks",
        inbox_root=tmp_path / "_inbox",
        workspace="company",
        blocked_extensions=DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS,
        ad_keywords=(),
        ad_sender_domains=(),
    )

    result = out[0]
    assert result.metadata["classification"]["bucket"] == "quarantine"
    assert result.metadata["classification"]["reasons"] == ["blocked_attachment_extension"]
    assert result.metadata["classification"]["blocked_attachment_count"] == 1
    assert result.attachments[0].metadata["policy"]["blocked_extension"] == ".com"


def test_apply_mail_policies_body_link_materialized_exe_path_still_quarantined(tmp_path: Path) -> None:
    """A body_link whose materialized local_path is *.exe must stay quarantined:
    only the URL fallback is skipped, not the name/local_path checks."""
    event = EmailEvent(
        event_id="evt-link-exe",
        source="hiworks",
        provider_message_id="msg-link-exe",
        subject="링크 첨부",
        from_addrs=[Address(name="", address="sender@example.com")],
        received_at="2026-09-17T13:11:01+00:00",
        attachments=[
            Attachment(
                type="body_link",
                name=None,
                mime="text/uri-list",
                url="https://mail-api.example.com/v2/office/00000/email/user@example.com",
                local_path=str(tmp_path / "payload.exe"),
            )
        ],
        raw=None,
    )

    out = apply_mail_policies(
        [event],
        source="hiworks",
        inbox_root=tmp_path / "_inbox",
        workspace="company",
        blocked_extensions=DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS,
        ad_keywords=(),
        ad_sender_domains=(),
    )

    result = out[0]
    assert result.metadata["classification"]["bucket"] == "quarantine"
    assert "blocked_attachment_extension" in result.metadata["classification"]["reasons"]
    assert result.attachments[0].metadata["policy"]["blocked_extension"] == ".exe"
