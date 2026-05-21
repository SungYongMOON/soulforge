from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Dict, List, Optional

from ..models import EmailEvent, message_attachment_count, message_attachments
from .project_mail_history import ProjectMailHistoryWriter
from .sink import _event_path, _month_key_for_event


MAIL_CANDIDATE_SCHEMA_VERSION = "mail_candidate.queue_item.v1"


@dataclass
class MailCandidateQueueSummary:
    enabled: bool
    queued: int = 0
    skipped: int = 0
    skipped_reason: str = ""
    queue_files: List[str] = field(default_factory=list)
    history_updated: int = 0
    history_files: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "queued": self.queued,
            "skipped": self.skipped,
            "skipped_reason": self.skipped_reason,
            "queue_files": list(self.queue_files),
            "history_updated": self.history_updated,
            "history_files": list(self.history_files),
        }


class MailCandidateQueue:
    """Write local-only mail-to-work review candidates for fresh mail events."""

    def __init__(
        self,
        *,
        repo_root: Path,
        queue_root: Path,
        inbox_root: Path,
        source_workspace_map: Optional[Dict[str, str]] = None,
    ) -> None:
        self.repo_root = Path(repo_root).expanduser()
        self.queue_root = Path(queue_root).expanduser()
        self.inbox_root = Path(inbox_root).expanduser()
        self.source_workspace_map = source_workspace_map or {
            "gmail": "personal",
            "hiworks": "company",
            "o365": "company",
        }
        self.history_writer = ProjectMailHistoryWriter(repo_root=self.repo_root)

    def enqueue_events(self, events: List[EmailEvent]) -> MailCandidateQueueSummary:
        candidates = [event for event in events if _is_candidate_event(event)]
        if not candidates:
            return MailCandidateQueueSummary(
                enabled=True,
                queued=0,
                skipped=0,
                skipped_reason="no_candidate_events",
            )

        pending_root = self.queue_root / "queue" / "pending"
        pending_root.mkdir(parents=True, exist_ok=True)
        summary = MailCandidateQueueSummary(enabled=True)

        for event in candidates:
            candidate_id = _candidate_id_for_event(event)
            queue_file = pending_root / f"{candidate_id}.json"
            if queue_file.exists():
                summary.skipped += 1
                history_summary = self.history_writer.record_mail_received(event, candidate_id=candidate_id)
                summary.history_updated += history_summary.updated
                _extend_unique(summary.history_files, history_summary.history_files)
                continue

            created_at = _now_iso()
            payload = self._build_queue_item(event, candidate_id=candidate_id, created_at=created_at)
            tmp_file = queue_file.with_suffix(queue_file.suffix + ".tmp")
            tmp_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            tmp_file.replace(queue_file)
            history_summary = self.history_writer.record_mail_received(event, candidate_id=candidate_id)
            summary.queued += 1
            summary.queue_files.append(_repo_relative(self.repo_root, queue_file))
            summary.history_updated += history_summary.updated
            _extend_unique(summary.history_files, history_summary.history_files)

        if summary.queued == 0 and summary.skipped > 0:
            summary.skipped_reason = "already_queued"
        return summary

    def _build_queue_item(self, event: EmailEvent, *, candidate_id: str, created_at: str) -> Dict[str, Any]:
        source = str(event.source or "").strip() or "mail"
        workspace = self._workspace_for_source(source)
        bucket = _classification_bucket(event)
        month_key = _month_key_for_event(event)
        event_file = _event_path(self.inbox_root / workspace, bucket, source, month_key)
        classification = _classification_summary(event)

        return {
            "schema_version": MAIL_CANDIDATE_SCHEMA_VERSION,
            "candidate_id": candidate_id,
            "status": "pending_review",
            "created_at": created_at,
            "updated_at": created_at,
            "created_by": "gateway_mail_fetch",
            "review_reason": "fresh_mail_event",
            "source_event": {
                "event_id": event.event_id,
                "source": source,
                "workspace": workspace,
                "event_file": _repo_relative(self.repo_root, event_file),
                "received_at": event.received_at,
                "ingested_at": event.ingested_at,
            },
            "mail_summary": {
                "subject": str(event.subject or ""),
                "from": [asdict(item) for item in event.from_addrs],
                "to_count": len(event.to_addrs or []),
                "cc_count": len(event.cc_addrs or []),
                "attachment_count": message_attachment_count(event.attachments),
                "attachment_types": sorted(
                    {str(item.type or "") for item in message_attachments(event.attachments) if item.type}
                ),
                "classification": classification,
            },
            "business_review": {
                "required": True,
                "status": "not_started",
                "next_action": "review_for_mail_intake_request",
                "intake_request_status": "not_created",
            },
        }

    def _workspace_for_source(self, source: str) -> str:
        return str(self.source_workspace_map.get(source, "personal")).strip() or "personal"


def _is_candidate_event(event: EmailEvent) -> bool:
    if not isinstance(event, EmailEvent):
        return False
    if event.ingest_status == "failed":
        return False
    return _classification_bucket(event) == "mail"


def _classification_bucket(event: EmailEvent) -> str:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    classification = metadata.get("classification")
    if isinstance(classification, dict):
        bucket = str(classification.get("bucket", "")).strip().lower()
        if bucket in {"mail", "ads", "quarantine"}:
            return bucket
    return "mail"


def _classification_summary(event: EmailEvent) -> Dict[str, Any]:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    classification = metadata.get("classification")
    if not isinstance(classification, dict):
        return {"bucket": "mail", "reasons": []}

    reasons = classification.get("reasons")
    if not isinstance(reasons, list):
        reasons = []

    return {
        "bucket": _classification_bucket(event),
        "reasons": [str(item) for item in reasons],
        "ad_detected": bool(classification.get("ad_detected", False)),
        "blocked_attachment_count": _safe_int(classification.get("blocked_attachment_count")),
    }


def _candidate_id_for_event(event: EmailEvent) -> str:
    source = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(event.source or "mail").strip()).strip("._-") or "mail"
    event_id = str(event.event_id or "").strip()
    if event_id:
        raw = f"{source}_{event_id}"
    else:
        digest = hashlib.sha256(
            f"{event.source}:{event.provider_message_id}:{event.received_at}".encode("utf-8")
        ).hexdigest()[:16]
        raw = f"{source}_{digest}"
    token = re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("._-")[:100] or source
    return f"mail_candidate_{token}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _extend_unique(target: List[str], values: List[str]) -> None:
    for value in values:
        if value not in target:
            target.append(value)


def _repo_relative(repo_root: Path, file_path: Path) -> str:
    try:
        return file_path.relative_to(repo_root).as_posix()
    except ValueError:
        return file_path.as_posix()
