from __future__ import annotations

from datetime import datetime, timezone
from email import policy
from email.header import decode_header, make_header
from email.message import Message
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime
import hashlib
from pathlib import Path
import poplib
import re
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from ..models import Address, Attachment, ConnectorError, EmailEvent, FetchResult
from .base import BaseConnector, ConnectorExecutionError


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sanitize_filename(name: str) -> str:
    value = re.sub(r"[\\/\x00-\x1f\x7f]+", "_", str(name or "attachment").strip())
    value = re.sub(r"\s+", " ", value).strip()
    return value or "attachment"


def _file_extension(name: str) -> str:
    value = str(name or "").strip().lower()
    if not value:
        return ""
    ext = Path(value).suffix
    if not ext:
        return ""
    if not ext.startswith("."):
        return "." + ext
    return ext


def _decode_header_text(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw))).strip()
    except Exception:
        return raw


def _decode_bytes(data: bytes, charset: Optional[str]) -> str:
    if not data:
        return ""
    candidates: List[str] = []
    if charset:
        candidates.append(str(charset).strip())
    candidates.extend(["utf-8", "cp949", "euc-kr", "latin-1"])
    tried: set[str] = set()
    for item in candidates:
        if not item or item in tried:
            continue
        tried.add(item)
        try:
            return data.decode(item)
        except Exception:
            continue
    return data.decode("utf-8", errors="replace")


def _parse_address_list(raw: str) -> List[Address]:
    rows: List[Address] = []
    for name, address in getaddresses([raw or ""]):
        if not address:
            continue
        rows.append(Address(name=_decode_header_text(name), address=str(address).strip()))
    return rows


