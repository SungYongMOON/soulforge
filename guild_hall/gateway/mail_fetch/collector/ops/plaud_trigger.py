from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Iterable, Sequence


TRIGGER_SCHEMA_VERSION = "soulforge.plaud_mail_trigger.v0"
DEFAULT_SENDER_DOMAINS = ("plaud.ai",)
DEFAULT_SUBJECT_KEYWORDS = (
    "transcript",
    "transcription",
    "recording ready",
    "전사",
    "녹취",
    "회의록",
)


@dataclass
class PlaudTriggerSummary:
    enabled: bool
    matched: int = 0
    queued: int = 0
    duplicates: int = 0
    skipped: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def enqueue_plaud_mail_triggers(
    queue_root: Path,
    events: Iterable[Any],
    *,
    enabled: bool,
    sender_domains: Sequence[str] = DEFAULT_SENDER_DOMAINS,
    subject_keywords: Sequence[str] = DEFAULT_SUBJECT_KEYWORDS,
) -> PlaudTriggerSummary:
    summary = PlaudTriggerSummary(enabled=enabled)
    if not enabled:
        return summary

    normalized_domains = tuple(_normalize_domain(value) for value in sender_domains if _normalize_domain(value))
    normalized_keywords = tuple(str(value or "").strip().lower() for value in subject_keywords if str(value or "").strip())
    pending_dir = Path(queue_root) / "pending"
    processed_root = Path(queue_root) / "processed"
    unresolved_root = Path(queue_root) / "unresolved"
    pending_dir.mkdir(parents=True, exist_ok=True)

    for event in events:
        if not _is_plaud_transcript_notice(event, normalized_domains, normalized_keywords):
            summary.skipped += 1
            continue
        summary.matched += 1
        trigger_id = _trigger_id(event)
        filename = f"{trigger_id}.json"
        target = pending_dir / filename
        if target.exists() or any(processed_root.glob(f"*/{filename}")) or any(unresolved_root.glob(f"*/{filename}")):
            summary.duplicates += 1
            continue
        payload = {
            "schema_version": TRIGGER_SCHEMA_VERSION,
            "trigger_id": trigger_id,
            "trigger_kind": "hiworks_plaud_transcript_ready_mail",
            "source": str(getattr(event, "source", "") or ""),
            "mail_event_hash": _hash_value(str(getattr(event, "event_id", "") or "")),
            "provider_message_hash": _hash_value(str(getattr(event, "provider_message_id", "") or "")),
            "received_at": str(getattr(event, "received_at", "") or ""),
            "enqueued_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "mail_body_included": False,
            "mail_subject_included": False,
            "mail_address_included": False,
            "provider_link_included": False,
        }
        temp = pending_dir / f".{filename}.tmp"
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(target)
        summary.queued += 1

    return summary


def _is_plaud_transcript_notice(event: Any, sender_domains: Sequence[str], keywords: Sequence[str]) -> bool:
    sender_match = False
    for address in getattr(event, "from_addrs", []) or []:
        raw = str(getattr(address, "address", "") or "").strip().lower()
        domain = raw.rsplit("@", 1)[-1] if "@" in raw else ""
        if any(domain == allowed or domain.endswith(f".{allowed}") for allowed in sender_domains):
            sender_match = True
            break
    if not sender_match:
        return False

    signal_parts = [str(getattr(event, "subject", "") or "")]
    for attachment in getattr(event, "attachments", []) or []:
        signal_parts.append(str(getattr(attachment, "name", "") or ""))
    signal = "\n".join(signal_parts).lower()
    return any(keyword in signal for keyword in keywords)


def _trigger_id(event: Any) -> str:
    stable = "|".join(
        [
            str(getattr(event, "source", "") or ""),
            str(getattr(event, "event_id", "") or ""),
            str(getattr(event, "provider_message_id", "") or ""),
        ]
    )
    return f"plaud_mail_{_hash_value(stable)[:20]}"


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalize_domain(value: str) -> str:
    return str(value or "").strip().lower().lstrip("@.")
