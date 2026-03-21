from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import time
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .connectors import ConnectorExecutionError, GmailConnector, HiworksPop3Connector
from .models import ConnectorError
from .pipeline import (
    DEFAULT_AD_KEYWORDS,
    DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS,
    DedupeStore,
    LinkDownloadConfig,
    apply_mail_policies,
    hydrate_link_attachments,
    normalize_events,
    normalize_extensions,
)
from .storage import CursorStore, EventSink


RUN_SCHEMA_VERSION = "email.fetch.run.v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _append_jsonl(path: Path, row: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(row, ensure_ascii=False) + "\n")


def _parse_bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_env_file(path: Path) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def _load_env(path: Path) -> Dict[str, str]:
    payload = dict(_parse_env_file(path))
    for key, value in os.environ.items():
        payload[key] = value
    return payload


def _env_int(env: Dict[str, str], key: str, default: int) -> int:
    raw = env.get(key)
    if raw is None:
        return default
    try:
        return int(str(raw).strip())
    except Exception:
        return default


def _resolve_path(raw: str, *, base_dir: Path) -> Path:
    resolved = Path(raw).expanduser()
    if resolved.is_absolute():
        return resolved
    return (base_dir / resolved).resolve()


def _env_path(env: Dict[str, str], key: str, default: Path, *, base_dir: Path) -> Path:
    raw = str(env.get(key, "")).strip()
    if not raw:
        return default
    return _resolve_path(raw, base_dir=base_dir)


def _split_csv(value: str) -> Tuple[str, ...]:
    raw = str(value or "").strip()
    if not raw:
        return ()
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _split_csv_lower(value: str) -> Tuple[str, ...]:
    return tuple(item.lower() for item in _split_csv(value))


def _validate_link_host_policy(
    *,
    link_download_enabled: bool,
    allowed_hosts: Sequence[str],
    denied_hosts: Sequence[str],
) -> None:
    if not link_download_enabled:
        return

    normalized_allowed = [host.strip().lower() for host in allowed_hosts if host.strip()]
    normalized_denied = [host.strip().lower() for host in denied_hosts if host.strip()]

    if not normalized_allowed:
        raise ValueError(
            "EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=true 인 경우 EMAIL_FETCH_ALLOWED_LINK_HOSTS를 1개 이상 지정해야 합니다."
        )

    risky_patterns = {
        "*",
        "*.*",
        "*.com",
        "*.net",
        "*.org",
        "*.io",
        "*.co",
        "*.kr",
        "*.co.kr",
        "*.biz",
    }
    for host in normalized_allowed:
        if host in risky_patterns:
            raise ValueError(f"허용할 수 없는 광범위 allowlist 패턴입니다: {host}")

    overlap = sorted(set(normalized_allowed) & set(normalized_denied))
    if overlap:
        raise ValueError(f"동일 호스트가 allowlist/denylist에 동시에 존재합니다: {', '.join(overlap)}")


