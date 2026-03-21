from __future__ import annotations

from collector.models import Address, Attachment, EmailEvent
from collector.pipeline.normalize import normalize_events


def test_normalize_adds_body_links_and_downgrades_large_attachment() -> None:
    event = EmailEvent(
        event_id="",
        source="gmail",
        provider_message_id="m1",
        subject="hello",
        from_addrs=[Address(name="A", address="a@example.com")],
        to_addrs=[Address(name="B", address="b@example.com")],
        cc_addrs=[],
        received_at="2026-03-05T00:00:00+00:00",
        body_text="link https://drive.google.com/file/d/123",
        attachments=[
            Attachment(type="binary_attachment", name="big.pdf", size=31 * 1024 * 1024),
        ],
    )

    rows = normalize_events([event], allowed_hosts=["drive.google.com"], attachment_max_bytes=30 * 1024 * 1024)
    assert len(rows) == 1
    out = rows[0]
    assert out.event_id
    assert out.attachments[0].type == "reference_attachment"
    body_links = [x for x in out.attachments if x.type == "body_link"]
    assert len(body_links) == 1
    assert body_links[0].metadata and body_links[0].metadata["allowed_host"] is True


def test_normalize_keeps_attachment_at_30mb_boundary() -> None:
    max_bytes = 30 * 1024 * 1024
    event = EmailEvent(
        event_id="evt",
        source="gmail",
        provider_message_id="m2",
        subject="boundary",
        from_addrs=[Address(name="A", address="a@example.com")],
        to_addrs=[Address(name="B", address="b@example.com")],
        cc_addrs=[],
        received_at="2026-03-05T00:00:00+00:00",
        attachments=[
            Attachment(type="binary_attachment", name="equal.bin", size=max_bytes),
        ],
    )

    rows = normalize_events([event], allowed_hosts=[], attachment_max_bytes=max_bytes)
    assert len(rows) == 1
    assert rows[0].attachments[0].type == "binary_attachment"
