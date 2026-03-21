from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import fnmatch
import hashlib
from pathlib import Path
import time
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import unquote, urlparse
import urllib.error
import urllib.request

from ..models import Attachment, ConnectorError, EmailEvent


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sanitize_filename(name: str) -> str:
    raw = str(name or "").strip()
    if not raw:
        return "link_attachment"
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in raw)
    return safe.strip("._") or "link_attachment"


def _match_host(host: str, patterns: Sequence[str]) -> bool:
    normalized = str(host or "").strip().lower()
    if not normalized:
        return False
    for raw in patterns:
        pattern = str(raw or "").strip().lower()
        if not pattern:
            continue
        if fnmatch.fnmatch(normalized, pattern):
            return True
    return False


@dataclass
class LinkDownloadConfig:
    enabled: bool = False
    timeout_sec: int = 20
    max_bytes: int = 30 * 1024 * 1024
    retry_max: int = 3
    retry_backoff_sec: Sequence[int] = (1, 2, 4)
    allowed_hosts: Sequence[str] = ()
    denied_hosts: Sequence[str] = ()
    blocked_extensions: Sequence[str] = ()


@dataclass
class LinkDownloadResult:
    attempted: int = 0
    downloaded: int = 0
    skipped_disabled: int = 0
    skipped_no_url: int = 0
    skipped_denied_host: int = 0
    skipped_not_allowed_host: int = 0
    skipped_blocked_extension: int = 0
    skipped_too_large: int = 0
    skipped_auth_required: int = 0
    failed: int = 0
    errors: List[ConnectorError] = None

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []

    def to_dict(self) -> Dict[str, object]:
        return {
            "attempted": self.attempted,
            "downloaded": self.downloaded,
            "skipped_disabled": self.skipped_disabled,
            "skipped_no_url": self.skipped_no_url,
            "skipped_denied_host": self.skipped_denied_host,
            "skipped_not_allowed_host": self.skipped_not_allowed_host,
            "skipped_blocked_extension": self.skipped_blocked_extension,
            "skipped_too_large": self.skipped_too_large,
            "skipped_auth_required": self.skipped_auth_required,
            "failed": self.failed,
            "errors": [row.to_dict() for row in self.errors],
        }


