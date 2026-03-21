from __future__ import annotations

from dataclasses import replace
import fnmatch
from pathlib import Path
import re
import shutil
from typing import Dict, Iterable, List, Sequence, Set
from urllib.parse import urlparse

from ..models import Attachment, EmailEvent


DEFAULT_BLOCKED_ATTACHMENT_EXTENSIONS = (
    ".exe",
    ".msi",
    ".dmg",
    ".pkg",
    ".bat",
    ".cmd",
    ".ps1",
    ".js",
    ".vbs",
    ".scr",
    ".dll",
    ".jar",
    ".apk",
    ".iso",
    ".img",
    ".com",
    ".pif",
    ".app",
)

DEFAULT_AD_KEYWORDS = (
    "[광고]",
    "수신거부",
    "unsubscribe",
    "newsletter",
    "프로모션",
    "promotion",
    "special offer",
)


def normalize_extensions(values: Sequence[str]) -> Set[str]:
    normalized: Set[str] = set()
    for raw in values:
        item = str(raw or "").strip().lower()
        if not item:
            continue
        if not item.startswith("."):
            item = "." + item
        normalized.add(item)
    return normalized


def apply_mail_policies(
    events: Iterable[EmailEvent],
    *,
    source: str,
    inbox_root: Path,
    workspace: str,
    blocked_extensions: Sequence[str],
    ad_keywords: Sequence[str],
    ad_sender_domains: Sequence[str],
) -> List[EmailEvent]:
    output: List[EmailEvent] = []
    blocked_set = normalize_extensions(blocked_extensions)
    inbox_root = Path(inbox_root).expanduser()
    workspace_name = str(workspace or "personal").strip() or "personal"

    for event in events:
        reasons: List[str] = []
        blocked_attachment_count = 0
        ad_detected = _is_ad_event(event, ad_keywords=ad_keywords, ad_sender_domains=ad_sender_domains)
        bucket = "ads" if ad_detected else "mail"
        attachments: List[Attachment] = []

        for attachment in event.attachments:
            item = replace(attachment)
            ext = _attachment_extension(item)
            if ext and ext in blocked_set:
                blocked_attachment_count += 1
                _mark_attachment_policy(item, tag="blocked_extension", extension=ext)
                if "blocked_attachment_extension" not in reasons:
                    reasons.append("blocked_attachment_extension")
            attachments.append(item)

        if blocked_attachment_count > 0:
            bucket = "quarantine"

        if bucket in {"ads", "quarantine"}:
            target_root = inbox_root / workspace_name / bucket / "attachments" / source / (event.event_id or "unknown_event")
            for attachment in attachments:
                moved = _move_local_attachment(attachment, target_root)
                if moved is not None:
                    attachment.local_path = str(moved)

        if ad_detected and "ad_detected" not in reasons:
            reasons.append("ad_detected")

        metadata = dict(event.metadata or {})
        classification = dict(metadata.get("classification") or {})
        classification.update(
            {
                "bucket": bucket,
                "reasons": reasons,
                "ad_detected": ad_detected,
                "blocked_attachment_count": blocked_attachment_count,
            }
        )
        metadata["classification"] = classification

        output.append(
            replace(
                event,
                attachments=attachments,
                metadata=metadata,
            )
        )

    return output


def _move_local_attachment(attachment: Attachment, target_root: Path) -> Path | None:
    local_path = str(attachment.local_path or "").strip()
    if not local_path:
        return None
    src = Path(local_path).expanduser()
    if not src.exists() or not src.is_file():
        return None
    target_root.mkdir(parents=True, exist_ok=True)
    name = _sanitize_filename(src.name)
    dst = target_root / name
    if dst.exists():
        stem = dst.stem
        suffix = dst.suffix
        idx = 2
        while True:
            candidate = target_root / f"{stem}_{idx}{suffix}"
            if not candidate.exists():
                dst = candidate
                break
            idx += 1
    shutil.move(str(src), str(dst))
    return dst


def _sanitize_filename(name: str) -> str:
    raw = re.sub(r"[\\/\x00-\x1f\x7f]+", "_", str(name or "attachment").strip())
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw or "attachment"


def _mark_attachment_policy(attachment: Attachment, *, tag: str, extension: str) -> None:
    metadata = dict(attachment.metadata or {})
    policy = dict(metadata.get("policy") or {})
    tags = list(policy.get("tags") or [])
    if tag not in tags:
        tags.append(tag)
    policy["tags"] = tags
    policy["blocked_extension"] = extension
    metadata["policy"] = policy
    attachment.metadata = metadata


def _is_ad_event(event: EmailEvent, *, ad_keywords: Sequence[str], ad_sender_domains: Sequence[str]) -> bool:
    text = " ".join(
        [
            str(event.subject or ""),
            str(event.body_text or ""),
            str(event.body_html or ""),
        ]
    ).lower()
    for keyword in ad_keywords:
        token = str(keyword or "").strip().lower()
        if token and token in text:
            return True

    headers = _extract_header_map(event.raw)
    if headers.get("list-unsubscribe"):
        return True
    precedence = str(headers.get("precedence", "")).strip().lower()
    if precedence in {"bulk", "junk", "list"}:
        return True

    sender_domains = _sender_domains(event)
    for domain in sender_domains:
        for pattern in ad_sender_domains:
            normalized = str(pattern or "").strip().lower()
            if not normalized:
                continue
            if fnmatch.fnmatch(domain, normalized):
                return True

    return False


def _extract_header_map(raw: Dict[str, object] | None) -> Dict[str, str]:
    if not isinstance(raw, dict):
        return {}

    result: Dict[str, str] = {}
    payload = raw.get("payload")
    if isinstance(payload, dict):
        headers = payload.get("headers")
        if isinstance(headers, list):
            for row in headers:
                if not isinstance(row, dict):
                    continue
                key = str(row.get("name", "")).strip().lower()
                value = str(row.get("value", "")).strip()
                if key:
                    result[key] = value

    headers_map = raw.get("headers")
    if isinstance(headers_map, dict):
        for key, value in headers_map.items():
            k = str(key or "").strip().lower()
            if not k:
                continue
            result[k] = str(value or "").strip()

    return result


def _sender_domains(event: EmailEvent) -> List[str]:
    domains: List[str] = []
    for row in event.from_addrs:
        address = str(getattr(row, "address", "") or "").strip().lower()
        if "@" not in address:
            continue
        domain = address.split("@", 1)[1].strip()
        if domain:
            domains.append(domain)
    return domains


def _attachment_extension(attachment: Attachment) -> str:
    for candidate in (attachment.name, attachment.local_path):
        ext = _path_extension(candidate)
        if ext:
            return ext
    url = str(attachment.url or "").strip()
    if url:
        ext = _path_extension(urlparse(url).path)
        if ext:
            return ext
    return ""


def _path_extension(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    ext = Path(raw).suffix.lower().strip()
    if not ext:
        return ""
    if not ext.startswith("."):
        return "." + ext
    return ext
