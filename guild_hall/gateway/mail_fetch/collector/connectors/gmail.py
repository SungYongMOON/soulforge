from __future__ import annotations

import base64
from datetime import datetime, timezone
from email.utils import getaddresses
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from ..models import Address, Attachment, ConnectorError, EmailEvent, FetchResult
from .base import BaseConnector, ConnectorExecutionError


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe_decode_base64url(payload: str) -> bytes:
    if not payload:
        return b""
    padding = "=" * ((4 - len(payload) % 4) % 4)
    return base64.urlsafe_b64decode((payload + padding).encode("utf-8"))


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


def _header_map(payload: Dict[str, Any]) -> Dict[str, str]:
    rows = payload.get("headers") or []
    result: Dict[str, str] = {}
    if not isinstance(rows, list):
        return result
    for row in rows:
        if not isinstance(row, dict):
            continue
        key = str(row.get("name", "")).strip().lower()
        if not key:
            continue
        result[key] = str(row.get("value", "")).strip()
    return result


def _parse_address_list(raw: str) -> List[Address]:
    items = []
    for name, address in getaddresses([raw or ""]):
        if not address:
            continue
        items.append(Address(name=str(name or "").strip(), address=str(address).strip()))
    return items


class GmailConnector(BaseConnector):
    """Gmail thin connector for P1.

    - list messages
    - get message payload
    - optional attachment download for <= threshold
    """

    source = "gmail"

    def __init__(
        self,
        *,
        access_token: str,
        refresh_token: str = "",
        client_id: str = "",
        client_secret: str = "",
        token_uri: str = "https://oauth2.googleapis.com/token",
        access_token_expires_at: Optional[float] = None,
        token_store_path: Optional[Path] = None,
        token_refresh_margin_sec: int = 120,
        user_id: str = "me",
        timeout_sec: int = 30,
        query_filter: str = "",
        label_ids: Optional[Sequence[str]] = None,
        include_spam_trash: bool = False,
        attachment_max_bytes: int = 30 * 1024 * 1024,
        blocked_attachment_extensions: Optional[Sequence[str]] = None,
        download_attachments: bool = True,
        attachment_root: Optional[Path] = None,
        initial_after_epoch: Optional[int] = None,
        request_json: Optional[Callable[..., Dict[str, Any]]] = None,
        token_request_json: Optional[Callable[..., Dict[str, Any]]] = None,
    ) -> None:
        super().__init__("gmail")
        self.access_token = str(access_token or "").strip()
        self.refresh_token = str(refresh_token or "").strip()
        self.client_id = str(client_id or "").strip()
        self.client_secret = str(client_secret or "").strip()
        self.token_uri = str(token_uri or "https://oauth2.googleapis.com/token").strip()
        self.access_token_expires_at = float(access_token_expires_at) if access_token_expires_at else None
        self.token_store_path = Path(token_store_path).expanduser() if token_store_path else None
        self.token_refresh_margin_sec = max(int(token_refresh_margin_sec), 30)
        self.user_id = str(user_id or "me").strip() or "me"
        self.timeout_sec = max(int(timeout_sec), 1)
        self.query_filter = str(query_filter or "").strip()
        labels: List[str] = []
        for item in list(label_ids or []):
            value = str(item or "").strip()
            if not value:
                continue
            labels.append(value)
        self.label_ids = tuple(labels)
        self.include_spam_trash = bool(include_spam_trash)
        self.attachment_max_bytes = max(int(attachment_max_bytes), 0)
        blocked = blocked_attachment_extensions or ()
        self.blocked_attachment_extensions = {
            item if str(item).startswith(".") else f".{item}"
            for item in (str(raw or "").strip().lower() for raw in blocked)
            if item
        }
        self.download_attachments = bool(download_attachments)
        self.attachment_root = Path(attachment_root).expanduser() if attachment_root else None
        self.initial_after_epoch = int(initial_after_epoch or 0) if initial_after_epoch else None
        self._request_json = request_json or self._api_json
        self._token_request_json = token_request_json or self._oauth_token_json

    def fetch_since(self, cursor: Optional[Dict[str, Any]], limit: int) -> FetchResult:
        try:
            self._refresh_access_token(force=False)
        except ConnectorExecutionError as exc:
            if not self.access_token:
                return FetchResult(
                    partial=True,
                    errors=[
                        ConnectorError(
                            source=self.source,
                            code=exc.code,
                            message=exc.message,
                            retryable=exc.retryable,
                            detail=exc.detail,
                        )
                    ],
                )

        if not self.access_token:
            return FetchResult(
                partial=True,
                errors=[
                    ConnectorError(
                        source=self.source,
                        code="missing_token",
                        message="GMAIL_ACCESS_TOKEN이 비어 있어 수집을 건너뜁니다.",
                        retryable=False,
                    )
                ],
            )

        request_limit = min(max(int(limit or 1), 1), 500)
        cursor_payload = cursor if isinstance(cursor, dict) else {}
        params: Dict[str, Any] = {
            "maxResults": request_limit,
            "includeSpamTrash": "true" if self.include_spam_trash else "false",
        }
        if self.label_ids:
            params["labelIds"] = list(self.label_ids)

        page_token = str(cursor_payload.get("page_token", "")).strip()
        if page_token:
            params["pageToken"] = page_token

        query_parts: List[str] = []
        if not page_token:
            last_epoch = cursor_payload.get("last_received_epoch")
            if isinstance(last_epoch, (int, float)) and int(last_epoch) > 0:
                query_parts.append(f"after:{int(last_epoch)}")
            elif self.initial_after_epoch and self.initial_after_epoch > 0:
                query_parts.append(f"after:{self.initial_after_epoch}")
        if self.query_filter:
            query_parts.append(self.query_filter)
        if query_parts:
            params["q"] = " ".join(query_parts).strip()

        listing = self._request_with_auth_retry(
            method="GET",
            path="/messages",
            query=params,
        )

        message_rows = listing.get("messages") if isinstance(listing, dict) else []
        if not isinstance(message_rows, list):
            message_rows = []

        events: List[EmailEvent] = []
        max_received_epoch = int(cursor_payload.get("last_received_epoch") or 0)

        for row in message_rows:
            if not isinstance(row, dict):
                continue
            message_id = str(row.get("id", "")).strip()
            if not message_id:
                continue
            message = self._request_with_auth_retry(
                method="GET",
                path=f"/messages/{message_id}",
                query={"format": "full"},
            )
            event, received_epoch = self._message_to_event(message)
            max_received_epoch = max(max_received_epoch, received_epoch)
            events.append(event)

        next_cursor: Dict[str, Any] = {
            "last_received_epoch": max_received_epoch,
        }
        next_page = str(listing.get("nextPageToken", "") if isinstance(listing, dict) else "").strip()
        if next_page:
            next_cursor["page_token"] = next_page

        if isinstance(listing, dict) and listing.get("historyId"):
            next_cursor["history_id"] = str(listing.get("historyId"))

        return FetchResult(events=events, next_cursor=next_cursor, partial=False, errors=[])

    def _request_with_auth_retry(
        self,
        *,
        method: str,
        path: str,
        query: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        try:
            return self._request_json(method=method, path=path, query=query, body=body)
        except ConnectorExecutionError as exc:
            if exc.code != "http_401":
                raise
            refreshed = self._refresh_access_token(force=True)
            if not refreshed:
                raise
            return self._request_json(method=method, path=path, query=query, body=body)

    def _oauth_token_json(
        self,
        *,
        token_uri: str,
        refresh_token: str,
        client_id: str,
        client_secret: str,
        timeout_sec: int,
    ) -> Dict[str, Any]:
        payload = urllib.parse.urlencode(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            }
        ).encode("utf-8")
        req = urllib.request.Request(url=token_uri, data=payload, method="POST")
        req.add_header("Accept", "application/json")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")

        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                text = resp.read().decode("utf-8")
                row = json.loads(text) if text.strip() else {}
                if isinstance(row, dict):
                    return row
                return {}
        except urllib.error.HTTPError as exc:
            status = int(getattr(exc, "code", 0) or 0)
            detail: Dict[str, Any] = {"status": status}
            try:
                detail["body"] = exc.read().decode("utf-8")
            except Exception:
                pass
            raise ConnectorExecutionError(
                code=f"token_http_{status}",
                message=f"gmail oauth token refresh 실패 ({status})",
                retryable=status in {429, 500, 502, 503, 504},
                detail=detail,
            )
        except urllib.error.URLError as exc:
            raise ConnectorExecutionError(
                code="token_url_error",
                message=f"gmail oauth token refresh 네트워크 오류: {exc}",
                retryable=True,
                detail={"reason": str(exc)},
            )

    def _can_refresh(self) -> bool:
        return bool(self.refresh_token and self.client_id and self.client_secret)

    def _refresh_access_token(self, *, force: bool) -> bool:
        if not self._can_refresh():
            return False

        now_ts = time.time()
        expires_at = self.access_token_expires_at
        needs_refresh = force or not self.access_token
        if not needs_refresh and expires_at is not None:
            needs_refresh = now_ts >= (expires_at - float(self.token_refresh_margin_sec))
        if not needs_refresh:
            return False

        row = self._token_request_json(
            token_uri=self.token_uri,
            refresh_token=self.refresh_token,
            client_id=self.client_id,
            client_secret=self.client_secret,
            timeout_sec=self.timeout_sec,
        )
        if not isinstance(row, dict):
            raise ConnectorExecutionError(
                code="token_response_invalid",
                message="gmail oauth token refresh 응답이 비정상입니다.",
                retryable=False,
            )

        next_access_token = str(row.get("access_token", "")).strip()
        if not next_access_token:
            raise ConnectorExecutionError(
                code="token_response_invalid",
                message="gmail oauth token refresh 응답에 access_token이 없습니다.",
                retryable=False,
                detail={"keys": sorted(row.keys())},
            )

        self.access_token = next_access_token
        next_refresh = str(row.get("refresh_token", "")).strip()
        if next_refresh:
            self.refresh_token = next_refresh
        expires_in = int(row.get("expires_in") or 3600)
        self.access_token_expires_at = now_ts + max(expires_in, 60)
        self._persist_token_file(row)
        return True

    def _persist_token_file(self, response: Dict[str, Any]) -> None:
        if not self.token_store_path:
            return
        try:
            existing: Dict[str, Any] = {}
            if self.token_store_path.exists():
                raw = self.token_store_path.read_text(encoding="utf-8").strip()
                if raw:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        existing = parsed
            out = dict(existing)
            out.update(
                {
                    "access_token": self.access_token,
                    "refresh_token": self.refresh_token,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "token_uri": self.token_uri,
                    "expires_at": self.access_token_expires_at,
                    "updated_at": _now_iso(),
                }
            )
            if isinstance(response.get("scope"), str):
                out["scope"] = response.get("scope")
            if isinstance(response.get("token_type"), str):
                out["token_type"] = response.get("token_type")
            self.token_store_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.token_store_path.with_suffix(self.token_store_path.suffix + ".tmp")
            tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            tmp.replace(self.token_store_path)
        except Exception:
            # 토큰 파일 기록 실패는 수집 자체를 실패로 보지 않는다.
            return

    def _api_json(
        self,
        *,
        method: str,
        path: str,
        query: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        base_url = f"https://gmail.googleapis.com/gmail/v1/users/{urllib.parse.quote(self.user_id)}"
        query_payload = query or {}
        query_filtered: Dict[str, Any] = {}
        for key, value in query_payload.items():
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            query_filtered[key] = value
        query_string = urllib.parse.urlencode(query_filtered, doseq=True)
        url = f"{base_url}{path}"
        if query_string:
            url = f"{url}?{query_string}"

        raw_body = None
        if body is not None:
            raw_body = json.dumps(body, ensure_ascii=False).encode("utf-8")

        req = urllib.request.Request(url=url, data=raw_body, method=method.upper())
        req.add_header("Authorization", f"Bearer {self.access_token}")
        req.add_header("Accept", "application/json")
        if raw_body is not None:
            req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                payload = resp.read().decode("utf-8")
                if not payload.strip():
                    return {}
                row = json.loads(payload)
                if isinstance(row, dict):
                    return row
                return {}
        except urllib.error.HTTPError as exc:
            status = int(getattr(exc, "code", 0) or 0)
            retryable = status in {429, 500, 502, 503, 504}
            detail: Dict[str, Any] = {"status": status}
            try:
                body_text = exc.read().decode("utf-8")
                detail["body"] = body_text
            except Exception:
                pass
            raise ConnectorExecutionError(
                code=f"http_{status}",
                message=f"gmail api 호출 실패 ({status})",
                retryable=retryable,
                detail=detail,
            )
        except urllib.error.URLError as exc:
            raise ConnectorExecutionError(
                code="url_error",
                message=f"gmail api 네트워크 오류: {exc}",
                retryable=True,
                detail={"reason": str(exc)},
            )

    def _message_to_event(self, message: Dict[str, Any]) -> Tuple[EmailEvent, int]:
        payload = message.get("payload") if isinstance(message, dict) else {}
        if not isinstance(payload, dict):
            payload = {}
        headers = _header_map(payload)

        message_id = str(message.get("id", "")).strip()
        thread_id = str(message.get("threadId", "")).strip() or None
        internal_ms = int(message.get("internalDate") or 0)
        received_epoch = internal_ms // 1000 if internal_ms > 0 else int(datetime.now(timezone.utc).timestamp())
        received_at = datetime.fromtimestamp(received_epoch, tz=timezone.utc).isoformat(timespec="seconds")

        body_text, body_html, attachments = self._extract_payload_data(payload, message_id)

        event_id_source = f"gmail:{message_id}:{received_epoch}"
        event_id = hashlib.sha256(event_id_source.encode("utf-8")).hexdigest()[:16]

        event = EmailEvent(
            event_id=event_id,
            source=self.source,
            provider_message_id=message_id,
            thread_id=thread_id,
            subject=headers.get("subject", ""),
            from_addrs=_parse_address_list(headers.get("from", "")),
            to_addrs=_parse_address_list(headers.get("to", "")),
            cc_addrs=_parse_address_list(headers.get("cc", "")),
            received_at=received_at,
            body_text=body_text,
            body_html=body_html,
            attachments=attachments,
            raw=message,
            metadata={
                "history_id": str(message.get("historyId", "")),
                "snippet": str(message.get("snippet", "")),
            },
        )
        return event, received_epoch

    def _extract_payload_data(self, payload: Dict[str, Any], message_id: str) -> Tuple[Optional[str], Optional[str], List[Attachment]]:
        text_chunks: List[str] = []
        html_chunks: List[str] = []
        attachments: List[Attachment] = []

        def walk(node: Dict[str, Any]) -> None:
            mime = str(node.get("mimeType", "")).strip().lower()
            filename = str(node.get("filename", "")).strip()
            body = node.get("body") if isinstance(node.get("body"), dict) else {}
            parts = node.get("parts") if isinstance(node.get("parts"), list) else []

            raw_data = str(body.get("data", "") or "")
            if raw_data and mime in {"text/plain", "text/html"}:
                decoded = _safe_decode_base64url(raw_data).decode("utf-8", errors="replace")
                if mime == "text/plain":
                    text_chunks.append(decoded)
                else:
                    html_chunks.append(decoded)

            attachment_id = str(body.get("attachmentId", "") or "").strip() or None
            size = int(body.get("size") or 0)
            has_binary = bool(filename) and (attachment_id or raw_data)
            if has_binary:
                normalized_name = _sanitize_filename(filename)
                ext = _file_extension(normalized_name)
                is_blocked_ext = bool(ext and ext in self.blocked_attachment_extensions)
                item = Attachment(
                    type="binary_attachment",
                    name=normalized_name,
                    mime=mime or None,
                    size=size,
                    url=None,
                    provider_attachment_id=attachment_id,
                    metadata={
                        "gmail_message_id": message_id,
                        "blocked_extension": ext if is_blocked_ext else None,
                    },
                )
                if is_blocked_ext:
                    item.type = "reference_attachment"
                    item.url = f"https://mail.google.com/mail/u/0/#all/{message_id}"
                elif size > self.attachment_max_bytes:
                    item.type = "reference_attachment"
                    item.url = f"https://mail.google.com/mail/u/0/#all/{message_id}"
                elif self.download_attachments:
                    binary = b""
                    if attachment_id:
                        binary = self._download_attachment(message_id=message_id, attachment_id=attachment_id)
                    elif raw_data:
                        binary = _safe_decode_base64url(raw_data)
                    if binary:
                        sha256 = hashlib.sha256(binary).hexdigest()
                        item.content_sha256 = sha256
                        if self.attachment_root:
                            item.local_path = str(self._write_attachment(message_id, item.name or "attachment", binary))
                attachments.append(item)

            for part in parts:
                if isinstance(part, dict):
                    walk(part)

        walk(payload)
        text = "\n".join(chunk for chunk in text_chunks if chunk).strip() or None
        html = "\n".join(chunk for chunk in html_chunks if chunk).strip() or None
        return text, html, attachments

    def _download_attachment(self, *, message_id: str, attachment_id: str) -> bytes:
        payload = self._request_with_auth_retry(
            method="GET",
            path=f"/messages/{message_id}/attachments/{attachment_id}",
        )
        data = str(payload.get("data", "") if isinstance(payload, dict) else "")
        return _safe_decode_base64url(data)

    def _write_attachment(self, message_id: str, filename: str, blob: bytes) -> Path:
        if not self.attachment_root:
            raise ConnectorExecutionError(
                code="missing_attachment_root",
                message="attachment_root가 설정되지 않았습니다.",
                retryable=False,
            )
        target_dir = self.attachment_root / "gmail" / message_id
        target_dir.mkdir(parents=True, exist_ok=True)
        base = _sanitize_filename(filename)
        target = target_dir / base
        if target.exists():
            stem = target.stem
            suffix = target.suffix
            idx = 2
            while True:
                candidate = target_dir / f"{stem}_{idx}{suffix}"
                if not candidate.exists():
                    target = candidate
                    break
                idx += 1
        target.write_bytes(blob)
        return target
