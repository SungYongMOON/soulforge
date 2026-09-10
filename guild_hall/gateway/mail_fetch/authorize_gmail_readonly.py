#!/usr/bin/env python3
"""Mint a read-only Gmail refresh token for the mailbox collector.

The forwarder (`guild_hall/gateway/mail_send/gmail_original_importer.py`) authorizes with
`gmail.insert` only, which cannot read a mailbox. Collecting the Gmail SENT label needs
`gmail.readonly`, so this tool runs the same desktop OAuth flow with the read scope and
writes a collector credential env file.

The Owner runs this interactively; a browser consent window is required. Values are never
printed: the tool reports status, the authorized account, and the granted scopes only.

Usage
  python authorize_gmail_readonly.py \
      --oauth-client "<private>/gmail_original_importer/oauth_client.json" \
      --account seabot.moon@gmail.com \
      --out-env "<private>/guild_hall/state/gateway/mailbox/state/acct_owner_gmail_sent.env"

Add --force to overwrite an existing credential file.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import os
import secrets
import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
OIDC_SCOPES = ("openid", "email")


class AuthorizeError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _http_json(request: Request, opener: Callable[..., Any] = urlopen) -> dict[str, Any]:
    with opener(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def _token_request(form: dict[str, str], opener: Callable[..., Any] = urlopen) -> dict[str, Any]:
    request = Request(
        TOKEN_ENDPOINT,
        data=urlencode(form).encode("ascii"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    return _http_json(request, opener=opener)


def load_installed_client(path: Path) -> dict[str, str]:
    """Read a Google *desktop* OAuth client JSON. Returns id/secret without printing them."""
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        installed = document["installed"]
        client_id = str(installed["client_id"]).strip()
        client_secret = str(installed["client_secret"]).strip()
        token_uri = str(installed.get("token_uri") or TOKEN_ENDPOINT).strip()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise AuthorizeError("oauth_client_invalid") from exc
    if not client_id or not client_secret or token_uri != TOKEN_ENDPOINT:
        raise AuthorizeError("oauth_client_invalid")
    return {"client_id": client_id, "client_secret": client_secret}


class _OAuthCallback(http.server.BaseHTTPRequestHandler):
    result: dict[str, str] = {}

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        values = parse_qs(urlparse(self.path).query)
        self.__class__.result = {key: items[0] for key, items in values.items() if items}
        body = "Google 승인이 접수되었습니다. 이 창을 닫아도 됩니다.".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: Any) -> None:  # silence the default stderr access log
        return


def authorize(
    client: dict[str, str],
    expected_account: str,
    *,
    browser_open: Callable[[str], Any] = webbrowser.open,
    opener: Callable[..., Any] = urlopen,
    wait_seconds: int = 900,
) -> dict[str, Any]:
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    _OAuthCallback.result = {}
    server = http.server.HTTPServer(("127.0.0.1", 0), _OAuthCallback)
    redirect_uri = f"http://127.0.0.1:{server.server_port}"
    params = {
        "client_id": client["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join((*OIDC_SCOPES, GMAIL_READONLY_SCOPE)),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "login_hint": expected_account,
    }
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    url = f"{AUTH_ENDPOINT}?{urlencode(params)}"
    print("브라우저에서 Google 동의 화면을 엽니다. 열리지 않으면 아래 주소를 직접 여세요:")
    print(f"  {url}")
    browser_open(url)
    deadline = time.monotonic() + wait_seconds
    while thread.is_alive() and time.monotonic() < deadline:
        thread.join(timeout=0.2)
    timed_out = thread.is_alive()
    server.server_close()
    if timed_out:
        raise AuthorizeError("oauth_callback_timeout")

    result = _OAuthCallback.result
    if result.get("error"):
        raise AuthorizeError("oauth_consent_denied")
    if result.get("state") != state or not result.get("code"):
        raise AuthorizeError("oauth_callback_invalid")

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
        raise AuthorizeError("oauth_token_incomplete")

    granted = str(token.get("scope", ""))
    if GMAIL_READONLY_SCOPE not in granted.split():
        raise AuthorizeError("oauth_readonly_scope_not_granted")

    userinfo = _http_json(
        Request(USERINFO_ENDPOINT, headers={"Authorization": f"Bearer {token['access_token']}"}),
        opener=opener,
    )
    email = str(userinfo.get("email", "")).strip().lower()
    if email != expected_account.strip().lower():
        raise AuthorizeError("oauth_account_mismatch")

    return {"account": email, "scope": granted, "refresh_token": token["refresh_token"]}


def write_credential_env(
    out_path: Path,
    client: dict[str, str],
    refresh_token: str,
    *,
    label_ids: str,
    workspace: str,
    force: bool,
) -> None:
    if out_path.exists() and not force:
        raise AuthorizeError("credential_file_exists")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Soulforge mailbox collector credential — Gmail read-only.",
        "# Written by authorize_gmail_readonly.py. Do not commit. Do not print.",
        f"GMAIL_CLIENT_ID={client['client_id']}",
        f"GMAIL_CLIENT_SECRET={client['client_secret']}",
        f"GMAIL_REFRESH_TOKEN={refresh_token}",
        f"GMAIL_TOKEN_URI={TOKEN_ENDPOINT}",
        "GMAIL_USER_ID=me",
        f"EMAIL_FETCH_GMAIL_LABEL_IDS={label_ids}",
        f"EMAIL_FETCH_WORKSPACE_GMAIL={workspace}",
        "EMAIL_FETCH_GMAIL_INCLUDE_SPAM_TRASH=false",
        "",
    ]
    temp = out_path.with_suffix(out_path.suffix + ".tmp")
    temp.write_text("\n".join(lines), encoding="utf-8")
    os.replace(temp, out_path)
    _restrict_acl(out_path)


def _restrict_acl(path: Path) -> None:
    """Best-effort: make the credential readable only by the current user (Windows)."""
    if os.name != "nt":
        try:
            os.chmod(path, 0o600)
        except OSError:
            print("경고: 파일 권한을 제한하지 못했습니다. 수동으로 확인하세요.", file=sys.stderr)
        return
    import subprocess  # noqa: PLC0415 - only needed on Windows

    user = os.environ.get("USERNAME", "")
    if not user:
        print("경고: USERNAME 을 읽지 못해 ACL 을 제한하지 않았습니다.", file=sys.stderr)
        return
    try:
        subprocess.run(
            ["icacls", str(path), "/inheritance:r", "/grant:r", f"{user}:(R,W)"],
            check=True, capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError):
        print("경고: ACL 제한에 실패했습니다. 파일 권한을 수동으로 확인하세요.", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Authorize read-only Gmail access for the mailbox collector.",
    )
    parser.add_argument("--oauth-client", required=True, help="Desktop OAuth client JSON path.")
    parser.add_argument("--account", required=True, help="Exact Gmail address that must consent.")
    parser.add_argument("--out-env", required=True, help="Credential env file to write.")
    parser.add_argument("--label-ids", default="SENT", help="Gmail label IDs to collect (default: SENT).")
    parser.add_argument("--workspace", default="personal", help="Ingress workspace (default: personal).")
    parser.add_argument("--wait-seconds", type=int, default=900, help="Consent wait time (default: 900).")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing credential file.")
    parser.add_argument("--json", action="store_true", help="Print a sanitized JSON result.")
    args = parser.parse_args()

    try:
        client = load_installed_client(Path(args.oauth_client).expanduser())
        granted = authorize(
            client,
            args.account,
            wait_seconds=max(int(args.wait_seconds), 30),
        )
        out_path = Path(args.out_env).expanduser()
        write_credential_env(
            out_path,
            client,
            granted["refresh_token"],
            label_ids=args.label_ids,
            workspace=args.workspace,
            force=bool(args.force),
        )
    except AuthorizeError as exc:
        payload = {"status": "failed", "code": exc.code}
        print(json.dumps(payload, ensure_ascii=False) if args.json else f"실패: {exc.code}", file=sys.stderr)
        return 2

    payload = {
        "status": "authorized",
        "account": granted["account"],
        "granted_scopes": granted["scope"].split(),
        "credential_written": str(out_path),
        "label_ids": args.label_ids,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("승인 완료")
        print(f"  계정      : {payload['account']}")
        print(f"  받은 권한 : {' '.join(payload['granted_scopes'])}")
        print(f"  자격 파일 : {payload['credential_written']}")
        print(f"  수집 라벨 : {payload['label_ids']}")
        print("\n이제 담당자에게 '자격 놓았다'고 알리면 등록부에 칸을 추가합니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
