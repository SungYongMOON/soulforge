from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
from typing import Any, Dict, Iterable, List, Optional, Sequence


BACKUP_SCHEMA_VERSION = "email.fetch.state.backup.v1"
DEFAULT_REQUIRED_STATE_FILES: Sequence[str] = (
    "cursor_state.json",
    "dedupe_keys.json",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _timestamp_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fp:
        for chunk in iter(lambda: fp.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _iter_files(root: Path) -> Iterable[Path]:
    if not root.exists():
        return []
    files: List[Path] = []
    for item in root.rglob("*"):
        if item.is_file():
            files.append(item)
    files.sort(key=lambda path: str(path.relative_to(root)))
    return files


def _write_json_atomic(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def _load_manifest(snapshot_dir: Path) -> Dict[str, Any]:
    manifest_path = snapshot_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json이 없습니다: {snapshot_dir}")
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"manifest 형식이 올바르지 않습니다: {snapshot_dir}")
    if str(raw.get("schema_version", "")).strip() != BACKUP_SCHEMA_VERSION:
        raise ValueError(f"지원하지 않는 manifest schema_version입니다: {snapshot_dir}")
    return raw


def _snapshot_dirs(backups_root: Path) -> List[Path]:
    if not backups_root.exists():
        return []
    rows: List[Path] = []
    for item in backups_root.iterdir():
        if not item.is_dir():
            continue
        manifest = item / "manifest.json"
        if manifest.exists():
            rows.append(item)
    rows.sort(key=lambda path: path.name)
    return rows


def _allocate_snapshot_id(backups_root: Path, base: str) -> str:
    name = base
    idx = 1
    while (backups_root / name).exists():
        idx += 1
        name = f"{base}-{idx}"
    return name


def _collect_file_rows(state_snapshot_dir: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for file_path in _iter_files(state_snapshot_dir):
        rel = str(file_path.relative_to(state_snapshot_dir))
        stat = file_path.stat()
        rows.append(
            {
                "path": rel,
                "size": int(stat.st_size),
                "sha256": _hash_file(file_path),
            }
        )
    return rows


def _validate_snapshot(
    snapshot_dir: Path,
    *,
    required_files: Sequence[str] = DEFAULT_REQUIRED_STATE_FILES,
) -> Dict[str, Any]:
    manifest = _load_manifest(snapshot_dir)
    state_dir = snapshot_dir / "state"
    if not state_dir.exists():
        raise FileNotFoundError(f"snapshot state 디렉터리가 없습니다: {state_dir}")

    actual_files = {str(path.relative_to(state_dir)): path for path in _iter_files(state_dir)}
    missing_required = [name for name in required_files if name not in actual_files]
    if missing_required:
        joined = ", ".join(missing_required)
        raise ValueError(f"필수 state 파일 누락으로 restore 중단: {joined}")

    expected_rows = manifest.get("files", [])
    if isinstance(expected_rows, list):
        for row in expected_rows:
            if not isinstance(row, dict):
                continue
            rel = str(row.get("path", "")).strip()
            if not rel:
                continue
            target = actual_files.get(rel)
            if target is None:
                raise ValueError(f"manifest 파일이 snapshot에 없습니다: {rel}")
            expected_size = row.get("size")
            if isinstance(expected_size, int) and target.stat().st_size != expected_size:
                raise ValueError(f"snapshot 파일 크기 불일치: {rel}")
            expected_hash = str(row.get("sha256", "")).strip()
            if expected_hash and _hash_file(target) != expected_hash:
                raise ValueError(f"snapshot 파일 해시 불일치: {rel}")

    return manifest


def create_state_backup(
    runtime_root: Path,
    *,
    keep: int = 30,
    snapshot_id: Optional[str] = None,
    label: str = "scheduled",
) -> Dict[str, Any]:
    runtime_root = Path(runtime_root).expanduser()
    state_dir = runtime_root / "state"
    backups_root = runtime_root / "state_backups"
    backups_root.mkdir(parents=True, exist_ok=True)

    base_id = snapshot_id or _timestamp_id()
    allocated_id = _allocate_snapshot_id(backups_root, base_id)
    snapshot_dir = backups_root / allocated_id
    snapshot_state_dir = snapshot_dir / "state"
    snapshot_state_dir.mkdir(parents=True, exist_ok=False)

    for src_path in _iter_files(state_dir):
        rel = src_path.relative_to(state_dir)
        dst = snapshot_state_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst)

    file_rows = _collect_file_rows(snapshot_state_dir)
    manifest = {
        "schema_version": BACKUP_SCHEMA_VERSION,
        "snapshot_id": allocated_id,
        "label": label,
        "created_at": _now_iso(),
        "source_state_dir": str(state_dir),
        "file_count": len(file_rows),
        "files": file_rows,
    }
    _write_json_atomic(snapshot_dir / "manifest.json", manifest)

    removed: List[str] = []
    keep = max(int(keep), 1)
    snapshots = _snapshot_dirs(backups_root)
    overflow = max(len(snapshots) - keep, 0)
    if overflow > 0:
        for stale in snapshots[:overflow]:
            if stale == snapshot_dir:
                continue
            removed.append(stale.name)
            shutil.rmtree(stale)

    return {
        "snapshot_id": allocated_id,
        "snapshot_dir": str(snapshot_dir),
        "state_dir": str(state_dir),
        "file_count": len(file_rows),
        "removed_snapshots": removed,
        "manifest": manifest,
    }


def select_snapshot(
    runtime_root: Path,
    *,
    snapshot_id: Optional[str],
    latest: bool,
) -> Path:
    runtime_root = Path(runtime_root).expanduser()
    backups_root = runtime_root / "state_backups"

    if snapshot_id:
        snapshot_dir = backups_root / snapshot_id
        if not snapshot_dir.exists():
            raise FileNotFoundError(f"snapshot을 찾을 수 없습니다: {snapshot_id}")
        _load_manifest(snapshot_dir)
        return snapshot_dir

    if not latest:
        raise ValueError("restore는 --snapshot 또는 --latest 중 하나가 필요합니다.")

    snapshots = _snapshot_dirs(backups_root)
    if not snapshots:
        raise FileNotFoundError(f"사용 가능한 snapshot이 없습니다: {backups_root}")

    normal = [item for item in snapshots if not item.name.startswith("pre_restore_")]
    target_rows = normal or snapshots
    return target_rows[-1]


def restore_state_snapshot(
    runtime_root: Path,
    *,
    snapshot_id: Optional[str] = None,
    latest: bool = False,
    keep: int = 30,
    required_files: Sequence[str] = DEFAULT_REQUIRED_STATE_FILES,
) -> Dict[str, Any]:
    runtime_root = Path(runtime_root).expanduser()
    snapshot_dir = select_snapshot(runtime_root, snapshot_id=snapshot_id, latest=latest)
    manifest = _validate_snapshot(snapshot_dir, required_files=required_files)

    # 복구 직전 현재 상태를 별도 스냅샷으로 보호한다.
    pre_backup = create_state_backup(
        runtime_root,
        keep=keep,
        snapshot_id=f"pre_restore_{_timestamp_id()}",
        label="pre_restore",
    )

    state_dir = runtime_root / "state"
    stage_dir = runtime_root / f"state.restore.tmp.{os.getpid()}.{int(time.time())}"
    previous_dir = runtime_root / f"state.restore.prev.{os.getpid()}.{int(time.time())}"

    snapshot_state_dir = snapshot_dir / "state"
    shutil.copytree(snapshot_state_dir, stage_dir)

    for required in required_files:
        if not (stage_dir / required).exists():
            shutil.rmtree(stage_dir, ignore_errors=True)
            raise ValueError(f"복구 stage에 필수 파일이 없습니다: {required}")

    had_previous = state_dir.exists()
    try:
        if had_previous:
            state_dir.rename(previous_dir)
        stage_dir.rename(state_dir)
    except Exception:
        if state_dir.exists() and state_dir != previous_dir:
            shutil.rmtree(state_dir, ignore_errors=True)
        if previous_dir.exists() and not state_dir.exists():
            previous_dir.rename(state_dir)
        if stage_dir.exists():
            shutil.rmtree(stage_dir, ignore_errors=True)
        raise
    else:
        if previous_dir.exists():
            shutil.rmtree(previous_dir)

    restored_rows = _collect_file_rows(state_dir)
    return {
        "snapshot_id": snapshot_dir.name,
        "snapshot_dir": str(snapshot_dir),
        "restored_state_dir": str(state_dir),
        "restored_file_count": len(restored_rows),
        "pre_restore_backup": pre_backup,
        "manifest": manifest,
    }
