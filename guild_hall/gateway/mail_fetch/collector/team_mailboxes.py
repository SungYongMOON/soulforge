from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path, PurePosixPath
import re
from typing import Any, Dict, List, Optional, Sequence

from . import runner


TEAM_REGISTER_SCHEMA_VERSION = "email.fetch.team_mailbox_register.v1"
TEAM_RUN_SCHEMA_VERSION = "email.fetch.team_mailbox_run.v1"
SUPPORTED_PROVIDERS = {"gmail", "hiworks"}
DEFAULT_TEAM_REGISTER_REL = Path("guild_hall/state/gateway/mailbox/state/team_mailboxes.json")
_REPO_RELATIVE_PREFIXES = (
    "guild_hall/",
    "private-state/",
    "_workmeta/",
    "_workspaces/",
)
_FORBIDDEN_KEY_FRAGMENTS = (
    "access_token",
    "authorization",
    "client_secret",
    "cookie",
    "credential",
    "password",
    "refresh_token",
    "secret",
    "session",
    "token",
)
_SAFE_PATH_TOKEN_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


class TeamMailboxRegisterError(ValueError):
    def __init__(self, code: str, *, row_index: Optional[int] = None, field: str = "") -> None:
        self.code = code
        self.row_index = row_index
        self.field = field
        location = f" row={row_index}" if row_index is not None else ""
        field_text = f" field={field}" if field else ""
        super().__init__(f"invalid team mailbox register:{location}{field_text} code={code}")


@dataclass(frozen=True)
class TeamMailbox:
    id: str
    account_id: str
    email: str
    display_name: str
    provider: str
    enabled: bool
    env_file_ref: str
    env_file: Path
    workspace: str = ""

    def metadata(self, *, workspace: str) -> Dict[str, str]:
        payload = {
            "id": self.id,
            "account_id": self.account_id,
            "email": self.email,
            "display_name": self.display_name,
            "provider": self.provider,
            "workspace": workspace,
        }
        return {key: value for key, value in payload.items() if value}

    def operator_summary(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "id": self.id,
            "provider": self.provider,
            "enabled": self.enabled,
        }
        if self.workspace:
            payload["workspace"] = self.workspace
        return payload


def _private_config_root(repo_root: Path) -> Optional[Path]:
    raw = str(os.environ.get("EMAIL_FETCH_PRIVATE_CONFIG_ROOT", "")).strip()
    if not raw:
        return None
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = Path(repo_root).expanduser() / path
    return path.resolve()


def default_register_path(repo_root: Path) -> Path:
    repo_root = Path(repo_root).expanduser().resolve()
    root = _private_config_root(repo_root) or repo_root
    return root / DEFAULT_TEAM_REGISTER_REL


def load_team_mailbox_register(
    repo_root: Path,
    register_file: Path,
    *,
    register_text: Optional[str] = None,
) -> List[TeamMailbox]:
    repo_root = Path(repo_root).expanduser().resolve()
    register_file = Path(register_file).expanduser()
    if not register_file.is_absolute():
        register_file = (repo_root / register_file).resolve()
    else:
        register_file = register_file.resolve()

    try:
        payload = json.loads(
            register_text if register_text is not None else register_file.read_text(encoding="utf-8")
        )
    except FileNotFoundError as exc:
        raise TeamMailboxRegisterError("register_not_found") from exc
    except json.JSONDecodeError as exc:
        raise TeamMailboxRegisterError("register_invalid_json") from exc

    if not isinstance(payload, dict):
        raise TeamMailboxRegisterError("register_not_object")
    _reject_forbidden_register_keys(payload)

    if str(payload.get("schema_version", "")).strip() != TEAM_REGISTER_SCHEMA_VERSION:
        raise TeamMailboxRegisterError("unsupported_schema_version", field="schema_version")

    rows = payload.get("mailboxes")
    if not isinstance(rows, list):
        raise TeamMailboxRegisterError("missing_mailboxes", field="mailboxes")

    mailboxes: List[TeamMailbox] = []
    seen_ids = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise TeamMailboxRegisterError("row_not_object", row_index=index)
        mailbox = _parse_mailbox_row(row, row_index=index, repo_root=repo_root, register_file=register_file)
        if mailbox.id in seen_ids:
            raise TeamMailboxRegisterError("duplicate_id", row_index=index, field="id")
        seen_ids.add(mailbox.id)
        mailboxes.append(mailbox)
    return mailboxes


