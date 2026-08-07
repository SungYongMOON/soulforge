#!/usr/bin/env python3
"""Import original RFC 822 messages into the owner's Gmail.

Interactive imports require an exact preview-derived approval token. The
continuous Hiworks collector can call the bounded raw-message entrypoint after
the owner has approved that route. OAuth material and receipts stay only in
owner-provided private directories.
"""
from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
import hashlib
import http.server
import json
import os
from pathlib import Path
import secrets
import stat
import sys
import threading
import time
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
import webbrowser


EXPECTED_GMAIL_ACCOUNT = "seabot.moon@gmail.com"
GMAIL_INSERT_SCOPE = "https://www.googleapis.com/auth/gmail.insert"
OIDC_SCOPES = ("openid", "email")
AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
IMPORT_ENDPOINT = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/import"
MAX_IMPORT_BYTES = 150 * 1024 * 1024


class ImporterError(RuntimeError):
    """A bounded, user-safe importer failure."""


@dataclass(frozen=True)
class SourcePreview:
    path: Path | None
    size: int
    sha256: str
    approval_token: str
    from_header: str
    to_header: str
    cc_header: str
    date_header: str
    message_id: str
    subject: str


def _json_bytes(response: Any) -> dict[str, Any]:
    payload = response.read()
    result = json.loads(payload.decode("utf-8"))
    if not isinstance(result, dict):
        raise ImporterError("json_response_invalid")
    return result


def _http_json(
    request: Request,
    *,
    opener: Callable[..., Any] = urlopen,
    timeout: int = 30,
) -> dict[str, Any]:
    try:
        with opener(request, timeout=timeout) as response:
            return _json_bytes(response)
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8"))
            reason = str(detail.get("error", {}).get("status") or detail.get("error", "http_error"))
        except Exception:
            reason = "http_error"
        raise ImporterError(f"google_api_{exc.code}_{reason}") from exc
    except URLError as exc:
        raise ImporterError("google_api_unreachable") from exc


def _ensure_bounded_file(path: Path, root: Path, suffix: str | tuple[str, ...]) -> Path:
    absolute_root = Path(os.path.abspath(root))
    absolute = Path(os.path.abspath(path))
    try:
        relative = absolute.relative_to(absolute_root)
    except ValueError as exc:
        raise ImporterError("path_outside_allowed_root") from exc
    current = absolute_root
    for part in relative.parts:
        current = current / part
        try:
            metadata = os.lstat(current)
        except OSError as exc:
            raise ImporterError("file_missing_or_unsafe") from exc
        attributes = int(getattr(metadata, "st_file_attributes", 0))
        if stat.S_ISLNK(metadata.st_mode) or attributes & int(getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)):
            raise ImporterError("file_reparse_not_allowed")
    resolved_root = absolute_root.resolve()
    resolved = absolute.resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise ImporterError("path_outside_allowed_root") from exc
    if not resolved.is_file():
        raise ImporterError("file_missing_or_unsafe")
    allowed_suffixes = (suffix,) if isinstance(suffix, str) else suffix
    if resolved.suffix.lower() not in allowed_suffixes:
        raise ImporterError("file_type_not_allowed")
    return resolved


def inspect_raw_message(raw: bytes, *, source_path: Path | None = None) -> SourcePreview:
    if not raw or len(raw) > MAX_IMPORT_BYTES:
        raise ImporterError("message_size_not_allowed")
    message = BytesParser(policy=policy.default).parsebytes(raw)
    date_header = str(message.get("Date", "")).strip()
    if not date_header:
        raise ImporterError("message_date_missing")
    try:
        parsedate_to_datetime(date_header)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ImporterError("message_date_invalid") from exc
    digest = hashlib.sha256(raw).hexdigest()
    return SourcePreview(
        path=source_path,
        size=len(raw),
        sha256=digest,
        approval_token=digest[:16],
        from_header=str(message.get("From", "")).strip(),
        to_header=str(message.get("To", "")).strip(),
        cc_header=str(message.get("Cc", "")).strip(),
        date_header=date_header,
        message_id=str(message.get("Message-ID", "")).strip(),
        subject=str(message.get("Subject", "")).strip() or "(제목 없음)",
    )


def inspect_source(eml_path: Path, custody_root: Path) -> SourcePreview:
    source = _ensure_bounded_file(eml_path, custody_root, ".eml")
    return inspect_raw_message(source.read_bytes(), source_path=source)


