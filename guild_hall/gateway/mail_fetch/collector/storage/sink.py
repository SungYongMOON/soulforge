from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
import json

from ..models import EmailEvent


def _append_jsonl(path: Path, rows: Iterable[Dict[str, Any]]) -> int:
    count = 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    return count


def _default_month_key() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


def _parse_month_key(raw: Any) -> Optional[str]:
    value = str(raw or "").strip()
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return f"{parsed.year:04d}-{parsed.month:02d}"
    except Exception:
        pass

    try:
        parsed = parsedate_to_datetime(value)
        if parsed is None:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return f"{parsed.year:04d}-{parsed.month:02d}"
    except Exception:
        return None


def _month_key_for_event(event: EmailEvent) -> str:
    return _parse_month_key(event.received_at) or _default_month_key()


def _month_key_for_raw(source: str, row: Dict[str, Any]) -> str:
    source_key = str(source or "").strip().lower()

    if source_key == "gmail":
        internal_date = row.get("internalDate")
        try:
            epoch_ms = int(str(internal_date or "").strip())
            if epoch_ms > 0:
                parsed = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
                return f"{parsed.year:04d}-{parsed.month:02d}"
        except Exception:
            pass

    if source_key == "hiworks":
        headers = row.get("headers")
        if isinstance(headers, dict):
            month = _parse_month_key(headers.get("date"))
            if month:
                return month

    for key in ("received_at", "ingested_at", "date"):
        month = _parse_month_key(row.get(key))
        if month:
            return month

    return _default_month_key()


def _raw_path(workspace_root: Path, source: str, month_key: str) -> Path:
    year = month_key[:4]
    return workspace_root / "mail" / "raw" / source / year / f"{month_key}.jsonl"


def _event_path(workspace_root: Path, bucket: str, source: str, month_key: str) -> Path:
    year = month_key[:4]
    bucket_dir = "mail" if bucket == "mail" else bucket
    return workspace_root / bucket_dir / "events" / source / year / f"{month_key}.jsonl"


@dataclass
class SinkSummary:
    source: str
    raw_written: int = 0
    event_written: int = 0
    event_written_by_bucket: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source": self.source,
            "raw_written": self.raw_written,
            "event_written": self.event_written,
            "event_written_by_bucket": dict(self.event_written_by_bucket),
        }


class EventSink:
    """Write raw/normalized events into inbox workspace buckets."""

    def __init__(self, inbox_root: Path, source_workspace_map: Optional[Dict[str, str]] = None) -> None:
        self.inbox_root = Path(inbox_root).expanduser()
        self.source_workspace_map = source_workspace_map or {
            "gmail": "personal",
            "hiworks": "company",
            "o365": "company",
        }

    def _workspace_dir_for_source(self, source: str) -> Path:
        workspace = self.source_workspace_map.get(source, "personal")
        return self.inbox_root / workspace

    def _event_bucket(self, event: EmailEvent) -> str:
        metadata = event.metadata if isinstance(event.metadata, dict) else {}
        classification = metadata.get("classification")
        if isinstance(classification, dict):
            bucket = str(classification.get("bucket", "")).strip().lower()
            if bucket in {"mail", "ads", "quarantine"}:
                return bucket
        return "mail"

    def write_batch(self, source: str, raw_rows: List[Dict[str, Any]], events: List[EmailEvent]) -> SinkSummary:
        workspace_root = self._workspace_dir_for_source(source)

        summary = SinkSummary(source=source)
        if raw_rows:
            raw_by_month: Dict[str, List[Dict[str, Any]]] = {}
            for row in raw_rows:
                month_key = _month_key_for_raw(source, row)
                raw_by_month.setdefault(month_key, []).append(row)
            for month_key, rows in raw_by_month.items():
                raw_path = _raw_path(workspace_root, source, month_key)
                summary.raw_written += _append_jsonl(raw_path, rows)
        if events:
            by_bucket_month: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
            for event in events:
                bucket = self._event_bucket(event)
                month_key = _month_key_for_event(event)
                by_bucket_month.setdefault((bucket, month_key), []).append(event.to_dict())
            for (bucket, month_key), rows in by_bucket_month.items():
                event_path = _event_path(workspace_root, bucket, source, month_key)
                written = _append_jsonl(event_path, rows)
                summary.event_written += written
                summary.event_written_by_bucket[bucket] = summary.event_written_by_bucket.get(bucket, 0) + written
        return summary
