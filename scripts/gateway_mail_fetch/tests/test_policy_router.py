from __future__ import annotations

from pathlib import Path

from collector.models import Address, Attachment, EmailEvent
from collector.pipeline.policy_router import apply_mail_policies


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
    assert "/company/ads/attachments/hiworks/" in str(moved_path)


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