def preview_document(preview: SourcePreview) -> dict[str, Any]:
    return {
        "status": "approval_required",
        "target_account": EXPECTED_GMAIL_ACCOUNT,
        "from": preview.from_header,
        "to": preview.to_header,
        "cc": preview.cc_header,
        "date": preview.date_header,
        "message_id": preview.message_id,
        "subject": preview.subject,
        "message_bytes": preview.size,
        "approval_token": preview.approval_token,
        "gmail_internal_date_source": "dateHeader",
    }


def _parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _load_installed_client(
    path: Path | None,
    env_path: Path | None,
    config_root: Path,
) -> dict[str, str]:
    if bool(path) == bool(env_path):
        raise ImporterError("exactly_one_oauth_client_source_required")
    if env_path is not None:
        client_env_path = _ensure_bounded_file(env_path, config_root, ".env")
        env = _parse_env(client_env_path)
        client_id = str(env.get("GMAIL_CLIENT_ID", "")).strip()
        client_secret = str(env.get("GMAIL_CLIENT_SECRET", "")).strip()
        token_uri = str(env.get("GMAIL_TOKEN_URI") or TOKEN_ENDPOINT).strip()
        if not client_id or not client_secret or token_uri != TOKEN_ENDPOINT:
            raise ImporterError("oauth_client_invalid")
        return {"client_id": client_id, "client_secret": client_secret, "token_uri": token_uri}
    assert path is not None
    client_path = _ensure_bounded_file(path, config_root, ".json")
    try:
        document = json.loads(client_path.read_text(encoding="utf-8"))
        installed = document["installed"]
        client_id = str(installed["client_id"]).strip()
        client_secret = str(installed["client_secret"]).strip()
        token_uri = str(installed.get("token_uri") or TOKEN_ENDPOINT).strip()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ImporterError("oauth_client_invalid") from exc
    if not client_id or not client_secret or token_uri != TOKEN_ENDPOINT:
        raise ImporterError("oauth_client_invalid")
    return {"client_id": client_id, "client_secret": client_secret, "token_uri": token_uri}


def _write_private_json(path: Path, payload: dict[str, Any], config_root: Path) -> None:
    resolved_root = config_root.resolve()
    resolved = path.resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise ImporterError("private_state_outside_config_root") from exc
    resolved.parent.mkdir(parents=True, exist_ok=True)
    temp = resolved.with_suffix(resolved.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, resolved)


