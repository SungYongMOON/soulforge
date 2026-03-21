from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, Optional


CURSOR_SCHEMA_VERSION = "email.fetch.cursor.v1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class CursorStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path).expanduser()
        self.state = self._default_state()
        self._load()

    def _default_state(self) -> Dict[str, Any]:
        now = _now_iso()
        return {
            "schema_version": CURSOR_SCHEMA_VERSION,
            "updated_at": now,
            "sources": {
                "gmail": {"cursor": None, "updated_at": now},
                "hiworks": {"cursor": None, "updated_at": now},
                "o365": {"cursor": None, "updated_at": now},
            },
        }

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return
        if not isinstance(data, dict):
            return
        if str(data.get("schema_version", "")).strip() != CURSOR_SCHEMA_VERSION:
            return
        sources = data.get("sources")
        if not isinstance(sources, dict):
            return

        for source in ("gmail", "hiworks", "o365"):
            row = sources.get(source)
            if not isinstance(row, dict):
                continue
            self.state["sources"][source]["cursor"] = row.get("cursor")
            updated_at = str(row.get("updated_at", "")).strip() or _now_iso()
            self.state["sources"][source]["updated_at"] = updated_at

        self.state["updated_at"] = str(data.get("updated_at", "")).strip() or _now_iso()

    def get_cursor(self, source: str) -> Optional[Dict[str, Any]]:
        row = self.state["sources"].get(str(source or ""))
        if not isinstance(row, dict):
            return None
        cursor = row.get("cursor")
        if not isinstance(cursor, dict):
            return None
        return dict(cursor)

    def set_cursor(self, source: str, cursor: Optional[Dict[str, Any]]) -> None:
        key = str(source or "").strip()
        if key not in self.state["sources"]:
            self.state["sources"][key] = {"cursor": None, "updated_at": _now_iso()}
        self.state["sources"][key]["cursor"] = dict(cursor) if isinstance(cursor, dict) else None
        now = _now_iso()
        self.state["sources"][key]["updated_at"] = now
        self.state["updated_at"] = now

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.path)
