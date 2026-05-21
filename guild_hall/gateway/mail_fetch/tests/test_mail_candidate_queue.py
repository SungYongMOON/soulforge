from __future__ import annotations

import json
from pathlib import Path

from collector.models import Address, Attachment, EmailEvent
from collector.storage.mail_candidate_queue import MailCandidateQueue


def _event(*, bucket: str = "mail") -> EmailEvent:
    return EmailEvent(
        event_id="hiworks_evt_candidate_001",
        source="hiworks",
        provider_message_id="<provider-message@example.test>",
        subject="PDR 검토 요청",
        from_addrs=[Address(name="PM", address="pm@example.test")],
        to_addrs=[Address(name="Owner", address="owner@example.test")],
        cc_addrs=[Address(name="Reviewer", address="reviewer@example.test")],
        received_at="2026-03-19T00:15:00+00:00",
        body_text="메일 본문은 후보 큐에 들어가면 안 됩니다. https://example.test/private",
        body_html="<html><body>비공개 본문</body></html>",
        attachments=[
            Attachment(
                type="reference_attachment",
                name="private-checklist.xlsx",
                url="https://example.test/private-checklist.xlsx",
            ),
            Attachment(
                type="body_link",
                mime="text/uri-list",
                url="https://example.test/signature.png",
            ),
        ],
        raw={"raw": "raw body must not appear"},
        metadata={
            "classification": {
                "bucket": bucket,
                "reasons": ["policy_test"],
                "ad_detected": bucket == "ads",
                "blocked_attachment_count": 0,
            }
        },
    )


def test_mail_candidate_queue_writes_body_safe_pending_item(tmp_path: Path) -> None:
    queue = MailCandidateQueue(
        repo_root=tmp_path,
        queue_root=tmp_path / "guild_hall" / "state" / "gateway" / "mail_candidate",
        inbox_root=tmp_path / "guild_hall" / "state" / "gateway" / "mailbox",
    )

    result = queue.enqueue_events([_event()])

    assert result.queued == 1
    assert result.skipped == 0
    assert len(result.queue_files) == 1

    payload = json.loads((tmp_path / result.queue_files[0]).read_text(encoding="utf-8"))
    rendered = json.dumps(payload, ensure_ascii=False)

    assert payload["schema_version"] == "mail_candidate.queue_item.v1"
    assert payload["status"] == "pending_review"
    assert payload["source_event"]["source"] == "hiworks"
    assert payload["source_event"]["workspace"] == "company"
    assert payload["source_event"]["event_file"].endswith(
        "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl"
    )
    assert payload["mail_summary"]["subject"] == "PDR 검토 요청"
    assert payload["mail_summary"]["attachment_count"] == 1
    assert payload["mail_summary"]["attachment_types"] == ["reference_attachment"]
    assert payload["business_review"]["next_action"] == "review_for_mail_intake_request"

    assert "메일 본문" not in rendered
    assert "비공개 본문" not in rendered
    assert "raw body" not in rendered
    assert "private-checklist.xlsx" not in rendered
    assert "example.test/private" not in rendered


def test_mail_candidate_queue_skips_non_mail_buckets_and_is_idempotent(tmp_path: Path) -> None:
    queue = MailCandidateQueue(
        repo_root=tmp_path,
        queue_root=tmp_path / "guild_hall" / "state" / "gateway" / "mail_candidate",
        inbox_root=tmp_path / "guild_hall" / "state" / "gateway" / "mailbox",
    )

    skipped = queue.enqueue_events([_event(bucket="ads")])
    first = queue.enqueue_events([_event()])
    second = queue.enqueue_events([_event()])

    assert skipped.queued == 0
    assert skipped.skipped_reason == "no_candidate_events"
    assert first.queued == 1
    assert second.queued == 0
    assert second.skipped == 1
    assert second.skipped_reason == "already_queued"
