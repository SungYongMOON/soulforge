from __future__ import annotations

import json
from pathlib import Path

from collector.models import Address, Attachment, EmailEvent
from collector.ops.notify import (
    enqueue_mail_received_notifications,
    format_mail_received_brief,
    mail_received_notify_status,
)


def _write_policy(repo_root: Path, *, mail_received: bool) -> Path:
    policy_file = repo_root / "guild_hall" / "state" / "gateway" / "bindings" / "notify_policy.yaml"
    policy_file.parent.mkdir(parents=True, exist_ok=True)
    policy_file.write_text(
        "\n".join(
            [
                "kind: gateway_notify_policy",
                "scope: gateway",
                "channels:",
                "  telegram:",
                "    enabled: true",
                "    env_file: guild_hall/state/town_crier/telegram_notify.env",
                "events:",
                "  monster_created:",
                "    telegram: false",
                "  mail_received:",
                f"    telegram: {'true' if mail_received else 'false'}",
                "updated_at: null",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return policy_file


def _hiworks_event() -> EmailEvent:
    return EmailEvent(
        event_id="hiworks-msg-1",
        source="hiworks",
        provider_message_id="provider-1",
        subject="견적서 검토 요청 https://example.test/private",
        from_addrs=[Address(name="홍길동", address="hong@example.test")],
        received_at="2026-05-08T04:43:20+00:00",
        attachments=[
            Attachment(type="binary_attachment", name="secret.pdf"),
            Attachment(type="body_link", mime="text/uri-list", url="https://example.test/banner.png"),
        ],
        body_text="본문은 알림에 들어가면 안 됩니다.",
        body_html="<html>본문</html>",
        raw={"raw": "raw body must not appear"},
    )


def test_format_mail_received_brief_is_korean_and_body_safe() -> None:
    message = format_mail_received_brief(_hiworks_event())

    assert message.startswith("새 하이웍스 메일이 도착했습니다.")
    assert "제목은 견적서 검토 요청 [redacted]입니다." in message
    assert "보낸 사람은 홍길동입니다." in message
    assert "첨부 파일은 1개 있습니다." in message
    assert "수신 시각은 오후 1시 43분입니다." in message
    assert "다음 행동: 하이웍스 메일함을 확인해 주세요." in message
    assert "본문" not in message
    assert "secret.pdf" not in message
    assert "example.test/private" not in message


def test_format_mail_received_brief_does_not_count_body_links_as_attachments() -> None:
    event = _hiworks_event()
    event.attachments = [
        Attachment(type="body_link", mime="text/uri-list", url="https://example.test/banner.png"),
        Attachment(type="body_link", mime="text/uri-list", url="https://example.test/profile"),
    ]

    message = format_mail_received_brief(event)

    assert "첨부 파일은 없습니다." in message


def test_mail_received_policy_gates_notification_queue(tmp_path: Path) -> None:
    _write_policy(tmp_path, mail_received=False)
    disabled = mail_received_notify_status(tmp_path)
    assert disabled.enabled is False

    result = enqueue_mail_received_notifications(tmp_path, [_hiworks_event()])
    assert result.enabled is False
    assert result.queued == 0
    assert not (tmp_path / "guild_hall" / "state" / "town_crier" / "queue" / "pending").exists()


def test_enqueue_mail_received_notification_writes_town_crier_request(tmp_path: Path) -> None:
    _write_policy(tmp_path, mail_received=True)

    result = enqueue_mail_received_notifications(tmp_path, [_hiworks_event()])

    assert result.enabled is True
    assert result.queued == 1
    assert len(result.queue_files) == 1

    queue_file = tmp_path / result.queue_files[0]
    payload = json.loads(queue_file.read_text(encoding="utf-8"))
    assert payload["owner_scope"] == "gateway"
    assert payload["event"] == "mail_received"
    assert payload["channel"] == "telegram"
    assert payload["source_ref"] == "hiworks-msg-1"
    assert payload["env_file"] == "guild_hall/state/town_crier/telegram_notify.env"
    assert "새 하이웍스 메일이 도착했습니다." in payload["text"]
    assert "본문" not in payload["text"]
    assert "secret.pdf" not in payload["text"]
