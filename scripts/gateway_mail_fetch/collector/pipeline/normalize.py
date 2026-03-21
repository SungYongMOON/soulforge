from __future__ import annotations

from dataclasses import replace
import fnmatch
import hashlib
import re
from typing import Iterable, List, Sequence
from urllib.parse import urlparse

from ..models import Attachment, EmailEvent

URL_PATTERN = re.compile(r"https?://[^\s\]\[\)\(\<\>\"']+")
VALID_ATTACHMENT_TYPES = {"binary_attachment", "reference_attachment", "body_link"}


def _match_allowed_host(host: str, allowed_hosts: Sequence[str]) -> bool:
    norm_host = str(host or "").strip().lower()
    if not norm_host:
        return False
    for raw in allowed_hosts:
        pattern = str(raw or "").strip().lower()
        if not pattern:
            continue
        if fnmatch.fnmatch(norm_host, pattern):
            return True
    return False


def _extract_links(text: str) -> List[str]:
    if not text:
        return []
    return [row.strip() for row in URL_PATTERN.findall(text) if row.strip()]


def normalize_events(
    events: Iterable[EmailEvent],
    *,
    allowed_hosts: Sequence[str],
    attachment_max_bytes: int,
) -> List[EmailEvent]:
    normalized: List[EmailEvent] = []
    max_bytes = max(int(attachment_max_bytes), 0)

    for event in events:
        attachments = list(event.attachments)
        known_urls = {str(item.url).strip() for item in attachments if item.url}

        for item in attachments:
            if item.type not in VALID_ATTACHMENT_TYPES:
                item.type = "reference_attachment"
            if item.type == "binary_attachment" and isinstance(item.size, int) and item.size > max_bytes:
                item.type = "reference_attachment"
                item.local_path = None
            if item.type == "reference_attachment" and not item.url:
                item.url = f"source://{event.source}/{event.provider_message_id}"

        for raw_url in _extract_links(event.body_text or "") + _extract_links(event.body_html or ""):
            if raw_url in known_urls:
                continue
            parsed = urlparse(raw_url)
            host = parsed.netloc.lower()
            attachments.append(
                Attachment(
                    type="body_link",
                    mime="text/uri-list",
                    url=raw_url,
                    metadata={
                        "host": host,
                        "allowed_host": _match_allowed_host(host, allowed_hosts),
                    },
                )
            )
            known_urls.add(raw_url)

        event_id = event.event_id
        if not event_id:
            event_id = hashlib.sha256(
                f"{event.source}:{event.provider_message_id}:{event.received_at}".encode("utf-8")
            ).hexdigest()[:16]

        status = event.ingest_status if event.ingest_status in {"ok", "partial", "failed"} else "ok"
        normalized.append(
            replace(
                event,
                event_id=event_id,
                attachments=attachments,
                ingest_status=status,
            )
        )

    return normalized