def _read_token_payload_from_file(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return {}
    try:
        row = json.loads(text)
        if isinstance(row, dict):
            return row
    except Exception:
        return {"access_token": text}
    return {}


def _parse_expiry_epoch(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return float(raw)
    except Exception:
        pass
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


@dataclass
class CollectorConfig:
    repo_root: Path
    inbox_root: Path
    runtime_root: Path
    cursor_file: Path
    dedupe_file: Path
    run_log_file: Path
    debug_log_file: Path
    last_summary_file: Path
    attachment_root: Path

    limit: int = 50
    retry_max: int = 3
    retry_backoff_sec: Sequence[int] = (1, 2, 4)
    attachment_max_bytes: int = 30 * 1024 * 1024
    allowed_link_hosts: Sequence[str] = (
        "drive.google.com",
        "docs.google.com",
        "onedrive.live.com",
        "*.sharepoint.com",
        "dropbox.com",
    )
    dry_run: bool = False
    source_workspace_map: Optional[Dict[str, str]] = None
    blocked_attachment_extensions: Sequence[str] = DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS
    ad_keywords: Sequence[str] = DEFAULT_AD_KEYWORDS
    ad_sender_domains: Sequence[str] = ()

    gmail_enabled: bool = True
    gmail_access_token: str = ""
    gmail_refresh_token: str = ""
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_token_uri: str = "https://oauth2.googleapis.com/token"
    gmail_access_token_expires_at: Optional[float] = None
    gmail_token_store_file: Optional[Path] = None
    gmail_user_id: str = "me"
    gmail_timeout_sec: int = 30
    gmail_query: str = ""
    gmail_label_ids: Sequence[str] = ("INBOX",)
    gmail_include_spam_trash: bool = False
    gmail_initial_after_epoch: Optional[int] = None

    hiworks_enabled: bool = False
    hiworks_pop3_host: str = ""
    hiworks_pop3_port: int = 995
    hiworks_pop3_username: str = ""
    hiworks_pop3_password: str = ""
    hiworks_pop3_use_ssl: bool = True
    hiworks_pop3_timeout_sec: int = 30
    hiworks_pop3_seen_window: int = 5000

    link_download_enabled: bool = False
    link_download_timeout_sec: int = 20
    link_download_max_bytes: int = 30 * 1024 * 1024
    link_download_retry_max: int = 3
    link_download_retry_backoff_sec: Sequence[int] = (1, 2, 4)
    denied_link_hosts: Sequence[str] = ()


def build_config_from_env(repo_root: Path, env_file: Path) -> CollectorConfig:
    env = _load_env(env_file)
    env_base_dir = env_file.parent

    default_runtime = repo_root / "guild_hall" / "state" / "gateway" / "log" / "mail_fetch"
    runtime_root = _env_path(env, "EMAIL_FETCH_RUNTIME_DIR", default_runtime, base_dir=env_base_dir)
    inbox_root = _env_path(
        env,
        "EMAIL_FETCH_INBOX_ROOT",
        repo_root / "guild_hall" / "state" / "gateway" / "mailbox",
        base_dir=env_base_dir,
    )

    attachment_max = _env_int(env, "EMAIL_FETCH_ATTACHMENT_MAX_BYTES", 30 * 1024 * 1024)
    limit = _env_int(env, "EMAIL_FETCH_LIMIT", 50)
    initial_days = _env_int(env, "EMAIL_FETCH_GMAIL_INITIAL_DAYS", 3)
    initial_after_epoch = int((datetime.now(timezone.utc) - timedelta(days=max(initial_days, 0))).timestamp())
    gmail_query = str(env.get("EMAIL_FETCH_GMAIL_QUERY", "")).strip()
    label_raw = str(env.get("EMAIL_FETCH_GMAIL_LABEL_IDS", "INBOX")).strip()
    gmail_label_ids = tuple(item.strip() for item in label_raw.split(",") if item.strip())
    gmail_include_spam_trash = _parse_bool(env.get("EMAIL_FETCH_GMAIL_INCLUDE_SPAM_TRASH"), False)

    access_token = str(env.get("GMAIL_ACCESS_TOKEN", "")).strip()
    refresh_token = str(env.get("GMAIL_REFRESH_TOKEN", "")).strip()
    client_id = str(env.get("GMAIL_CLIENT_ID", "")).strip()
    client_secret = str(env.get("GMAIL_CLIENT_SECRET", "")).strip()
    token_uri = str(env.get("GMAIL_TOKEN_URI", "")).strip() or "https://oauth2.googleapis.com/token"
    token_file_raw = str(env.get("GMAIL_ACCESS_TOKEN_FILE", "")).strip()
    token_file_path = _resolve_path(token_file_raw, base_dir=env_base_dir) if token_file_raw else None
    token_payload: Dict[str, Any] = {}
    if token_file_path:
        token_payload = _read_token_payload_from_file(token_file_path)
        if not access_token:
            access_token = str(token_payload.get("access_token", "")).strip()
        if not refresh_token:
            refresh_token = str(token_payload.get("refresh_token", "")).strip()
        if not client_id:
            client_id = str(token_payload.get("client_id", "")).strip()
        if not client_secret:
            client_secret = str(token_payload.get("client_secret", "")).strip()
        token_uri = str(token_payload.get("token_uri", "")).strip() or token_uri

    expires_at_raw = env.get("GMAIL_ACCESS_TOKEN_EXPIRES_AT")
    if expires_at_raw is None:
        expires_at_raw = token_payload.get("expires_at")
    access_token_expires_at = _parse_expiry_epoch(expires_at_raw)

    link_download_enabled = _parse_bool(env.get("EMAIL_FETCH_LINK_DOWNLOAD_ENABLED"), False)

    hosts_raw = str(env.get("EMAIL_FETCH_ALLOWED_LINK_HOSTS", "")).strip()
    hosts = _split_csv(hosts_raw) if hosts_raw else (
        "drive.google.com",
        "docs.google.com",
        "onedrive.live.com",
        "*.sharepoint.com",
        "dropbox.com",
    )
    denied_hosts = _split_csv(str(env.get("EMAIL_FETCH_DENIED_LINK_HOSTS", "")).strip())
    blocked_ext_raw = str(env.get("EMAIL_FETCH_BLOCKED_ATTACHMENT_EXTS", "")).strip()
    blocked_exts = (
        tuple(sorted(normalize_extensions(_split_csv_lower(blocked_ext_raw))))
        if blocked_ext_raw
        else tuple(DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS)
    )
    ad_keywords_raw = str(env.get("EMAIL_FETCH_AD_KEYWORDS", "")).strip()
    ad_keywords = _split_csv(ad_keywords_raw) if ad_keywords_raw else tuple(DEFAULT_AD_KEYWORDS)
    ad_sender_domains = _split_csv_lower(str(env.get("EMAIL_FETCH_AD_SENDER_DOMAINS", "")).strip())
    _validate_link_host_policy(
        link_download_enabled=link_download_enabled,
        allowed_hosts=hosts,
        denied_hosts=denied_hosts,
    )

    map_override = {
        "gmail": str(env.get("EMAIL_FETCH_WORKSPACE_GMAIL", "personal")).strip() or "personal",
        "hiworks": str(env.get("EMAIL_FETCH_WORKSPACE_HIWORKS", "company")).strip() or "company",
        "o365": str(env.get("EMAIL_FETCH_WORKSPACE_O365", "company")).strip() or "company",
    }

    hiworks_password = str(env.get("HIWORKS_POP3_PASSWORD", "")).strip()
    hiworks_password_file = str(env.get("HIWORKS_POP3_PASSWORD_FILE", "")).strip()
    if not hiworks_password and hiworks_password_file:
        password_path = _resolve_path(hiworks_password_file, base_dir=env_base_dir)
        if password_path.exists():
            hiworks_password = password_path.read_text(encoding="utf-8").strip()

    return CollectorConfig(
        repo_root=repo_root,
        inbox_root=inbox_root,
        runtime_root=runtime_root,
        cursor_file=runtime_root / "state" / "cursor_state.json",
        dedupe_file=runtime_root / "state" / "dedupe_keys.json",
        run_log_file=runtime_root / "logs" / "runs.jsonl",
        debug_log_file=runtime_root / "logs" / "collector_debug.jsonl",
        last_summary_file=runtime_root / "logs" / "last_run_summary.json",
        attachment_root=inbox_root,
        limit=max(limit, 1),
        retry_max=max(_env_int(env, "EMAIL_FETCH_RETRY_MAX", 3), 1),
        retry_backoff_sec=(1, 2, 4),
        attachment_max_bytes=max(attachment_max, 0),
        allowed_link_hosts=tuple(hosts),
        dry_run=_parse_bool(env.get("EMAIL_FETCH_DRY_RUN"), False),
        source_workspace_map=map_override,
        blocked_attachment_extensions=blocked_exts,
        ad_keywords=ad_keywords,
        ad_sender_domains=ad_sender_domains,
        gmail_enabled=_parse_bool(env.get("EMAIL_FETCH_SOURCE_GMAIL_ENABLED"), True),
        gmail_access_token=access_token,
        gmail_refresh_token=refresh_token,
        gmail_client_id=client_id,
        gmail_client_secret=client_secret,
        gmail_token_uri=token_uri,
        gmail_access_token_expires_at=access_token_expires_at,
        gmail_token_store_file=token_file_path,
        gmail_user_id=str(env.get("GMAIL_USER_ID", "me")).strip() or "me",
        gmail_timeout_sec=max(_env_int(env, "GMAIL_TIMEOUT_SEC", 30), 1),
        gmail_query=gmail_query,
        gmail_label_ids=gmail_label_ids,
        gmail_include_spam_trash=gmail_include_spam_trash,
        gmail_initial_after_epoch=initial_after_epoch,
        hiworks_enabled=_parse_bool(env.get("EMAIL_FETCH_SOURCE_HIWORKS_ENABLED"), False),
        hiworks_pop3_host=str(env.get("HIWORKS_POP3_HOST", "")).strip(),
        hiworks_pop3_port=max(_env_int(env, "HIWORKS_POP3_PORT", 995), 1),
        hiworks_pop3_username=str(env.get("HIWORKS_POP3_USERNAME", "")).strip(),
        hiworks_pop3_password=hiworks_password,
        hiworks_pop3_use_ssl=_parse_bool(env.get("HIWORKS_POP3_USE_SSL"), True),
        hiworks_pop3_timeout_sec=max(_env_int(env, "HIWORKS_POP3_TIMEOUT_SEC", 30), 1),
        hiworks_pop3_seen_window=max(_env_int(env, "HIWORKS_POP3_SEEN_WINDOW", 5000), 100),
        link_download_enabled=link_download_enabled,
        link_download_timeout_sec=max(_env_int(env, "EMAIL_FETCH_LINK_DOWNLOAD_TIMEOUT_SEC", 20), 1),
        link_download_max_bytes=max(_env_int(env, "EMAIL_FETCH_LINK_DOWNLOAD_MAX_BYTES", attachment_max), 1),
        link_download_retry_max=max(_env_int(env, "EMAIL_FETCH_LINK_DOWNLOAD_RETRY_MAX", 3), 1),
        link_download_retry_backoff_sec=(1, 2, 4),
        denied_link_hosts=tuple(denied_hosts),
    )


def _debug(config: CollectorConfig, event: str, **payload: Any) -> None:
    row = {
        "schema_version": RUN_SCHEMA_VERSION,
        "ts": now_iso(),
        "event": event,
    }
    row.update(payload)
    _append_jsonl(config.debug_log_file, row)


def _build_gmail_connector(config: CollectorConfig) -> GmailConnector:
    return GmailConnector(
        access_token=config.gmail_access_token,
        refresh_token=config.gmail_refresh_token,
        client_id=config.gmail_client_id,
        client_secret=config.gmail_client_secret,
        token_uri=config.gmail_token_uri,
        access_token_expires_at=config.gmail_access_token_expires_at,
        token_store_path=config.gmail_token_store_file,
        user_id=config.gmail_user_id,
        timeout_sec=config.gmail_timeout_sec,
        query_filter=config.gmail_query,
        label_ids=config.gmail_label_ids,
        include_spam_trash=config.gmail_include_spam_trash,
        attachment_max_bytes=config.attachment_max_bytes,
        blocked_attachment_extensions=config.blocked_attachment_extensions,
        download_attachments=not config.dry_run,
        attachment_root=config.inbox_root / "personal" / "mail" / "attachments",
        initial_after_epoch=config.gmail_initial_after_epoch,
    )


def _build_hiworks_connector(config: CollectorConfig) -> HiworksPop3Connector:
    return HiworksPop3Connector(
        host=config.hiworks_pop3_host,
        port=config.hiworks_pop3_port,
        username=config.hiworks_pop3_username,
        password=config.hiworks_pop3_password,
        use_ssl=config.hiworks_pop3_use_ssl,
        timeout_sec=config.hiworks_pop3_timeout_sec,
        seen_window=config.hiworks_pop3_seen_window,
        attachment_max_bytes=config.attachment_max_bytes,
        blocked_attachment_extensions=config.blocked_attachment_extensions,
        download_attachments=not config.dry_run,
        attachment_root=config.inbox_root / "company" / "mail" / "attachments",
    )


def _attachment_root_for_source(config: CollectorConfig, source: str) -> Path:
    workspace = "personal"
    if isinstance(config.source_workspace_map, dict):
        workspace = str(config.source_workspace_map.get(source, "personal")).strip() or "personal"
    return config.inbox_root / workspace / "mail" / "attachments"


def _workspace_for_source(config: CollectorConfig, source: str) -> str:
    if isinstance(config.source_workspace_map, dict):
        return str(config.source_workspace_map.get(source, "personal")).strip() or "personal"
    return "personal"


def _run_with_retry(config: CollectorConfig, source: str, action) -> Tuple[Any, List[ConnectorError]]:
    errors: List[ConnectorError] = []
    attempts = max(config.retry_max, 1)

    for attempt in range(1, attempts + 1):
        try:
            return action(), errors
        except ConnectorExecutionError as exc:
            errors.append(
                ConnectorError(
                    source=source,
                    code=exc.code,
                    message=exc.message,
                    retryable=exc.retryable,
                    detail=exc.detail,
                )
            )
            _debug(
                config,
                "connector_error",
                source=source,
                attempt=attempt,
                code=exc.code,
                retryable=exc.retryable,
            )
            if attempt >= attempts or not exc.retryable:
                break
            delay = config.retry_backoff_sec[min(attempt - 1, len(config.retry_backoff_sec) - 1)]
            time.sleep(delay)
        except Exception as exc:  # noqa: BLE001
            errors.append(
                ConnectorError(
                    source=source,
                    code="unexpected_error",
                    message=str(exc),
                    retryable=False,
                    detail={"type": type(exc).__name__},
                )
            )
            _debug(config, "connector_unexpected_error", source=source, attempt=attempt, error=str(exc))
            break

    return None, errors


def run_once(config: CollectorConfig) -> Dict[str, Any]:
    started_at = now_iso()
    config.runtime_root.mkdir(parents=True, exist_ok=True)

    cursor_store = CursorStore(config.cursor_file)
    dedupe_store = DedupeStore(config.dedupe_file)
    sink = EventSink(config.inbox_root, source_workspace_map=config.source_workspace_map)

    summary: Dict[str, Any] = {
        "schema_version": RUN_SCHEMA_VERSION,
        "started_at": started_at,
        "finished_at": "",
        "partial": False,
        "sources": [],
        "total_events": 0,
        "total_new_events": 0,
        "total_duplicates": 0,
        "errors": [],
    }

    connectors: List[Tuple[str, Any]] = []
    if config.gmail_enabled:
        connectors.append(("gmail", _build_gmail_connector(config)))
    if config.hiworks_enabled:
        connectors.append(("hiworks", _build_hiworks_connector(config)))

    if not connectors:
        summary["finished_at"] = now_iso()
        summary["partial"] = True
        summary["errors"].append(
            {
                "source": "runner",
                "code": "no_enabled_sources",
                "message": "활성화된 메일 소스가 없습니다.",
                "retryable": False,
            }
        )
        _append_jsonl(config.run_log_file, summary)
        config.last_summary_file.parent.mkdir(parents=True, exist_ok=True)
        config.last_summary_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return summary

    for source, connector in connectors:
        cursor = cursor_store.get_cursor(source)
        result, fetch_errors = _run_with_retry(
            config,
            source,
            lambda: connector.fetch_since(cursor=cursor, limit=config.limit),
        )

        source_row: Dict[str, Any] = {
            "source": source,
            "fetched": 0,
            "new_events": 0,
            "duplicates": 0,
            "partial": False,
            "errors": [error.to_dict() for error in fetch_errors],
            "cursor": None,
        }

        if result is None:
            source_row["partial"] = True
            summary["partial"] = True
            summary["sources"].append(source_row)
            summary["errors"].extend(source_row["errors"])
            continue

        source_row["fetched"] = len(result.events)
        try:
            normalized = normalize_events(
                result.events,
                allowed_hosts=config.allowed_link_hosts,
                attachment_max_bytes=config.attachment_max_bytes,
            )
            fresh_events, duplicates = dedupe_store.filter_new(normalized)

            link_config = LinkDownloadConfig(
                enabled=config.link_download_enabled and (not config.dry_run),
                timeout_sec=config.link_download_timeout_sec,
                max_bytes=config.link_download_max_bytes,
                retry_max=config.link_download_retry_max,
                retry_backoff_sec=config.link_download_retry_backoff_sec,
                allowed_hosts=config.allowed_link_hosts,
                denied_hosts=config.denied_link_hosts,
                blocked_extensions=config.blocked_attachment_extensions,
            )
            fresh_events, link_result = hydrate_link_attachments(
                fresh_events,
                source=source,
                attachment_root=_attachment_root_for_source(config, source),
                config=link_config,
            )
            fresh_events = apply_mail_policies(
                fresh_events,
                source=source,
                inbox_root=config.inbox_root,
                workspace=_workspace_for_source(config, source),
                blocked_extensions=config.blocked_attachment_extensions,
                ad_keywords=config.ad_keywords,
                ad_sender_domains=config.ad_sender_domains,
            )
            source_row["link_download"] = link_result.to_dict()
            if link_result.errors:
                source_row["errors"].extend(error.to_dict() for error in link_result.errors)
            if link_result.failed > 0:
                source_row["partial"] = True

            raw_rows = [event.raw for event in result.events if isinstance(event.raw, dict)]

            if not config.dry_run:
                sink_summary = sink.write_batch(source, raw_rows, fresh_events)
                dedupe_store.commit(fresh_events)
                cursor_store.set_cursor(source, result.next_cursor)
                source_row["raw_written"] = sink_summary.raw_written
                source_row["event_written"] = sink_summary.event_written
            else:
                source_row["raw_written"] = len(raw_rows)
                source_row["event_written"] = len(fresh_events)

            source_row["new_events"] = len(fresh_events)
            source_row["duplicates"] = duplicates
            source_row["partial"] = bool(source_row["partial"] or result.partial or fetch_errors)
            source_row["cursor"] = result.next_cursor
            source_row["errors"].extend(error.to_dict() for error in result.errors)
        except Exception as exc:  # noqa: BLE001
            source_row["partial"] = True
            source_row["errors"].append(
                ConnectorError(
                    source=source,
                    code="source_pipeline_error",
                    message=str(exc),
                    retryable=False,
                    detail={"type": type(exc).__name__},
                ).to_dict()
            )
            summary["partial"] = True
            summary["sources"].append(source_row)
            summary["errors"].extend(source_row["errors"])
            _debug(
                config,
                "source_pipeline_error",
                source=source,
                fetched=source_row["fetched"],
                error=str(exc),
            )
            continue

        summary["total_events"] += len(result.events)
        summary["total_new_events"] += len(fresh_events)
        summary["total_duplicates"] += duplicates
        summary["sources"].append(source_row)

        if source_row["partial"]:
            summary["partial"] = True
        summary["errors"].extend(source_row["errors"])

        _debug(
            config,
            "source_processed",
            source=source,
            fetched=source_row["fetched"],
            new_events=source_row["new_events"],
            duplicates=source_row["duplicates"],
            partial=source_row["partial"],
        )

    if not config.dry_run:
        cursor_store.save()

    summary["finished_at"] = now_iso()
    _append_jsonl(config.run_log_file, summary)
    config.last_summary_file.parent.mkdir(parents=True, exist_ok=True)
    config.last_summary_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary
