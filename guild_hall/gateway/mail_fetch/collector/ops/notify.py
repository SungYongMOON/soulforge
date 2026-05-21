from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Sequence
from uuid import uuid4

from ..models import EmailEvent, message_attachment_count


MAIL_RECEIVED_EVENT = "mail_received"
DEFAULT_TELEGRAM_ENV_FILE = "guild_hall/state/town_crier/telegram_notify.env"
REDACTED_TEXT = "[redacted]"
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")


@dataclass
class MailNotifyStatus:
    enabled: bool
    channel_enabled: bool
    event_enabled: bool
    policy_file: str
    env_file: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MailNotifyResult:
    enabled: bool
    queued: int = 0
    skipped_reason: str = ""
    queue_files: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "queued": self.queued,
            "skipped_reason": self.skipped_reason,
            "queue_files": list(self.queue_files),
        }


def gateway_notify_policy_file(repo_root: Path) -> Path:
    return Path(repo_root) / "guild_hall" / "state" / "gateway" / "bindings" / "notify_policy.yaml"


def town_crier_pending_root(repo_root: Path) -> Path:
    return Path(repo_root) / "guild_hall" / "state" / "town_crier" / "queue" / "pending"


def mail_received_notify_status(repo_root: Path, *, policy_file: Optional[Path] = None) -> MailNotifyStatus:
    resolved_policy_file = policy_file or gateway_notify_policy_file(repo_root)
    policy = _read_gateway_policy(resolved_policy_file)
    channel = policy.get("channel_telegram", {})
    events = policy.get("events", {})
    channel_enabled = bool(channel.get("enabled", True))
    event_enabled = bool(events.get(MAIL_RECEIVED_EVENT, False))
    env_file = str(channel.get("env_file") or DEFAULT_TELEGRAM_ENV_FILE)

    return MailNotifyStatus(
        enabled=channel_enabled and event_enabled,
        channel_enabled=channel_enabled,
        event_enabled=event_enabled,
        policy_file=str(resolved_policy_file),
        env_file=env_file,
    )


def enqueue_mail_received_notifications(
    repo_root: Path,
    events: Sequence[EmailEvent],
    *,
    policy_file: Optional[Path] = None,
) -> MailNotifyResult:
    status = mail_received_notify_status(repo_root, policy_file=policy_file)
    if not status.enabled:
        return MailNotifyResult(
            enabled=False,
            queued=0,
            skipped_reason="mail_received_notify_disabled",
        )

    fresh_events = [event for event in events if isinstance(event, EmailEvent)]
    if not fresh_events:
        return MailNotifyResult(enabled=True, queued=0, skipped_reason="no_fresh_events")

    pending_root = town_crier_pending_root(repo_root)
    pending_root.mkdir(parents=True, exist_ok=True)
    queued_files: List[str] = []

    for event in fresh_events:
        request_id = _request_id_for_event(event)
        queue_file = pending_root / f"{request_id}.json"
        request = {
            "request_id": request_id,
            "owner_scope": "gateway",
            "event": MAIL_RECEIVED_EVENT,
            "text": format_mail_received_brief(event),
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source_ref": event.event_id,
            "mission_ref": None,
            "channel": "telegram",
            "env_file": status.env_file,
            "attempt_count": 0,
        }
        queue_file.write_text(json.dumps(request, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        queued_files.append(_repo_relative(repo_root, queue_file))

    return MailNotifyResult(enabled=True, queued=len(queued_files), queue_files=queued_files)


def format_mail_received_brief(event: EmailEvent) -> str:
    source_label = _source_label(event.source)
    subject = _safe_line(event.subject, fallback="제목 없음", max_len=80)
    sender = _sender_label(event)
    attachment_count = message_attachment_count(event.attachments)

    return "\n".join(
        [
            f"새 {source_label} 메일이 도착했습니다.",
            "",
            f"제목은 {subject}입니다.",
            f"보낸 사람은 {sender}입니다.",
            _attachment_sentence(attachment_count),
            _received_at_sentence(event.received_at),
            "",
            f"다음 행동: {source_label} 메일함을 확인해 주세요.",
        ]
    )


def _read_gateway_policy(policy_file: Path) -> Dict[str, Any]:
    if not policy_file.exists():
        return {
            "channel_telegram": {"enabled": True, "env_file": DEFAULT_TELEGRAM_ENV_FILE},
            "events": {},
        }

    channel_telegram: Dict[str, Any] = {"enabled": True, "env_file": DEFAULT_TELEGRAM_ENV_FILE}
    events: Dict[str, bool] = {}
    section = ""
    child = ""

    for raw in policy_file.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()

        if indent == 0 and stripped.endswith(":"):
            section = stripped[:-1]
            child = ""
            continue

        if indent == 2 and stripped.endswith(":"):
            child = stripped[:-1]
            continue

        if ":" not in stripped:
            continue
        key, value = [part.strip() for part in stripped.split(":", 1)]
        value = _unquote(value)

        if section == "channels" and child == "telegram":
            if key == "enabled":
                channel_telegram["enabled"] = _parse_bool(value, default=True)
            elif key == "env_file" and value:
                channel_telegram["env_file"] = value
        elif section == "events" and child:
            if key == "telegram":
                events[child] = _parse_bool(value, default=False)

    return {"channel_telegram": channel_telegram, "events": events}


def _parse_bool(value: str, *, default: bool) -> bool:
    raw = str(value or "").strip().lower()
    if not raw:
        return default
    if raw in {"true", "yes", "on", "1"}:
        return True
    if raw in {"false", "no", "off", "0"}:
        return False
    return default


def _unquote(value: str) -> str:
    raw = str(value or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in {"'", '"'}:
        return raw[1:-1]
    return raw


def _request_id_for_event(event: EmailEvent) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(event.event_id or "mail").strip()).strip("._-")
    return f"notify_mail_received_{safe[:80] or 'mail'}_{uuid4().hex[:8]}"


def _source_label(source: str) -> str:
    normalized = str(source or "").strip().lower()
    if normalized == "hiworks":
        return "하이웍스"
    if normalized == "gmail":
        return "지메일"
    return "메일"


def _safe_line(value: Any, *, fallback: str, max_len: int) -> str:
    text = _WHITESPACE_RE.sub(" ", str(value or "").strip())
    if not text:
        return fallback
    text = _URL_RE.sub(REDACTED_TEXT, text)
    if len(text) > max_len:
        return text[:max_len].rstrip() + "..."
    return text


def _sender_label(event: EmailEvent) -> str:
    senders = event.from_addrs or []
    if not senders:
        return "확인되지 않은 발신자"

    first = senders[0]
    label = _safe_line(first.name or first.address, fallback="확인되지 않은 발신자", max_len=60)
    extra = len(senders) - 1
    if extra > 0:
        return f"{label} 외 {extra}명"
    return label


def _attachment_sentence(count: int) -> str:
    if count <= 0:
        return "첨부 파일은 없습니다."
    return f"첨부 파일은 {count}개 있습니다."


def _received_at_sentence(value: str) -> str:
    parsed = _parse_datetime(value)
    if parsed is None:
        return "수신 시각은 확인되지 않았습니다."
    kst = parsed.astimezone(timezone(timedelta(hours=9)))
    marker = "오전" if kst.hour < 12 else "오후"
    hour = kst.hour % 12 or 12
    return f"수신 시각은 {marker} {hour}시 {kst.minute:02d}분입니다."


def _parse_datetime(value: str) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _repo_relative(repo_root: Path, file_path: Path) -> str:
    try:
        return str(file_path.relative_to(repo_root))
    except ValueError:
        return str(file_path)
