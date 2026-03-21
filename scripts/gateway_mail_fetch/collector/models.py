from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


EVENT_SCHEMA_VERSION = "email.fetch.event.v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Address:
    name: str = ""
    address: str = ""


@dataclass
class Attachment:
    type: str
    name: Optional[str] = None
    mime: Optional[str] = None
    size: Optional[int] = None
    url: Optional[str] = None
    content_sha256: Optional[str] = None
    local_path: Optional[str] = None
    provider_attachment_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class EmailEvent:
    event_id: str
    source: str
    provider_message_id: str
    subject: str
    from_addrs: List[Address] = field(default_factory=list)
    to_addrs: List[Address] = field(default_factory=list)
    cc_addrs: List[Address] = field(default_factory=list)
    received_at: str = ""
    thread_id: Optional[str] = None
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    attachments: List[Attachment] = field(default_factory=list)
    ingest_status: str = "ok"
    ingested_at: str = field(default_factory=now_iso)
    raw: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    schema_version: str = EVENT_SCHEMA_VERSION

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "schema_version": self.schema_version,
            "event_id": self.event_id,
            "source": self.source,
            "provider_message_id": self.provider_message_id,
            "thread_id": self.thread_id,
            "subject": self.subject,
            "from": [asdict(item) for item in self.from_addrs],
            "to": [asdict(item) for item in self.to_addrs],
            "cc": [asdict(item) for item in self.cc_addrs],
            "received_at": self.received_at,
            "body_text": self.body_text,
            "body_html": self.body_html,
            "attachments": [asdict(item) for item in self.attachments],
            "ingested_at": self.ingested_at,
            "ingest_status": self.ingest_status,
            "raw": self.raw,
            "metadata": self.metadata,
        }
        return payload


@dataclass
class ConnectorError:
    source: str
    code: str
    message: str
    retryable: bool = False
    detail: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class FetchResult:
    events: List[EmailEvent] = field(default_factory=list)
    next_cursor: Optional[Dict[str, Any]] = None
    partial: bool = False
    errors: List[ConnectorError] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "events": [event.to_dict() for event in self.events],
            "next_cursor": self.next_cursor,
            "partial": self.partial,
            "errors": [error.to_dict() for error in self.errors],
        }
