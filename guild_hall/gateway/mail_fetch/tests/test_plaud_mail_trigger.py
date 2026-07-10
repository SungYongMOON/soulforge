from __future__ import annotations

import json

from collector.models import Address, Attachment, EmailEvent
from collector.ops.plaud_trigger import enqueue_plaud_mail_triggers


def _event(*, sender: str, subject: str, body: str = "", attachment_name: str = "") -> EmailEvent:
    attachments = []
    if attachment_name:
        attachments.append(Attachment(type="binary_attachment", name=attachment_name, mime="text/plain"))
    return EmailEvent(
        event_id="hiworks-event-private-id",
        source="hiworks",
        provider_message_id="provider-message-private-id",
        subject=subject,
        from_addrs=[Address(name="PLAUD", address=sender)],
        received_at="2026-07-10T10:00:00+00:00",
        body_text=body,
        attachments=attachments,
    )


def test_plaud_transcript_notice_writes_sanitized_shared_trigger(tmp_path) -> None:
    queue_root = tmp_path / "_workspaces" / "system" / "voice_capture" / "plaud_mail_triggers"
    event = _event(sender="notice@plaud.ai", subject="Your transcript is ready", body="https://web.plaud.ai/s/private-token")

    first = enqueue_plaud_mail_triggers(queue_root, [event], enabled=True)
    second = enqueue_plaud_mail_triggers(queue_root, [event], enabled=True)

    assert first.queued == 1
    assert second.duplicates == 1
    files = list((queue_root / "pending").glob("*.json"))
    assert len(files) == 1
    payload = json.loads(files[0].read_text(encoding="utf-8"))
    rendered = json.dumps(payload, ensure_ascii=False)
    assert "private-token" not in rendered
    assert "provider-message-private-id" not in rendered
    assert "hiworks-event-private-id" not in rendered
    assert payload["mail_body_included"] is False
    assert payload["provider_link_included"] is False


def test_plaud_trigger_requires_allowed_sender_and_transcript_signal(tmp_path) -> None:
    queue_root = tmp_path / "queue"
    marketing = _event(sender="notice@plaud.ai", subject="PLAUD weekly news")
    body_only = _event(sender="notice@plaud.ai", subject="PLAUD product update", body="Try our transcript feature")
    spoof = _event(sender="attacker@example.test", subject="Your transcript is ready")
    attachment = _event(sender="notice@sub.plaud.ai", subject="Recording complete", attachment_name="회의_전사.txt")

    result = enqueue_plaud_mail_triggers(queue_root, [marketing, body_only, spoof, attachment], enabled=True)

    assert result.matched == 1
    assert result.queued == 1
    assert result.skipped == 3


def test_plaud_trigger_does_not_requeue_an_unresolved_mail(tmp_path) -> None:
    queue_root = tmp_path / "queue"
    event = _event(sender="notice@plaud.ai", subject="Your transcript is ready")
    first = enqueue_plaud_mail_triggers(queue_root, [event], enabled=True)
    pending = next((queue_root / "pending").glob("*.json"))
    unresolved = queue_root / "unresolved" / "2026-07-10" / pending.name
    unresolved.parent.mkdir(parents=True)
    pending.replace(unresolved)

    second = enqueue_plaud_mail_triggers(queue_root, [event], enabled=True)

    assert first.queued == 1
    assert second.duplicates == 1
    assert second.queued == 0
