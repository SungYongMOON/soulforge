"""Profile-local Blossom uploads using the installed adapter's Nostr signer."""
import base64
import hashlib
import json
import mimetypes
import re
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx

MAX_FILE_BYTES = 100 * 1024 * 1024
_HEX = re.compile(r"[0-9a-f]{64}\Z")
_MIME = re.compile(r"[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+\Z")


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _origin(url):
    parts = urlsplit(url)
    if (parts.scheme not in {"http", "https"} or not parts.hostname
            or parts.username or parts.password or parts.query or parts.fragment
            or any(ord(c) < 33 or c == "\\" for c in url)):
        raise ValueError("invalid URL")
    return parts.scheme, parts.hostname, parts.port or (443 if parts.scheme == "https" else 80)


def _event(auth, key, kind, tags, content=""):
    pubkey = auth.public_key_hex(key)
    now = int(time.time())
    digest = hashlib.sha256(_json([0, pubkey, now, kind, tags, content])).digest()
    return dict(id=digest.hex(), pubkey=pubkey, created_at=now, kind=kind,
                tags=tags, content=content, sig=auth.schnorr_sign(digest, key).hex())


def _authorization(event, blossom=False):
    raw = _json(event)
    encoded = (base64.urlsafe_b64encode(raw).rstrip(b"=") if blossom
               else base64.b64encode(raw))
    return "Nostr " + encoded.decode("ascii")


def _thread_tags(events, target, channel):
    if not isinstance(events, list) or len(events) != 1:
        raise ValueError("parent missing")
    event = events[0]
    if not isinstance(event, dict) or event.get("id") != target:
        raise ValueError("parent mismatch")
    tags = event.get("tags")
    if not isinstance(tags, list) or not all(isinstance(t, list) and all(isinstance(v, str) for v in t) for t in tags):
        raise ValueError("invalid tags")
    if ["h", channel] not in tags:
        raise ValueError("parent channel mismatch")
    roots = [t[1] for t in tags if len(t) >= 4 and t[0] == "e" and t[3] == "root" and _HEX.fullmatch(t[1])]
    replies = [t[1] for t in tags if len(t) >= 4 and t[0] == "e" and t[3] == "reply" and _HEX.fullmatch(t[1])]
    if len(roots) > 1 or len(replies) > 1:
        raise ValueError("ambiguous parent")
    root = (roots[0] if roots else replies[0]) if replies else target
    return ([["e", root, "", "root"]] if root != target else []) + [["e", target, "", "reply"]]


