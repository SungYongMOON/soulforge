from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from ..models import EmailEvent


STATE_VERSION = "email.fetch.dedupe.v1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def dedupe_key(event: EmailEvent) -> str:
    return f"{event.source}|{event.provider_message_id}|{event.received_at}"


class DedupeStore:
    def __init__(self, path: Path, max_keys: int = 50000) -> None:
        self.path = Path(path).expanduser()
        self.max_keys = max(int(max_keys), 1000)
        self._keys: List[str] = []
        self._key_set = set()
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return
        rows = data.get("keys") if isinstance(data, dict) else []
        if not isinstance(rows, list):
            return
        for row in rows:
            value = str(row or "").strip()
            if not value or value in self._key_set:
                continue
            self._keys.append(value)
            self._key_set.add(value)

    def filter_new(self, events: Sequence[EmailEvent]) -> Tuple[List[EmailEvent], int]:
        fresh: List[EmailEvent] = []
        duplicates = 0
        for event in events:
            key = dedupe_key(event)
            if key in self._key_set:
                duplicates += 1
                continue
            fresh.append(event)
        return fresh, duplicates

    def commit(self, events: Iterable[EmailEvent]) -> None:
        for event in events:
            key = dedupe_key(event)
            if key in self._key_set:
                continue
            self._keys.append(key)
            self._key_set.add(key)
        if len(self._keys) > self.max_keys:
            self._keys = self._keys[-self.max_keys :]
            self._key_set = set(self._keys)
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload: Dict[str, object] = {
            "schema_version": STATE_VERSION,
            "updated_at": _now_iso(),
            "keys": self._keys,
        }
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.path)
