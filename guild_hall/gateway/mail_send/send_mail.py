#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
import hashlib
import json
import os
from pathlib import Path
import smtplib
import ssl
import sys
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _default_env_file(repo_root: Path) -> Path:
    return repo_root / "guild_hall" / "state" / "gateway" / "mailbox" / "state" / "mail_send.env"


def _parse_env_file(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def _load_env(path: Path) -> dict[str, str]:
    env = _parse_env_file(path)
    env.update(os.environ)
    return env


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None or str(value).strip() == "":
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _resolve_secret(env: dict[str, str], direct_key: str, file_key: str, base_dir: Path) -> str:
    direct = str(env.get(direct_key, "")).strip()
    if direct:
        return direct
    file_value = str(env.get(file_key, "")).strip()
    if not file_value:
        return ""
    path = Path(file_value).expanduser()
    if not path.is_absolute():
        path = base_dir / path
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


def _read_text(value: str, path_value: str) -> str:
    if path_value:
        return Path(path_value).expanduser().read_text(encoding="utf-8").strip()
    return value.strip()


def _split_recipients(value: str) -> list[str]:
    return [item.strip() for item in value.replace(";", ",").split(",") if item.strip()]


def _now_kst() -> datetime:
    return datetime.now().astimezone()


def _relative(path: Path, repo_root: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return path.as_posix()


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send a Soulforge outbound email through local SMTP env.")
    parser.add_argument("--env-file", default="", help="Local mail_send.env path.")
    parser.add_argument("--to", required=True, help="Comma-separated recipients.")
    parser.add_argument("--cc", default="", help="Comma-separated CC recipients.")
    parser.add_argument("--bcc", default="", help="Comma-separated BCC recipients.")
    parser.add_argument("--subject", required=True, help="Email subject.")
    parser.add_argument("--body-text", default="", help="Plain-text email body.")
    parser.add_argument("--body-text-file", default="", help="UTF-8 text file for the plain-text body.")
    parser.add_argument("--body-html", default="", help="HTML email body.")
    parser.add_argument("--body-html-file", default="", help="UTF-8 HTML file for the HTML body.")
    parser.add_argument("--approved-by", default="manual_owner", help="Approval metadata for the local ledger.")
    parser.add_argument("--source-ref", default="", help="Optional source reference for the local ledger.")
    parser.add_argument("--dry-run", action="store_true", help="Compose and validate without sending or writing ledger files.")
    parser.add_argument("--json", action="store_true", help="Print JSON result.")
    return parser.parse_args()


def _build_message(
    *,
    sender: str,
    to: list[str],
    cc: list[str],
    bcc: list[str],
    subject: str,
    body_text: str,
    body_html: str,
    message_id: str,
) -> EmailMessage:
    if not body_text and not body_html:
        raise SystemExit("body text or html is required")
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = message_id
    plain = body_text or "HTML report is included in the rich email body."
    msg.set_content(plain)
    if body_html:
        msg.add_alternative(body_html, subtype="html")
    return msg


def _send(env: dict[str, str], env_file: Path, msg: EmailMessage, recipients: list[str]) -> None:
    provider = str(env.get("EMAIL_SEND_PROVIDER", "hiworks")).strip().lower()
    if provider != "hiworks":
        raise SystemExit(f"unsupported EMAIL_SEND_PROVIDER: {provider}")
    if not _bool(env.get("EMAIL_SEND_ENABLED"), default=False):
        raise SystemExit("EMAIL_SEND_ENABLED is not true")

    host = str(env.get("HIWORKS_SMTP_HOST", "")).strip()
    port = int(str(env.get("HIWORKS_SMTP_PORT", "465") or "465"))
    username = str(env.get("HIWORKS_SMTP_USERNAME", "")).strip()
    password = _resolve_secret(env, "HIWORKS_SMTP_PASSWORD", "HIWORKS_SMTP_PASSWORD_FILE", env_file.parent)
    use_ssl = _bool(env.get("HIWORKS_SMTP_USE_SSL"), default=False)
    use_starttls = _bool(env.get("HIWORKS_SMTP_USE_STARTTLS"), default=False)
    if not host or not username or not password:
        raise SystemExit("missing host/username/password")

    if use_ssl:
        client: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        client = smtplib.SMTP(host, port, timeout=20)
        client.ehlo()
        if use_starttls:
            client.starttls(context=ssl.create_default_context())
            client.ehlo()
    try:
        client.login(username, password)
        client.send_message(msg, to_addrs=recipients)
    finally:
        try:
            client.quit()
        except Exception:
            pass


def main() -> int:
    repo_root = _repo_root()
    args = _parse_args()
    env_file = Path(args.env_file).expanduser() if args.env_file else _default_env_file(repo_root)
    env = _load_env(env_file)

    to = _split_recipients(args.to)
    cc = _split_recipients(args.cc)
    bcc = _split_recipients(args.bcc)
    recipients = to + cc + bcc
    if not to:
        raise SystemExit("--to is required")

    sender = str(env.get("HIWORKS_SMTP_FROM") or env.get("HIWORKS_SMTP_USERNAME") or "").strip()
    if not sender:
        raise SystemExit("missing sender")

    body_text = _read_text(args.body_text, args.body_text_file)
    body_html = _read_text(args.body_html, args.body_html_file)
    now = _now_kst()
    send_id = "mail_send_" + now.strftime("%Y%m%dT%H%M%S%z") + "_" + hashlib.sha256(
        f"{args.subject}|{','.join(to)}|{now.isoformat()}".encode("utf-8")
    ).hexdigest()[:10]
    message_id = make_msgid(idstring=send_id)
    msg = _build_message(
        sender=sender,
        to=to,
        cc=cc,
        bcc=bcc,
        subject=args.subject,
        body_text=body_text,
        body_html=body_html,
        message_id=message_id,
    )

    status = "dry_run" if args.dry_run else "sent"
    error = ""
    if not args.dry_run:
        try:
            _send(env, env_file, msg, recipients)
        except Exception as exc:  # noqa: BLE001
            status = "failed"
            error = str(exc)

    outbound_dir = repo_root / "guild_hall" / "state" / "gateway" / "mailbox" / "outbound" / now.strftime("%Y") / now.strftime("%Y-%m")
    snapshot_path = outbound_dir / f"{send_id}.json"
    log_path = repo_root / "guild_hall" / "state" / "gateway" / "log" / "mail_send" / now.strftime("%Y") / f"{now.strftime('%Y-%m')}.jsonl"
    snapshot_ref = _relative(snapshot_path, repo_root)

    snapshot = {
        "send_id": send_id,
        "provider": str(env.get("EMAIL_SEND_PROVIDER", "hiworks")).strip() or "hiworks",
        "provider_message_id": message_id,
        "status": status,
        "result": status,
        "generated_by": "guild_hall/gateway/mail_send",
        "approved_by": args.approved_by,
        "approved_at": now.isoformat(),
        "sent_at": None if args.dry_run or status != "sent" else now.isoformat(),
        "retry_of": None,
        "mission_ref": None,
        "monster_ref": None,
        "from": sender,
        "to": to,
        "cc": cc,
        "bcc": bcc,
        "recipient_summary": {"to_count": len(to), "cc_count": len(cc), "bcc_count": len(bcc)},
        "subject": args.subject,
        "subject_fingerprint": "sha256:" + hashlib.sha256(args.subject.encode("utf-8")).hexdigest(),
        "body_text": body_text,
        "body_html_present": bool(body_html),
        "attachment_refs": [],
        "source_ref": args.source_ref or None,
        "error": error or None,
    }
    log_row = {
        "event_type": "mail_sent" if status == "sent" else "mail_send_failed" if status == "failed" else "mail_send_dry_run",
        "at": now.isoformat(),
        "send_id": send_id,
        "provider": snapshot["provider"],
        "provider_message_id": message_id,
        "status": status,
        "result": status,
        "snapshot_ref": snapshot_ref,
        "generated_by": "guild_hall/gateway/mail_send",
        "approved_by": args.approved_by,
        "from": sender,
        "to_count": len(to),
        "attachment_count": 0,
        "retry_of": None,
        "error": error or None,
    }

    if not args.dry_run:
        _write_json(snapshot_path, snapshot)
        _append_jsonl(log_path, log_row)

    result = {
        "ok": status == "sent" or args.dry_run,
        "status": status,
        "send_id": send_id,
        "provider_message_id": message_id,
        "snapshot_ref": None if args.dry_run else snapshot_ref,
        "html": bool(body_html),
        "error": error or None,
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"status={status} send_id={send_id} html={bool(body_html)}")
        if error:
            print(f"error={error}", file=sys.stderr)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
