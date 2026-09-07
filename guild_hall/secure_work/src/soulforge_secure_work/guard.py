"""Deterministic checks on the bytes that would leave the local zone.

This is an egress guard, not a privacy proof. It answers one narrow question:
does the released packet contain anything this lane already knows must stay
local — a source file name, a host path, or the exact value behind a slot?

A clean result means "no known-local string was found in these bytes". It does
not mean the packet is safe to disclose; that judgement stays with the release
authority and, for real material, with a person.
"""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass

WINDOWS_PATH_RE = re.compile(r"[A-Za-z]:[\\/][^\s\"']{2,}")
POSIX_PATH_RE = re.compile(r"/(?:Users|home|mnt|var|tmp)/[^\s\"']{2,}")
FILE_URI_RE = re.compile(r"file:/{2,}[^\s\"']{2,}")
MAX_SCAN_BYTES = 1024 * 1024
MAX_JSON_DEPTH = 32
MAX_JSON_NODES = 16384


@dataclass(frozen=True)
class Finding:
    code: str
    where: str


def _scan_texts(body: bytes) -> tuple[list[str], str | None]:
    """One bounded JSON decode; preserve the original bytes and text fallback.

    Keys and values are scanned separately, never joined into invented terms.
    JSON-looking malformed input is refused; ordinary text stays supported.
    This does not recursively interpret JSON inside string values.
    """
    if len(body) > MAX_SCAN_BYTES:
        return [], "RELEASE_SCAN_LIMIT"
    try:
        text = body.decode("utf-8")
    except UnicodeError:
        return [], "RELEASE_SCAN_INVALID_UTF8"
    texts = [text]
    if not text.lstrip().startswith(('{', '[', '"')):
        return texts, None
    # Bound nesting before the parser allocates recursive containers.
    depth, quoted, escaped = 0, False, False
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in "[{":
            depth += 1
            if depth > MAX_JSON_DEPTH:
                return texts, "RELEASE_SCAN_LIMIT"
        elif char in "]}":
            depth -= 1

    def strict_object(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError("duplicate")
            obj[key] = value
        return obj

    def reject_constant(_):
        raise ValueError("constant")

    try:
        decoded = json.loads(text, object_pairs_hook=strict_object, parse_constant=reject_constant)
        pending, count = [decoded], 0
        while pending:
            value = pending.pop()
            count += 1
            if count > MAX_JSON_NODES:
                return texts, "RELEASE_SCAN_LIMIT"
            if isinstance(value, str):
                value.encode("utf-8")  # Reject unpaired surrogate strings.
                texts.append(value)
            elif isinstance(value, dict):
                pending.extend(value.keys())
                pending.extend(value.values())
            elif isinstance(value, list):
                pending.extend(value)
    except (ValueError, UnicodeError, RecursionError):
        return texts, "RELEASE_SCAN_INVALID_JSON"
    return texts, None


def scan_released_bytes(body: bytes, *, source_refs: list[str], source_names: list[str],
                        bound_values: list[str]) -> list[Finding]:
    """Scan exact transport bytes plus NFC-normalized decoded JSON strings."""
    findings: list[Finding] = []
    texts, failure = _scan_texts(body)
    if failure:
        return [Finding(code=failure, where="body")]
    texts = [unicodedata.normalize("NFC", text) for text in texts]
    for pattern, code in (
        (WINDOWS_PATH_RE, "HOST_PATH_IN_PACKET"),
        (POSIX_PATH_RE, "HOST_PATH_IN_PACKET"),
        (FILE_URI_RE, "FILE_URI_IN_PACKET"),
    ):
        if any(pattern.search(text) for text in texts):
            findings.append(Finding(code=code, where="body"))
    for name in source_names:
        if name and any(unicodedata.normalize("NFC", name) in text for text in texts):
            findings.append(Finding(code="SOURCE_NAME_IN_PACKET", where="body"))
    for ref in source_refs:
        if ref and any(unicodedata.normalize("NFC", ref) in text for text in texts):
            findings.append(Finding(code="SOURCE_REF_IN_PACKET", where="body"))
    for value in bound_values:
        # A bound value is exactly what the slot exists to withhold.
        if value and any(unicodedata.normalize("NFC", value) in text for text in texts):
            findings.append(Finding(code="BOUND_VALUE_IN_PACKET", where="body"))
    return findings


def scan_log_line(line: str, *, bound_values: list[str]) -> list[Finding]:
    """Receipts and events must not carry mappings or raw source values.

    There is no separate `key_material` channel: nothing in this lane ever
    holds key bytes in a variable available to a log call (the vault key
    wrapper reads its key straight from a file into the AES-GCM primitive and
    nowhere else; a signing key is loaded, used and `del`-ed within one
    function). A channel with nothing to feed it is dead code, not defence in
    depth, so it was removed rather than kept unused.
    """
    findings: list[Finding] = []
    for value in bound_values:
        if value and value in line:
            findings.append(Finding(code="BOUND_VALUE_IN_LOG", where="line"))
    return findings