def run_team_mailboxes(
    *,
    repo_root: Path,
    register_file: Path,
    dry_run: bool = False,
    ingress_only: bool = False,
    limit: int = 0,
    mailboxes: Optional[Sequence[TeamMailbox]] = None,
    credential_texts_by_path: Optional[Dict[str, str]] = None,
    capsule_env_overrides: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    started_at = _now_iso()
    selected_mailboxes = list(mailboxes) if mailboxes is not None else load_team_mailbox_register(
        repo_root=repo_root,
        register_file=register_file,
    )
    enabled = [mailbox for mailbox in selected_mailboxes if mailbox.enabled]

    summary: Dict[str, Any] = {
        "schema_version": TEAM_RUN_SCHEMA_VERSION,
        "started_at": started_at,
        "finished_at": "",
        "partial": False,
        "dry_run": bool(dry_run),
        "mailboxes_total": len(selected_mailboxes),
        "mailboxes_enabled": len(enabled),
        "mailboxes_run": 0,
        "mailboxes_skipped": len(selected_mailboxes) - len(enabled),
        "total_events": 0,
        "total_new_events": 0,
        "total_duplicates": 0,
        "mailboxes": [mailbox.operator_summary() for mailbox in selected_mailboxes],
        "results": [],
        "errors": [],
    }

    prepared = []
    for mailbox in enabled:
        try:
            credential_text = None
            if credential_texts_by_path is not None:
                credential_key = str(mailbox.env_file)
                if credential_key not in credential_texts_by_path:
                    raise TeamMailboxRegisterError("credential_not_preloaded", field="env_file")
                credential_text = credential_texts_by_path[credential_key]
            config = build_config_for_mailbox(
                repo_root=repo_root,
                mailbox=mailbox,
                credential_text=credential_text,
                include_ambient_env=credential_texts_by_path is None,
                env_overrides=capsule_env_overrides,
                disable_credential_persistence=credential_texts_by_path is not None,
            )
            if dry_run:
                config.dry_run = True
            if ingress_only:
                config.ingress_only = True
            if int(limit or 0) > 0:
                config.limit = int(limit)
            prepared.append((mailbox, config))
        except Exception as exc:  # noqa: BLE001
            summary["partial"] = True
            summary["errors"].append(
                {
                    "mailbox": mailbox.operator_summary(),
                    "code": "mailbox_run_error",
                    "type": type(exc).__name__,
                    "message": str(exc),
                }
            )

    for mailbox, config in prepared:
        try:
            result = runner.run_once(config)
            summary["mailboxes_run"] += 1
            summary["total_events"] += int(result.get("total_events") or 0)
            summary["total_new_events"] += int(result.get("total_new_events") or 0)
            summary["total_duplicates"] += int(result.get("total_duplicates") or 0)
            summary["partial"] = bool(summary["partial"] or result.get("partial"))
            summary["results"].append(
                {
                    "mailbox": mailbox.operator_summary(),
                    "result": result,
                }
            )
        except Exception as exc:  # noqa: BLE001
            summary["partial"] = True
            summary["errors"].append(
                {
                    "mailbox": mailbox.operator_summary(),
                    "code": "mailbox_run_error",
                    "type": type(exc).__name__,
                    "message": str(exc),
                }
            )

    summary["finished_at"] = _now_iso()
    return runner.sanitize_for_operator_output(summary)


def build_config_for_mailbox(
    *,
    repo_root: Path,
    mailbox: TeamMailbox,
    credential_text: Optional[str] = None,
    include_ambient_env: bool = True,
    env_overrides: Optional[Dict[str, str]] = None,
    disable_credential_persistence: bool = False,
) -> runner.CollectorConfig:
    config = runner.build_config_from_env(
        repo_root=Path(repo_root).expanduser(),
        env_file=mailbox.env_file,
        env_text=credential_text,
        include_ambient=include_ambient_env,
        env_overrides=env_overrides,
        disable_credential_persistence=disable_credential_persistence,
    )

    config.gmail_enabled = mailbox.provider == "gmail"
    config.hiworks_enabled = mailbox.provider == "hiworks"

    source_workspace_map = dict(config.source_workspace_map or {})
    workspace = mailbox.workspace or str(source_workspace_map.get(mailbox.provider, "") or "").strip()
    if not workspace:
        workspace = "personal" if mailbox.provider == "gmail" else "company"
    source_workspace_map[mailbox.provider] = workspace
    config.source_workspace_map = source_workspace_map
    config.mailbox_metadata = mailbox.metadata(workspace=workspace)

    runtime_root = config.runtime_root / "mailboxes" / mailbox.id
    config.runtime_root = runtime_root
    config.cursor_file = runtime_root / "state" / "cursor_state.json"
    config.dedupe_file = runtime_root / "state" / "dedupe_keys.json"
    config.run_log_file = runtime_root / "logs" / "runs.jsonl"
    config.debug_log_file = runtime_root / "logs" / "collector_debug.jsonl"
    config.last_summary_file = runtime_root / "logs" / "last_run_summary.json"
    return config


def _parse_mailbox_row(
    row: Dict[str, Any],
    *,
    row_index: int,
    repo_root: Path,
    register_file: Path,
) -> TeamMailbox:
    mailbox_id = _required_token(row, "id", row_index=row_index)
    provider = str(row.get("provider", "") or "").strip().lower()
    if not provider or provider not in SUPPORTED_PROVIDERS:
        raise TeamMailboxRegisterError("unsupported_provider", row_index=row_index, field="provider")

    email = str(row.get("email", "") or "").strip()
    if not email:
        raise TeamMailboxRegisterError("missing_required", row_index=row_index, field="email")

    env_file_ref = _required_env_ref(row, row_index=row_index)
    env_file = _resolve_env_ref(
        env_file_ref,
        repo_root=repo_root,
        register_file=register_file,
        row_index=row_index,
    )

    workspace = str(row.get("workspace", "") or "").strip()
    if workspace:
        workspace = _safe_relative_workspace(workspace, row_index=row_index)

    enabled = row.get("enabled", False)
    if not isinstance(enabled, bool):
        raise TeamMailboxRegisterError("enabled_not_boolean", row_index=row_index, field="enabled")

    account_id = str(row.get("account_id", "") or "").strip()
    display_name = str(row.get("display_name", "") or "").strip()
    return TeamMailbox(
        id=mailbox_id,
        account_id=account_id,
        email=email,
        display_name=display_name,
        provider=provider,
        enabled=enabled,
        env_file_ref=env_file_ref,
        env_file=env_file,
        workspace=workspace,
    )


def _required_token(row: Dict[str, Any], field: str, *, row_index: int) -> str:
    value = str(row.get(field, "") or "").strip()
    if not value:
        raise TeamMailboxRegisterError("missing_required", row_index=row_index, field=field)
    if not _SAFE_PATH_TOKEN_RE.match(value):
        raise TeamMailboxRegisterError("unsupported_token", row_index=row_index, field=field)
    return value


def _required_env_ref(row: Dict[str, Any], *, row_index: int) -> str:
    raw = str(row.get("env_file", "") or "").strip()
    if not raw:
        raise TeamMailboxRegisterError("missing_required", row_index=row_index, field="env_file")
    return _validate_relative_ref(raw, row_index=row_index)


def _validate_relative_ref(raw: str, *, row_index: int) -> str:
    normalized = str(raw or "").replace("\\", "/").strip()
    if not normalized:
        raise TeamMailboxRegisterError("missing_required", row_index=row_index, field="env_file")
    if normalized.startswith("/") or normalized.startswith("~") or re.match(r"^[A-Za-z]:/", normalized):
        raise TeamMailboxRegisterError("absolute_env_ref", row_index=row_index, field="env_file")

    parts = PurePosixPath(normalized).parts
    if any(part == ".." for part in parts):
        raise TeamMailboxRegisterError("traversal_env_ref", row_index=row_index, field="env_file")
    return normalized


def _resolve_env_ref(raw: str, *, repo_root: Path, register_file: Path, row_index: int) -> Path:
    private_root = _private_config_root(repo_root)
    if _is_repo_relative_ref(raw):
        resolved = ((private_root or repo_root) / Path(raw)).resolve()
    else:
        resolved = (register_file.parent / Path(raw)).resolve()

    allowed_roots = [repo_root]
    if private_root is not None:
        allowed_roots.append(private_root)
    for allowed_root in allowed_roots:
        try:
            resolved.relative_to(allowed_root)
            break
        except ValueError:
            continue
    else:
        raise TeamMailboxRegisterError("env_ref_outside_allowed_root", row_index=row_index, field="env_file")
    return resolved


def _is_repo_relative_ref(raw: str) -> bool:
    normalized = str(raw or "").replace("\\", "/").strip()
    return normalized.startswith(_REPO_RELATIVE_PREFIXES)


def _safe_relative_workspace(raw: str, *, row_index: int) -> str:
    normalized = str(raw or "").replace("\\", "/").strip().strip("/")
    if not normalized:
        return ""
    if normalized.startswith("~") or normalized.startswith("/") or re.match(r"^[A-Za-z]:/", normalized):
        raise TeamMailboxRegisterError("invalid_workspace", row_index=row_index, field="workspace")
    parts = PurePosixPath(normalized).parts
    if any(part in {"", ".", ".."} for part in parts):
        raise TeamMailboxRegisterError("invalid_workspace", row_index=row_index, field="workspace")
    for part in parts:
        if not _SAFE_PATH_TOKEN_RE.match(part):
            raise TeamMailboxRegisterError("invalid_workspace", row_index=row_index, field="workspace")
    return "/".join(parts)


def _reject_forbidden_register_keys(value: Any) -> None:
    for key in _iter_register_keys(value):
        normalized = str(key or "").strip().lower().replace("-", "_")
        if any(fragment in normalized for fragment in _FORBIDDEN_KEY_FRAGMENTS):
            raise TeamMailboxRegisterError("forbidden_secret_field", field="register")


def _iter_register_keys(value: Any) -> Sequence[str]:
    keys: List[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            keys.append(str(key))
            keys.extend(_iter_register_keys(child))
    elif isinstance(value, list):
        for child in value:
            keys.extend(_iter_register_keys(child))
    return keys


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