def _parse_received_at(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return _now_iso()
    try:
        parsed = parsedate_to_datetime(value)
    except Exception:
        return _now_iso()
    if parsed is None:
        return _now_iso()
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


class HiworksPop3Connector(BaseConnector):
    source = "hiworks"

    def __init__(
        self,
        *,
        host: str,
        username: str,
        password: str,
        port: int = 995,
        use_ssl: bool = True,
        timeout_sec: int = 30,
        seen_window: int = 5000,
        attachment_max_bytes: int = 30 * 1024 * 1024,
        blocked_attachment_extensions: Optional[Sequence[str]] = None,
        download_attachments: bool = True,
        attachment_root: Optional[Path] = None,
        pop3_factory: Optional[Callable[[str, int, bool, int], Any]] = None,
    ) -> None:
        super().__init__("hiworks")
        self.host = str(host or "").strip()
        self.username = str(username or "").strip()
        self.password = str(password or "").strip()
        self.port = max(int(port), 1)
        self.use_ssl = bool(use_ssl)
        self.timeout_sec = max(int(timeout_sec), 1)
        self.seen_window = max(int(seen_window), 100)
        self.attachment_max_bytes = max(int(attachment_max_bytes), 0)
        blocked = blocked_attachment_extensions or ()
        self.blocked_attachment_extensions = {
            item if str(item).startswith(".") else f".{item}"
            for item in (str(raw or "").strip().lower() for raw in blocked)
            if item
        }
        self.download_attachments = bool(download_attachments)
        self.attachment_root = Path(attachment_root).expanduser() if attachment_root else None
        self._pop3_factory = pop3_factory or self._default_pop3_factory

    def fetch_since(self, cursor: Optional[Dict[str, Any]], limit: int) -> FetchResult:
        if not self.host or not self.username or not self.password:
            return FetchResult(
                partial=True,
                errors=[
                    ConnectorError(
                        source=self.source,
                        code="missing_config",
                        message="Hiworks POP3 설정(host/username/password)이 비어 있어 수집을 건너뜁니다.",
                        retryable=False,
                    )
                ],
            )

        cursor_payload = cursor if isinstance(cursor, dict) else {}
        seen_uidls = self._cursor_seen_uidls(cursor_payload)
        fetch_limit = min(max(int(limit or 1), 1), 500)

        client = self._connect_client()
        try:
            uidl_rows = self._list_uidls(client)
            new_rows = [(msg_num, uidl) for msg_num, uidl in uidl_rows if uidl not in seen_uidls]
            selected_rows = new_rows[:fetch_limit]

            events: List[EmailEvent] = []
            processed_uidls: List[str] = []
            errors: List[ConnectorError] = []
            partial = False

            for msg_num, uidl in selected_rows:
                try:
                    raw_bytes, message_size = self._retrieve_message(client, msg_num)
                    event = self._parse_email_event(
                        raw_bytes=raw_bytes,
                        uidl=uidl,
                        message_num=msg_num,
                        message_size=message_size,
                    )
                    events.append(event)
                    processed_uidls.append(uidl)
                except ConnectorExecutionError as exc:
                    partial = True
                    errors.append(
                        ConnectorError(
                            source=self.source,
                            code=exc.code,
                            message=exc.message,
                            retryable=exc.retryable,
                            detail=exc.detail,
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    partial = True
                    errors.append(
                        ConnectorError(
                            source=self.source,
                            code="message_parse_error",
                            message=str(exc),
                            retryable=False,
                            detail={"type": type(exc).__name__, "uidl": uidl},
                        )
                    )

            next_cursor = self._build_next_cursor(
                previous_seen=seen_uidls,
                processed_uidls=processed_uidls,
                previous_last_uidl=str(cursor_payload.get("last_uidl", "")).strip(),
                mailbox_count=len(uidl_rows),
                last_scan_uidl=uidl_rows[-1][1] if uidl_rows else "",
            )

            return FetchResult(
                events=events,
                next_cursor=next_cursor,
                partial=partial,
                errors=errors,
            )
        finally:
            try:
                client.quit()
            except Exception:
                pass

    def _default_pop3_factory(self, host: str, port: int, use_ssl: bool, timeout_sec: int) -> Any:
        if use_ssl:
            return poplib.POP3_SSL(host, port=port, timeout=timeout_sec)
        return poplib.POP3(host, port=port, timeout=timeout_sec)

    def _connect_client(self) -> Any:
        try:
            client = self._pop3_factory(self.host, self.port, self.use_ssl, self.timeout_sec)
        except OSError as exc:
            raise ConnectorExecutionError(
                code="network_error",
                message=f"hiworks pop3 연결 실패: {exc}",
                retryable=True,
                detail={"reason": str(exc)},
            )
        except Exception as exc:  # noqa: BLE001
            raise ConnectorExecutionError(
                code="connect_error",
                message=f"hiworks pop3 클라이언트 생성 실패: {exc}",
                retryable=False,
                detail={"type": type(exc).__name__},
            )

        try:
            client.user(self.username)
            client.pass_(self.password)
            return client
        except poplib.error_proto as exc:
            raise ConnectorExecutionError(
                code="auth_failed",
                message=f"hiworks pop3 인증 실패: {exc}",
                retryable=False,
            )
        except OSError as exc:
            raise ConnectorExecutionError(
                code="network_error",
                message=f"hiworks pop3 인증 중 네트워크 오류: {exc}",
                retryable=True,
                detail={"reason": str(exc)},
            )
        except Exception as exc:  # noqa: BLE001
            raise ConnectorExecutionError(
                code="auth_error",
                message=f"hiworks pop3 인증 오류: {exc}",
                retryable=False,
                detail={"type": type(exc).__name__},
            )

    def _list_uidls(self, client: Any) -> List[Tuple[int, str]]:
        try:
            _, lines, _ = client.uidl()
        except poplib.error_proto as exc:
            raise ConnectorExecutionError(
                code="uidl_error",
                message=f"hiworks pop3 UIDL 조회 실패: {exc}",
                retryable=True,
            )
        except OSError as exc:
            raise ConnectorExecutionError(
                code="network_error",
                message=f"hiworks pop3 UIDL 네트워크 오류: {exc}",
                retryable=True,
                detail={"reason": str(exc)},
            )

        rows: List[Tuple[int, str]] = []
        for row in lines or []:
            text = row.decode("utf-8", errors="ignore") if isinstance(row, (bytes, bytearray)) else str(row)
            parts = text.strip().split()
            if len(parts) < 2:
                continue
            msg_num_raw, uidl_raw = parts[0], parts[1]
            try:
                msg_num = int(msg_num_raw)
            except Exception:
                continue
            uidl = str(uidl_raw).strip()
            if not uidl:
                continue
            rows.append((msg_num, uidl))
        rows.sort(key=lambda item: item[0])
        return rows

    def _retrieve_message(self, client: Any, msg_num: int) -> Tuple[bytes, int]:
        try:
            _, lines, octets = client.retr(msg_num)
        except poplib.error_proto as exc:
            raise ConnectorExecutionError(
                code="retr_error",
                message=f"hiworks pop3 메시지 조회 실패(msg={msg_num}): {exc}",
                retryable=True,
            )
        except OSError as exc:
            raise ConnectorExecutionError(
                code="network_error",
                message=f"hiworks pop3 메시지 조회 네트워크 오류(msg={msg_num}): {exc}",
                retryable=True,
                detail={"reason": str(exc)},
            )
        raw = b"\r\n".join(lines or []) + b"\r\n"
        try:
            size = int(octets)
        except Exception:
            size = len(raw)
        return raw, max(size, len(raw))

    def _parse_email_event(
        self,
        *,
        raw_bytes: bytes,
        uidl: str,
        message_num: int,
        message_size: int,
    ) -> EmailEvent:
        message = BytesParser(policy=policy.default).parsebytes(raw_bytes)
        subject = _decode_header_text(message.get("Subject", ""))
        message_id = str(message.get("Message-ID", "")).strip().strip("<>").strip() or uidl
        from_addrs = _parse_address_list(message.get("From", ""))
        to_addrs = _parse_address_list(message.get("To", ""))
        cc_addrs = _parse_address_list(message.get("Cc", ""))
        received_at = _parse_received_at(message.get("Date", ""))
        body_text, body_html, attachments = self._extract_payload(message=message, uidl=uidl)

        event_seed = f"hiworks:{message_id}:{received_at}"
        event_id = hashlib.sha256(event_seed.encode("utf-8")).hexdigest()[:16]

        return EmailEvent(
            event_id=event_id,
            source=self.source,
            provider_message_id=message_id,
            thread_id=None,
            subject=subject,
            from_addrs=from_addrs,
            to_addrs=to_addrs,
            cc_addrs=cc_addrs,
            received_at=received_at,
            body_text=body_text,
            body_html=body_html,
            attachments=attachments,
            raw={
                "uidl": uidl,
                "message_num": message_num,
                "message_id": message_id,
                "message_size": message_size,
                "headers": {
                    "subject": subject,
                    "from": message.get("From", ""),
                    "to": message.get("To", ""),
                    "date": message.get("Date", ""),
                },
            },
            metadata={
                "uidl": uidl,
                "message_num": message_num,
                "message_size": message_size,
            },
        )

    def _extract_payload(self, *, message: Message, uidl: str) -> Tuple[Optional[str], Optional[str], List[Attachment]]:
        text_chunks: List[str] = []
        html_chunks: List[str] = []
        attachments: List[Attachment] = []

        for part in message.walk():
            if part.is_multipart():
                continue

            content_type = str(part.get_content_type() or "").strip().lower()
            disposition = str(part.get_content_disposition() or "").strip().lower()
            filename_raw = part.get_filename()
            filename = _decode_header_text(filename_raw) if filename_raw else ""
            payload = part.get_payload(decode=True) or b""

            if filename or disposition == "attachment":
                attachment_size = len(payload)
                normalized_name = _sanitize_filename(filename or "attachment")
                ext = _file_extension(normalized_name)
                is_blocked_ext = bool(ext and ext in self.blocked_attachment_extensions)
                item = Attachment(
                    type="binary_attachment",
                    name=normalized_name,
                    mime=content_type or None,
                    size=attachment_size,
                    provider_attachment_id=uidl,
                    metadata={"uidl": uidl, "blocked_extension": ext if is_blocked_ext else None},
                )
                if is_blocked_ext:
                    item.type = "reference_attachment"
                    item.url = f"source://hiworks/{uidl}/{item.name}"
                elif attachment_size > self.attachment_max_bytes:
                    item.type = "reference_attachment"
                    item.url = f"source://hiworks/{uidl}/{item.name}"
                elif self.download_attachments and payload:
                    item.content_sha256 = hashlib.sha256(payload).hexdigest()
                    if self.attachment_root:
                        item.local_path = str(self._write_attachment(uidl, item.name or "attachment", payload))
                attachments.append(item)
                continue

            if content_type == "text/plain":
                text_chunks.append(_decode_bytes(payload, part.get_content_charset()))
            elif content_type == "text/html":
                html_chunks.append(_decode_bytes(payload, part.get_content_charset()))

        body_text = "\n".join(chunk for chunk in text_chunks if chunk).strip() or None
        body_html = "\n".join(chunk for chunk in html_chunks if chunk).strip() or None
        return body_text, body_html, attachments

    def _write_attachment(self, uidl: str, filename: str, blob: bytes) -> Path:
        if not self.attachment_root:
            raise ConnectorExecutionError(
                code="missing_attachment_root",
                message="attachment_root가 설정되지 않았습니다.",
                retryable=False,
            )

        target_dir = self.attachment_root / "hiworks" / uidl
        target_dir.mkdir(parents=True, exist_ok=True)
        base = _sanitize_filename(filename)
        target = target_dir / base

        if target.exists():
            stem = target.stem
            suffix = target.suffix
            index = 2
            while True:
                candidate = target_dir / f"{stem}_{index}{suffix}"
                if not candidate.exists():
                    target = candidate
                    break
                index += 1

        target.write_bytes(blob)
        return target

    def _cursor_seen_uidls(self, cursor_payload: Dict[str, Any]) -> List[str]:
        rows = cursor_payload.get("seen_uidls")
        if not isinstance(rows, list):
            return []
        seen: List[str] = []
        for row in rows:
            uidl = str(row or "").strip()
            if not uidl:
                continue
            seen.append(uidl)
        if len(seen) > self.seen_window:
            return seen[-self.seen_window :]
        return seen

    def _build_next_cursor(
        self,
        *,
        previous_seen: Sequence[str],
        processed_uidls: Sequence[str],
        previous_last_uidl: str,
        mailbox_count: int,
        last_scan_uidl: str,
    ) -> Dict[str, Any]:
        merged: List[str] = []
        seen: set[str] = set()
        for uidl in list(previous_seen) + list(processed_uidls):
            value = str(uidl or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            merged.append(value)

        if len(merged) > self.seen_window:
            merged = merged[-self.seen_window :]

        last_uidl = str(processed_uidls[-1]).strip() if processed_uidls else str(previous_last_uidl or "").strip()
        cursor: Dict[str, Any] = {
            "seen_uidls": merged,
            "seen_window": self.seen_window,
            "last_uidl": last_uidl or None,
            "mailbox_count": max(int(mailbox_count), 0),
            "last_scan_uidl": str(last_scan_uidl or "").strip() or None,
            "updated_at": _now_iso(),
        }
        return cursor