class _DownloadError(Exception):
    def __init__(self, *, code: str, message: str, retryable: bool, detail: Optional[Dict[str, object]] = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.detail = detail or {}


def _default_request_bytes(url: str, *, timeout_sec: int, max_bytes: int) -> Tuple[bytes, Dict[str, object]]:
    request = urllib.request.Request(url=url, method="GET")
    request.add_header("User-Agent", "seabot-email-fetch/1.0")

    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:
            content_length_raw = response.headers.get("Content-Length")
            if content_length_raw:
                try:
                    content_length = int(content_length_raw)
                    if content_length > max_bytes:
                        raise _DownloadError(
                            code="link_too_large",
                            message=f"링크 첨부가 최대 크기({max_bytes})를 초과합니다.",
                            retryable=False,
                            detail={"content_length": content_length, "max_bytes": max_bytes},
                        )
                except ValueError:
                    pass

            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise _DownloadError(
                    code="link_too_large",
                    message=f"링크 첨부가 최대 크기({max_bytes})를 초과합니다.",
                    retryable=False,
                    detail={"read_bytes": len(body), "max_bytes": max_bytes},
                )

            meta: Dict[str, object] = {
                "content_type": str(response.headers.get("Content-Type", "")).strip() or None,
                "final_url": str(getattr(response, "geturl", lambda: url)() or url),
            }
            return body, meta
    except _DownloadError:
        raise
    except urllib.error.HTTPError as exc:
        status = int(getattr(exc, "code", 0) or 0)
        raise _DownloadError(
            code=f"link_http_{status}",
            message=f"링크 첨부 다운로드 실패(http {status})",
            retryable=status in {429, 500, 502, 503, 504},
            detail={"status": status},
        )
    except urllib.error.URLError as exc:
        raise _DownloadError(
            code="link_network_error",
            message=f"링크 첨부 네트워크 오류: {exc}",
            retryable=True,
            detail={"reason": str(exc)},
        )


def hydrate_link_attachments(
    events: Iterable[EmailEvent],
    *,
    source: str,
    attachment_root: Path,
    config: LinkDownloadConfig,
    request_bytes: Optional[Callable[[str], Tuple[bytes, Dict[str, object]]]] = None,
) -> Tuple[List[EmailEvent], LinkDownloadResult]:
    result = LinkDownloadResult()
    output_events = list(events)
    attachment_root = Path(attachment_root).expanduser()
    downloader = request_bytes
    blocked_extensions = {_normalize_extension(item) for item in config.blocked_extensions if _normalize_extension(item)}

    if downloader is None:
        def _wrapped(url: str) -> Tuple[bytes, Dict[str, object]]:
            return _default_request_bytes(url, timeout_sec=max(int(config.timeout_sec), 1), max_bytes=max(int(config.max_bytes), 1))
        downloader = _wrapped

    for event in output_events:
        for index, attachment in enumerate(event.attachments):
            if attachment.type not in {"body_link", "reference_attachment"}:
                continue

            url = str(attachment.url or "").strip()
            if not url:
                result.skipped_no_url += 1
                _mark_metadata(attachment, status="skipped", reason="no_url")
                continue

            if not config.enabled:
                result.skipped_disabled += 1
                _mark_metadata(attachment, status="skipped", reason="download_disabled")
                continue

            parsed = urlparse(url)
            host = str(parsed.netloc or "").strip().lower()
            extension = _url_extension(url)
            if extension and extension in blocked_extensions:
                result.skipped_blocked_extension += 1
                _mark_metadata(
                    attachment,
                    status="skipped",
                    reason="blocked_extension",
                    host=host,
                    extension=extension,
                )
                continue
            if _match_host(host, config.denied_hosts):
                result.skipped_denied_host += 1
                _mark_metadata(attachment, status="skipped", reason="denied_host", host=host)
                continue
            if config.allowed_hosts and not _match_host(host, config.allowed_hosts):
                result.skipped_not_allowed_host += 1
                _mark_metadata(attachment, status="skipped", reason="not_allowed_host", host=host)
                continue

            result.attempted += 1
            blob: Optional[bytes] = None
            blob_meta: Dict[str, object] = {}
            attempts = max(int(config.retry_max), 1)

            for attempt in range(1, attempts + 1):
                try:
                    blob, blob_meta = downloader(url)
                    break
                except _DownloadError as exc:
                    if exc.code == "link_too_large":
                        result.skipped_too_large += 1
                        _mark_metadata(
                            attachment,
                            status="skipped",
                            reason="too_large",
                            host=host,
                            error_code=exc.code,
                            error_detail=exc.detail,
                        )
                        blob = None
                        break

                    status = int(exc.detail.get("status", 0) or 0)
                    if status in {401, 403}:
                        result.skipped_auth_required += 1
                        _mark_metadata(
                            attachment,
                            status="skipped",
                            reason="auth_required",
                            host=host,
                            error_code=exc.code,
                            error_detail=exc.detail,
                        )
                        blob = None
                        break

                    if attempt >= attempts or not exc.retryable:
                        result.failed += 1
                        error = ConnectorError(
                            source=source,
                            code=exc.code,
                            message=exc.message,
                            retryable=exc.retryable,
                            detail={"url": url, "host": host, "attempt": attempt, "detail": exc.detail},
                        )
                        result.errors.append(error)
                        _mark_metadata(
                            attachment,
                            status="failed",
                            reason="download_failed",
                            host=host,
                            error_code=exc.code,
                            error_detail=exc.detail,
                        )
                        event.ingest_status = "partial"
                        blob = None
                        break

                    delay = config.retry_backoff_sec[min(attempt - 1, len(config.retry_backoff_sec) - 1)]
                    time.sleep(max(int(delay), 0))
                    continue
                except Exception as exc:  # noqa: BLE001
                    result.failed += 1
                    error = ConnectorError(
                        source=source,
                        code="link_download_unexpected_error",
                        message=str(exc),
                        retryable=False,
                        detail={"url": url, "host": host, "attempt": attempt, "type": type(exc).__name__},
                    )
                    result.errors.append(error)
                    _mark_metadata(
                        attachment,
                        status="failed",
                        reason="unexpected_error",
                        host=host,
                        error_code=error.code,
                    )
                    event.ingest_status = "partial"
                    blob = None
                    break

            if blob is None:
                continue

            target_path = _write_blob(
                attachment_root=attachment_root,
                source=source,
                event_id=event.event_id,
                index=index,
                url=url,
                blob=blob,
            )
            attachment.local_path = str(target_path)
            attachment.content_sha256 = hashlib.sha256(blob).hexdigest()
            attachment.size = len(blob)
            if not attachment.mime:
                content_type = str(blob_meta.get("content_type") or "").strip()
                if content_type:
                    attachment.mime = content_type.split(";")[0].strip()

            result.downloaded += 1
            _mark_metadata(
                attachment,
                status="downloaded",
                reason="ok",
                host=host,
                downloaded_at=_now_iso(),
                final_url=blob_meta.get("final_url") or url,
                bytes=len(blob),
            )

    return output_events, result


def _write_blob(
    *,
    attachment_root: Path,
    source: str,
    event_id: str,
    index: int,
    url: str,
    blob: bytes,
) -> Path:
    parsed = urlparse(url)
    name_from_url = unquote(Path(parsed.path).name)
    filename = _sanitize_filename(name_from_url or f"link_{index + 1}.bin")

    target_dir = attachment_root / source / "links" / (event_id or "unknown_event")
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / filename

    if target.exists():
        stem = target.stem
        suffix = target.suffix
        seq = 2
        while True:
            candidate = target_dir / f"{stem}_{seq}{suffix}"
            if not candidate.exists():
                target = candidate
                break
            seq += 1

    target.write_bytes(blob)
    return target


def _mark_metadata(attachment: Attachment, **row: object) -> None:
    metadata = dict(attachment.metadata or {})
    link_meta = dict(metadata.get("link_download") or {})
    link_meta.update(row)
    metadata["link_download"] = link_meta
    attachment.metadata = metadata


def _url_extension(url: str) -> str:
    path = str(urlparse(str(url or "")).path or "").strip()
    if not path:
        return ""
    suffix = Path(path).suffix.lower().strip()
    if not suffix:
        return ""
    return _normalize_extension(suffix)


def _normalize_extension(value: str) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    if not raw.startswith("."):
        return "." + raw
    return raw
