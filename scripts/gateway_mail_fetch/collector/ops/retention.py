from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


RETENTION_SCHEMA_VERSION = "email.fetch.retention.report.v1"


@dataclass
class RetentionConfig:
    runtime_root: Path
    inbox_root: Path
    report_only: bool = True
    trash_grace_days: int = 14
    now_epoch: Optional[int] = None


@dataclass
class FilePolicy:
    category: str
    root: Path
    retention_days: int


def _now_epoch() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _parse_iso_epoch(value: Any) -> Optional[int]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp())


def _iter_files(root: Path) -> Iterable[Path]:
    if not root.exists():
        return []
    rows: List[Path] = []
    for item in root.rglob("*"):
        if item.is_file():
            rows.append(item)
    rows.sort()
    return rows


def _age_days(path: Path, *, now_epoch: int) -> float:
    stat = path.stat()
    return max(now_epoch - int(stat.st_mtime), 0) / 86400.0


def _is_expired_mtime(path: Path, *, retention_days: int, now_epoch: int) -> bool:
    return _age_days(path, now_epoch=now_epoch) > float(retention_days)


def _build_personal_policies(inbox_root: Path) -> Sequence[FilePolicy]:
    return (
        FilePolicy("personal_mail", inbox_root / "personal" / "mail", 730),
        FilePolicy("personal_ads", inbox_root / "personal" / "ads", 180),
        FilePolicy("personal_quarantine", inbox_root / "personal" / "quarantine", 365),
    )


def _to_candidate(path: Path, *, category: str, retention_days: int, now_epoch: int) -> Dict[str, Any]:
    return {
        "path": str(path),
        "category": category,
        "retention_days": retention_days,
        "age_days": round(_age_days(path, now_epoch=now_epoch), 2),
    }


def _collect_personal_file_candidates(inbox_root: Path, *, now_epoch: int) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for policy in _build_personal_policies(inbox_root):
        for file_path in _iter_files(policy.root):
            if _is_expired_mtime(file_path, retention_days=policy.retention_days, now_epoch=now_epoch):
                rows.append(
                    _to_candidate(
                        file_path,
                        category=policy.category,
                        retention_days=policy.retention_days,
                        now_epoch=now_epoch,
                    )
                )
    return rows


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        row = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return row if isinstance(row, dict) else {}


def _write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _jsonl_line_timestamp(row: Dict[str, Any], keys: Sequence[str]) -> Optional[int]:
    for key in keys:
        ts = _parse_iso_epoch(row.get(key))
        if ts is not None:
            return ts
    return None


def _analyze_jsonl_prune(path: Path, *, cutoff_epoch: int, ts_keys: Sequence[str]) -> Dict[str, Any]:
    if not path.exists():
        return {
            "path": str(path),
            "exists": False,
            "total_lines": 0,
            "kept_lines": 0,
            "removed_lines": 0,
            "removed_preview": [],
            "kept_text": "",
        }

    kept: List[str] = []
    removed = 0
    removed_preview: List[str] = []

    with path.open("r", encoding="utf-8") as fp:
        for raw in fp:
            line = raw.rstrip("\n")
            if not line.strip():
                kept.append(raw)
                continue
            try:
                row = json.loads(line)
            except Exception:
                kept.append(raw)
                continue
            if not isinstance(row, dict):
                kept.append(raw)
                continue
            line_epoch = _jsonl_line_timestamp(row, ts_keys)
            if line_epoch is not None and line_epoch < cutoff_epoch:
                removed += 1
                if len(removed_preview) < 3:
                    removed_preview.append(line[:200])
                continue
            kept.append(raw)

    return {
        "path": str(path),
        "exists": True,
        "total_lines": len(kept) + removed,
        "kept_lines": len(kept),
        "removed_lines": removed,
        "removed_preview": removed_preview,
        "kept_text": "".join(kept),
    }


def _resolve_trash_destination(
    src: Path,
    *,
    inbox_root: Path,
    runtime_root: Path,
    trash_date_root: Path,
) -> Path:
    inbox_root = inbox_root.resolve()
    runtime_root = runtime_root.resolve()
    src_resolved = src.resolve()

    try:
        rel = src_resolved.relative_to(inbox_root)
        base = trash_date_root / rel
    except ValueError:
        try:
            rel = src_resolved.relative_to(runtime_root)
            base = trash_date_root / "runtime-email-fetch" / rel
        except ValueError:
            base = trash_date_root / "misc" / src.name

    if not base.exists():
        return base

    stem = base.stem
    suffix = base.suffix
    idx = 1
    while True:
        candidate = base.with_name(f"{stem}.{idx}{suffix}")
        if not candidate.exists():
            return candidate
        idx += 1


