"""Hydrate authorized Buzz imeta into a profile-local verified attachment cache."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import uuid
from urllib.parse import urlsplit

import httpx

from .file_transport import _authorization, _event, _origin, _json

MAX_BYTES = 100 * 1024 * 1024
MAX_FILES = 8
_HEX = re.compile(r"[0-9a-f]{64}\Z")
_MEDIA_PATH = re.compile(r"/media/([0-9a-f]{64})(?:\.[A-Za-z0-9]{1,12})?\Z")
_MIME = re.compile(r"[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+\Z")


def _descriptors(raw, event, origin):
    source = event.source
    if (not isinstance(raw, dict) or raw.get("id") != event.message_id
            or raw.get("pubkey") != source.user_id or raw.get("kind") != 9):
        raise ValueError("event mismatch")
    tags = raw.get("tags")
    if not isinstance(tags, list) or not all(isinstance(t, list) and all(isinstance(v, str) for v in t) for t in tags):
        raise ValueError("invalid event tags")
    channels = [t[1:] for t in tags if t and t[0] == "h"]
    if channels != [[str(source.chat_id)]]:
        raise ValueError("channel mismatch")
    descriptors = []
    for tag in tags:
        if not tag or tag[0] != "imeta":
            continue
        fields = {}
        for entry in tag[1:]:
            key, separator, value = entry.partition(" ")
            if key in {"url", "m", "x", "size", "filename"}:
                if not separator or key in fields:
                    raise ValueError("duplicate or invalid imeta")
                fields[key] = value
        url, mime, digest, size = (fields.get(k, "") for k in ("url", "m", "x", "size"))
        match = _MEDIA_PATH.fullmatch(urlsplit(url).path)
        if (_origin(url) != origin or not match or not _HEX.fullmatch(digest)
                or match[1] != digest or not _MIME.fullmatch(mime)
                or not re.fullmatch(r"0|[1-9][0-9]{0,11}", size)):
            raise ValueError("invalid imeta")
        name = fields.get("filename", "").replace("\\", "/").rsplit("/", 1)[-1]
        if name in {".", ".."} or any(ord(c) < 32 or ord(c) == 127 for c in name):
            raise ValueError("invalid filename")
        # Keep a portable extension for native document type dispatch. The
        # untrusted filename never supplies a directory or an overwrite target.
        extension = Path(name).suffix.lower() or Path(urlsplit(url).path).suffix.lower()
        if not re.fullmatch(r"\.[a-z0-9]{1,12}", extension):
            extension = ""
        descriptors.append(dict(url=url, mime=mime, digest=digest, size=int(size), extension=extension))
    if len(descriptors) > MAX_FILES or sum(item["size"] for item in descriptors) > MAX_BYTES:
        raise ValueError("attachment limit")
    return descriptors


def _verified(path, size, digest):
    if path.is_symlink() or not path.is_file() or path.stat().st_size != size:
        return False
    hasher = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        while chunk := stream.read(65536):
            count += len(chunk)
            if count > size:
                return False
            hasher.update(chunk)
    return count == size and hasher.hexdigest() == digest


async def hydrate_event(adapter, event):
    """Add only verified local paths; denied or already hydrated events stay intact."""
    try:
        source = event.source
        platform = getattr(source.platform, "value", source.platform)
        if (platform != "buzz" or getattr(event, "internal", False)
                or getattr(source, "profile_route_rejected", False)
                or getattr(event, "profile_route_rejected", False)
                or getattr(event, "media_urls", None)):
            return
        authorize = getattr(adapter, "_is_sender_authorized", None)
        if not callable(authorize) or authorize(source.user_id, source.chat_type, source.chat_id) is not True:
            return
        if not isinstance(event.message_id, str) or not _HEX.fullmatch(event.message_id):
            return
        native = next(sys.modules[c.__module__] for c in type(adapter).__mro__ if c.__name__ == "BuzzAdapter")
        auth, key = native._load_nostr_auth(), adapter._private_key
        if not key:
            return
        home = Path(adapter._buzz_attachment_home).resolve(strict=True)
        base = adapter.relay_url.rstrip("/")
        origin = _origin(base)
        headers = {}
        auth_tag = native.os.getenv("BUZZ_AUTH_TAG", "")
        if auth_tag:
            headers["x-auth-tag"] = auth_tag
        query_url = base + "/query"
        body = _json([{"ids": [event.message_id], "limit": 1}])
        query_tags = [["u", query_url], ["method", "POST"], ["nonce", str(uuid.uuid4())],
                      ["payload", hashlib.sha256(body).hexdigest()]]
        query_headers = dict(headers, Authorization=_authorization(_event(auth, key, 27235, query_tags)))
        query_headers["Content-Type"] = "application/json"
        async with asyncio.timeout(120), httpx.AsyncClient(follow_redirects=False, trust_env=False, timeout=60) as client:
            # Bound query response as well as attachment streams.
            response_bytes = bytearray()
            async with client.stream("POST", query_url, content=body, headers=query_headers) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes(65536):
                    response_bytes.extend(chunk)
                    if len(response_bytes) > 1024 * 1024:
                        raise ValueError("query limit")
            records = json.loads(response_bytes)
            if not isinstance(records, list) or len(records) != 1:
                raise ValueError("event unavailable")
            descriptors = _descriptors(records[0], event, origin)
            paths, types = [], []
            for item in descriptors:
                folder = home / "cache" / ("images" if item["mime"].startswith("image/") else "documents")
                # Refuse cache-directory links pointing outside the captured home.
                if not folder.resolve().is_relative_to(home):
                    raise ValueError("cache boundary")
                folder.mkdir(parents=True, exist_ok=True)
                target = folder / ("buzz-" + item["digest"] + item["extension"])
                if not _verified(target, item["size"], item["digest"]):
                    if target.exists() or target.is_symlink():
                        raise ValueError("cache conflict")
                    tags = [["t", "get"], ["expiration", str(int(time.time()) + 600)],
                            ["server", urlsplit(base).netloc]]
                    download_headers = dict(headers, Authorization=_authorization(_event(auth, key, 24242, tags, "Get media"), True))
                    temporary = None
                    try:
                        with tempfile.NamedTemporaryFile(prefix=".buzz-", dir=folder, delete=False) as stream:
                            temporary = Path(stream.name)
                            count, digest = 0, hashlib.sha256()
                            async with client.stream("GET", item["url"], headers=download_headers) as response:
                                response.raise_for_status()
                                async for chunk in response.aiter_bytes(65536):
                                    count += len(chunk)
                                    if count > item["size"]:
                                        raise ValueError("download limit")
                                    digest.update(chunk)
                                    stream.write(chunk)
                        if count != item["size"] or digest.hexdigest() != item["digest"]:
                            raise ValueError("download mismatch")
                        # Atomic no-replace publication; a parallel writer must
                        # have produced exactly the same bytes to be reused.
                        try:
                            os.link(temporary, target)
                        except FileExistsError:
                            if not _verified(target, item["size"], item["digest"]):
                                raise ValueError("cache conflict")
                    finally:
                        if temporary is not None:
                            temporary.unlink(missing_ok=True)
                paths.append(str(target))
                types.append(item["mime"])
            if paths:
                event.media_urls = paths
                event.media_types = types
    except Exception:
        # Preserve the message; never imply that a failed download is local.
        notice = "[Buzz attachment could not be cached locally.]"
        text = getattr(event, "text", "") or ""
        if notice not in text:
            event.text = text + "\n" + notice