async def send_file(adapter, chat_id, path: Path, caption=None, file_name=None,
                    reply_to=None, metadata=None):
    from gateway.platforms.base import SendResult

    def failure(reason):
        return SendResult(success=False, error="buzz_media: " + reason, retryable=False)

    stage = "file validation failed"
    try:
        path = Path(path)
        if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
            return failure("file missing or exceeds 100 MiB")
        with path.open("rb") as stream:
            content = stream.read(MAX_FILE_BYTES + 1)
        if len(content) > MAX_FILE_BYTES:
            return failure("file exceeds 100 MiB")
        filename = str(file_name if file_name is not None else path.name).replace("\\", "/").rsplit("/", 1)[-1]
        if not filename or filename in {".", ".."} or any(ord(c) < 32 or ord(c) == 127 for c in filename):
            return failure("invalid filename")
        caption = caption or ""
        if not isinstance(caption, str) or len(caption.encode("utf-8")) > 65536:
            return failure("invalid caption")
        channel = str(uuid.UUID(str(chat_id)))
        target = (metadata or {}).get("thread_id") or reply_to
        if target and (not isinstance(target, str) or not _HEX.fullmatch(target)):
            return failure("invalid reply target")
        stage = "native authentication unavailable"
        native = next(sys.modules[c.__module__] for c in type(adapter).__mro__ if c.__name__ == "BuzzAdapter")
        auth = native._load_nostr_auth()
        key = adapter._private_key
        if not key:
            return failure(stage)
        base = adapter.relay_url.rstrip("/")
        origin = _origin(base)
        headers = {}
        auth_tag = native.os.getenv("BUZZ_AUTH_TAG", "")
        if auth_tag:
            headers["x-auth-tag"] = auth_tag
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        digest = hashlib.sha256(content).hexdigest()

        async def post(client, endpoint, value):
            url = base + endpoint
            body = _json(value)
            tags = [["u", url], ["method", "POST"], ["nonce", str(uuid.uuid4())],
                    ["payload", hashlib.sha256(body).hexdigest()]]
            request_headers = dict(headers, Authorization=_authorization(_event(auth, key, 27235, tags)))
            request_headers["Content-Type"] = "application/json"
            response = await client.post(url, content=body, headers=request_headers)
            response.raise_for_status()
            return response.json()

        # Never follow a redirect with profile credentials or retry uncertain writes.
        async with httpx.AsyncClient(follow_redirects=False, trust_env=False, timeout=120) as client:
            tags = [["h", channel]]
            if target:
                stage = "reply resolution failed; file not uploaded"
                parent = await post(client, "/query", [{"ids": [target], "limit": 1}])
                tags.extend(_thread_tags(parent, target, channel))
            stage = "upload failed; delivery not confirmed"
            upload_tags = [["t", "upload"], ["x", digest],
                           ["expiration", str(int(time.time()) + (3600 if mime.startswith("video/") else 600))],
                           ["server", urlsplit(base).netloc]]
            upload_headers = dict(headers, Authorization=_authorization(_event(auth, key, 24242, upload_tags, "Upload file"), True))
            upload_headers["Content-Type"] = mime
            upload_headers["X-SHA-256"] = digest
            response = await client.put(base + "/upload", content=content, headers=upload_headers)
            response.raise_for_status()
            stage = "invalid upload receipt; file may be stored"
            blob = response.json()
            if not isinstance(blob, dict):
                return failure(stage)
            url, sha, size, media_type = (blob.get(k) for k in ("url", "sha256", "size", "type"))
            if (not isinstance(url, str) or _origin(url) != origin
                    or not isinstance(sha, str) or not _HEX.fullmatch(sha)
                    or type(size) is not int or size < 0 or size > MAX_FILE_BYTES
                    or not isinstance(media_type, str) or not _MIME.fullmatch(media_type)):
                return failure(stage)
            if not mime.startswith(("audio/", "video/")) and (sha != digest or size != len(content)):
                return failure(stage)
            # Desktop renders attachments by matching a body link to imeta.
            # Encode URL delimiters once and use the identical URL in both.
            url = quote(url, safe="/:%@!$&'*,;=+-._~")
            label = re.sub(r"([\\\[\]])", r"\\\1", filename)
            if media_type.startswith("video/"):
                link = "![video](" + url + ")"
            elif media_type.startswith("image/"):
                link = "![image](" + url + ")"
            else:
                link = "[" + label + "](" + url + ")"
            message = caption + "\n" + link
            if len(message.encode("utf-8")) > 65536:
                return failure("caption and attachment exceed message limit; file may be stored")
            tags.append(["imeta", "url " + url, "m " + media_type, "x " + sha,
                         "size " + str(size), "filename " + filename])
            event = _event(auth, key, 9, tags, message)
            stage = "publish outcome unknown; file may be stored"
            receipt = await post(client, "/events", event)
            if not isinstance(receipt, dict) or receipt.get("accepted") is not True or receipt.get("event_id") != event["id"]:
                return failure("publish acceptance not confirmed; file may be stored")
            # A local de-duplication failure cannot invalidate an accepted receipt.
            try:
                adapter._mark_seen(channel, event["id"])
            except Exception:
                pass
            return SendResult(success=True, message_id=event["id"])
    except httpx.HTTPStatusError as exc:
        return failure(stage + "; HTTP " + str(exc.response.status_code))
    except Exception:
        return failure(stage)