def _token_request(form: dict[str, str], opener: Callable[..., Any] = urlopen) -> dict[str, Any]:
    request = Request(
        TOKEN_ENDPOINT,
        data=urlencode(form).encode("ascii"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    return _http_json(request, opener=opener)


class _OAuthCallback(http.server.BaseHTTPRequestHandler):
    result: dict[str, str] = {}

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        values = parse_qs(urlparse(self.path).query)
        self.__class__.result = {key: items[0] for key, items in values.items() if items}
        body = "Google 승인이 접수되었습니다. 이 창을 닫고 Codex로 돌아가세요.".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: Any) -> None:
        return None


def authorize(
    client_path: Path | None,
    client_env_path: Path | None,
    token_path: Path,
    config_root: Path,
    *,
    browser_open: Callable[[str], Any] = webbrowser.open,
    opener: Callable[..., Any] = urlopen,
    wait_seconds: int = 180,
) -> dict[str, Any]:
    client = _load_installed_client(client_path, client_env_path, config_root)
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).decode("ascii").rstrip("=")
    _OAuthCallback.result = {}
    server = http.server.HTTPServer(("127.0.0.1", 0), _OAuthCallback)
    redirect_uri = f"http://127.0.0.1:{server.server_port}"
    params = {
        "client_id": client["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join((*OIDC_SCOPES, GMAIL_INSERT_SCOPE)),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "login_hint": EXPECTED_GMAIL_ACCOUNT,
    }
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    browser_open(f"{AUTH_ENDPOINT}?{urlencode(params)}")
    deadline = time.monotonic() + wait_seconds
    while thread.is_alive() and time.monotonic() < deadline:
        thread.join(timeout=0.2)
    timed_out = thread.is_alive()
    server.server_close()
    if timed_out:
        raise ImporterError("oauth_callback_timeout")
    result = _OAuthCallback.result
    if result.get("state") != state or not result.get("code"):
        raise ImporterError("oauth_callback_invalid")
    token = _token_request(
        {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "code": result["code"],
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
        opener=opener,
    )
    if not token.get("refresh_token") or not token.get("access_token"):
        raise ImporterError("oauth_token_incomplete")
    userinfo = _http_json(
        Request(USERINFO_ENDPOINT, headers={"Authorization": f"Bearer {token['access_token']}"}),
        opener=opener,
    )
    email = str(userinfo.get("email", "")).strip().lower()
    if email != EXPECTED_GMAIL_ACCOUNT:
        raise ImporterError("oauth_account_mismatch")
    stored = {
        "refresh_token": token["refresh_token"],
        "scope": str(token.get("scope", "")),
        "token_type": str(token.get("token_type", "Bearer")),
        "authorized_account": email,
        "created_at_epoch": int(time.time()),
    }
    _write_private_json(token_path, stored, config_root)
    return {"status": "authorized", "account": email, "scope": GMAIL_INSERT_SCOPE}


def _access_token(
    client_path: Path | None,
    client_env_path: Path | None,
    token_path: Path,
    config_root: Path,
    opener: Callable[..., Any] = urlopen,
) -> str:
    client = _load_installed_client(client_path, client_env_path, config_root)
    token_file = _ensure_bounded_file(token_path, config_root, ".json")
    try:
        token = json.loads(token_file.read_text(encoding="utf-8"))
        refresh_token = str(token["refresh_token"]).strip()
        authorized_account = str(token["authorized_account"]).strip().lower()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ImporterError("oauth_token_invalid") from exc
    if authorized_account != EXPECTED_GMAIL_ACCOUNT or not refresh_token:
        raise ImporterError("oauth_account_mismatch")
    response = _token_request(
        {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        opener=opener,
    )
    access_token = str(response.get("access_token", "")).strip()
    if not access_token:
        raise ImporterError("oauth_refresh_failed")
    return access_token


def _receipt_path(receipt_root: Path, digest: str) -> Path:
    return receipt_root.resolve() / f"{digest}.json"


def _multipart_import_payload(raw: bytes, digest: str) -> tuple[bytes, str]:
    boundary = f"soulforge_{digest[:32]}"
    metadata = json.dumps({"labelIds": ["INBOX"]}, separators=(",", ":")).encode("ascii")
    payload = b"".join(
        (
            f"--{boundary}\r\n".encode("ascii"),
            b"Content-Type: application/json; charset=UTF-8\r\n\r\n",
            metadata,
            b"\r\n",
            f"--{boundary}\r\n".encode("ascii"),
            b"Content-Type: message/rfc822\r\n\r\n",
            raw,
            b"\r\n",
            f"--{boundary}--\r\n".encode("ascii"),
        )
    )
    return payload, boundary


def _import_bytes(
    preview: SourcePreview,
    raw: bytes,
    client_path: Path | None,
    client_env_path: Path | None,
    token_path: Path,
    config_root: Path,
    receipt_root: Path,
    *,
    allow_existing: bool,
    opener: Callable[..., Any] = urlopen,
) -> dict[str, Any]:
    if hashlib.sha256(raw).hexdigest() != preview.sha256:
        raise ImporterError("source_changed_after_preview")
    receipt = _receipt_path(receipt_root, preview.sha256)
    if receipt.exists():
        if allow_existing:
            return {
                "status": "already_imported",
                "target_account": EXPECTED_GMAIL_ACCOUNT,
                "subject": preview.subject,
                "date": preview.date_header,
                "message_bytes": preview.size,
                "receipt_written": True,
                "inbox_requested": True,
            }
        raise ImporterError("message_already_imported")
    access_token = _access_token(client_path, client_env_path, token_path, config_root, opener=opener)
    query = urlencode(
        {
            "uploadType": "multipart",
            "internalDateSource": "dateHeader",
            "neverMarkSpam": "true",
            "processForCalendar": "false",
        }
    )
    payload, boundary = _multipart_import_payload(raw, preview.sha256)
    request = Request(
        f"{IMPORT_ENDPOINT}?{query}",
        data=payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f'multipart/related; boundary="{boundary}"',
            "User-Agent": "Soulforge-Gmail-Original-Importer/1.1",
        },
        method="POST",
    )
    response = _http_json(request, opener=opener, timeout=60)
    gmail_id = str(response.get("id", "")).strip()
    if not gmail_id:
        raise ImporterError("gmail_import_response_invalid")
    receipt_payload = {
        "schema_version": 2,
        "target_account": EXPECTED_GMAIL_ACCOUNT,
        "source_sha256": preview.sha256,
        "gmail_message_id_sha256": hashlib.sha256(gmail_id.encode("utf-8")).hexdigest(),
        "imported_at_epoch": int(time.time()),
        "internal_date_source": "dateHeader",
        "requested_labels": ["INBOX"],
    }
    receipt.parent.mkdir(parents=True, exist_ok=True)
    _write_private_json(receipt, receipt_payload, receipt_root)
    return {
        "status": "imported",
        "target_account": EXPECTED_GMAIL_ACCOUNT,
        "subject": preview.subject,
        "date": preview.date_header,
        "message_bytes": preview.size,
        "receipt_written": True,
        "inbox_requested": True,
    }


def import_message(
    preview: SourcePreview,
    approval_token: str,
    client_path: Path | None,
    client_env_path: Path | None,
    token_path: Path,
    config_root: Path,
    receipt_root: Path,
    *,
    opener: Callable[..., Any] = urlopen,
) -> dict[str, Any]:
    if approval_token != preview.approval_token:
        raise ImporterError("approval_token_mismatch")
    if preview.path is None:
        raise ImporterError("source_path_missing")
    return _import_bytes(
        preview,
        preview.path.read_bytes(),
        client_path,
        client_env_path,
        token_path,
        config_root,
        receipt_root,
        allow_existing=False,
        opener=opener,
    )


def import_raw_message(
    raw: bytes,
    client_path: Path | None,
    client_env_path: Path | None,
    token_path: Path,
    config_root: Path,
    receipt_root: Path,
    *,
    allow_existing: bool = True,
    opener: Callable[..., Any] = urlopen,
) -> dict[str, Any]:
    """Import bytes from the approved continuous collector without staging EML."""
    preview = inspect_raw_message(raw)
    return _import_bytes(
        preview,
        raw,
        client_path,
        client_env_path,
        token_path,
        config_root,
        receipt_root,
        allow_existing=allow_existing,
        opener=opener,
    )


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preview, authorize, or import one original EML into Gmail.")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--preview", action="store_true", help="Show exact message metadata and an approval token; writes nothing.")
    action.add_argument("--authorize", action="store_true", help="Authorize the exact Gmail account using a desktop OAuth client.")
    action.add_argument("--apply", action="store_true", help="Import the selected EML after exact approval-token confirmation.")
    parser.add_argument("--eml", help="Exact source-custody EML path for preview/apply.")
    parser.add_argument("--custody-root", help="Allowed root containing the selected EML.")
    parser.add_argument("--config-root", help="Private root containing OAuth client and token JSON files.")
    parser.add_argument("--oauth-client", help="Desktop OAuth client JSON path.")
    parser.add_argument("--oauth-client-env", help="Existing private env containing Gmail OAuth client ID/secret.")
    parser.add_argument("--oauth-token", help="Private refresh-token JSON path.")
    parser.add_argument("--receipt-root", help="Private directory for idempotency receipts.")
    parser.add_argument("--approval-token", help="Exact token emitted by --preview; required by --apply.")
    parser.add_argument("--oauth-wait-seconds", type=int, default=900, help="Authorization callback wait time (default: 900).")
    parser.add_argument("--json", action="store_true", help="Print a sanitized JSON result.")
    return parser.parse_args()


def _required_path(value: str | None, name: str) -> Path:
    if not value:
        raise ImporterError(f"{name}_required")
    return Path(value)


def main() -> int:
    args = _arguments()
    try:
        if args.authorize:
            result = authorize(
                Path(args.oauth_client) if args.oauth_client else None,
                Path(args.oauth_client_env) if args.oauth_client_env else None,
                _required_path(args.oauth_token, "oauth_token"),
                _required_path(args.config_root, "config_root"),
                wait_seconds=max(60, int(args.oauth_wait_seconds)),
            )
        else:
            preview = inspect_source(
                _required_path(args.eml, "eml"),
                _required_path(args.custody_root, "custody_root"),
            )
            if args.preview:
                result = preview_document(preview)
            else:
                result = import_message(
                    preview,
                    str(args.approval_token or ""),
                    Path(args.oauth_client) if args.oauth_client else None,
                    Path(args.oauth_client_env) if args.oauth_client_env else None,
                    _required_path(args.oauth_token, "oauth_token"),
                    _required_path(args.config_root, "config_root"),
                    _required_path(args.receipt_root, "receipt_root"),
                )
        print(json.dumps(result, ensure_ascii=False) if args.json else result["status"])
        return 0
    except Exception as exc:
        error = {"status": "failed", "error": type(exc).__name__, "reason": str(exc)}
        print(json.dumps(error, ensure_ascii=False) if args.json else f"failed: {error['reason']}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