def _move_to_trash(
    src: Path,
    *,
    inbox_root: Path,
    runtime_root: Path,
    trash_date_root: Path,
) -> Dict[str, Any]:
    dst = _resolve_trash_destination(
        src,
        inbox_root=inbox_root,
        runtime_root=runtime_root,
        trash_date_root=trash_date_root,
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    return {"src": str(src), "dst": str(dst)}


def _trash_root(inbox_root: Path) -> Path:
    return inbox_root / "_trash" / "email-fetch"


def _parse_yyyymmdd(name: str) -> Optional[int]:
    try:
        dt = datetime.strptime(name, "%Y%m%d").replace(tzinfo=timezone.utc)
    except Exception:
        return None
    return int(dt.timestamp())


def _collect_trash_purge_candidates(trash_root: Path, *, now_epoch: int, grace_days: int) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if not trash_root.exists():
        return rows

    cutoff = now_epoch - max(grace_days, 1) * 86400
    for item in sorted(trash_root.iterdir()):
        if not item.is_dir():
            continue
        epoch = _parse_yyyymmdd(item.name)
        if epoch is None:
            epoch = int(item.stat().st_mtime)
        if epoch < cutoff:
            rows.append({"path": str(item), "date_key": item.name})
    return rows


def _collect_runtime_file_candidates(runtime_root: Path, *, now_epoch: int) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    logs_root = runtime_root / "logs"

    summary_path = logs_root / "last_run_summary.json"
    summary_row = _read_json(summary_path)
    summary_epoch = _parse_iso_epoch(summary_row.get("finished_at"))
    if summary_epoch is not None and summary_epoch < (now_epoch - 180 * 86400):
        rows.append(
            {
                "path": str(summary_path),
                "category": "runtime_last_run_summary",
                "retention_days": 180,
                "age_days": round((now_epoch - summary_epoch) / 86400.0, 2),
            }
        )

    for name in ("collector.stdout.log", "collector.stderr.log"):
        path = runtime_root / name
        if path.exists() and _is_expired_mtime(path, retention_days=30, now_epoch=now_epoch):
            rows.append(_to_candidate(path, category="runtime_stdlog", retention_days=30, now_epoch=now_epoch))

    return rows


def _write_json_report(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_text_atomic(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def run_retention_cleanup(config: RetentionConfig) -> Dict[str, Any]:
    now_epoch = config.now_epoch if config.now_epoch is not None else _now_epoch()
    now_iso = _now_iso()

    inbox_root = config.inbox_root.expanduser()
    runtime_root = config.runtime_root.expanduser()
    report_only = bool(config.report_only)
    apply_mode = not report_only

    personal_candidates = _collect_personal_file_candidates(inbox_root, now_epoch=now_epoch)
    runtime_file_candidates = _collect_runtime_file_candidates(runtime_root, now_epoch=now_epoch)

    runs_prune = _analyze_jsonl_prune(
        runtime_root / "logs" / "runs.jsonl",
        cutoff_epoch=now_epoch - 180 * 86400,
        ts_keys=("finished_at", "started_at"),
    )
    debug_prune = _analyze_jsonl_prune(
        runtime_root / "logs" / "collector_debug.jsonl",
        cutoff_epoch=now_epoch - 30 * 86400,
        ts_keys=("ts",),
    )

    trash_root = _trash_root(inbox_root)
    date_key = datetime.fromtimestamp(now_epoch, tz=timezone.utc).strftime("%Y%m%d")
    trash_date_root = trash_root / date_key

    moved_rows: List[Dict[str, Any]] = []
    jsonl_rewritten: List[Dict[str, Any]] = []

    if apply_mode:
        for row in personal_candidates + runtime_file_candidates:
            src = Path(str(row["path"]))
            if not src.exists():
                continue
            moved = _move_to_trash(
                src,
                inbox_root=inbox_root,
                runtime_root=runtime_root,
                trash_date_root=trash_date_root,
            )
            moved["category"] = row["category"]
            moved_rows.append(moved)

        for prune_row, category in ((runs_prune, "runtime_runs_jsonl"), (debug_prune, "runtime_debug_jsonl")):
            path = Path(prune_row["path"])
            removed = int(prune_row["removed_lines"])
            if not path.exists() or removed <= 0:
                continue

            backup_move = _move_to_trash(
                path,
                inbox_root=inbox_root,
                runtime_root=runtime_root,
                trash_date_root=trash_date_root,
            )
            _write_text_atomic(path, str(prune_row["kept_text"]))
            jsonl_rewritten.append(
                {
                    "path": str(path),
                    "category": category,
                    "removed_lines": removed,
                    "kept_lines": int(prune_row["kept_lines"]),
                    "trash_backup": backup_move["dst"],
                }
            )

    purge_candidates = _collect_trash_purge_candidates(
        trash_root,
        now_epoch=now_epoch,
        grace_days=max(int(config.trash_grace_days), 1),
    )
    purged_rows: List[Dict[str, Any]] = []
    if apply_mode:
        for row in purge_candidates:
            target = Path(str(row["path"]))
            if not target.exists():
                continue
            shutil.rmtree(target)
            purged_rows.append(row)

    report = {
        "schema_version": RETENTION_SCHEMA_VERSION,
        "generated_at": now_iso,
        "mode": "report-only" if report_only else "apply",
        "report_only": report_only,
        "inbox_root": str(inbox_root),
        "runtime_root": str(runtime_root),
        "company_policy": "no_auto_delete",
        "candidates": {
            "personal_files": personal_candidates,
            "runtime_files": runtime_file_candidates,
            "runs_jsonl": {
                "path": runs_prune["path"],
                "removed_lines": runs_prune["removed_lines"],
                "kept_lines": runs_prune["kept_lines"],
                "total_lines": runs_prune["total_lines"],
            },
            "debug_jsonl": {
                "path": debug_prune["path"],
                "removed_lines": debug_prune["removed_lines"],
                "kept_lines": debug_prune["kept_lines"],
                "total_lines": debug_prune["total_lines"],
            },
            "trash_purge": purge_candidates,
        },
        "actions": {
            "moved_to_trash": moved_rows,
            "jsonl_rewritten": jsonl_rewritten,
            "purged_trash": purged_rows,
        },
    }

    report_dir = runtime_root / "retention" / "reports"
    report_name = datetime.fromtimestamp(now_epoch, tz=timezone.utc).strftime("retention_%Y%m%dT%H%M%SZ.json")
    report_path = report_dir / report_name
    _write_json_report(report_path, report)
    report["report_path"] = str(report_path)
    return report
