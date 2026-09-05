"""Deterministic checks on the bytes that would leave the local zone.

This is an egress guard, not a privacy proof. It answers one narrow question:
does the released packet contain anything this lane already knows must stay
local — a source file name, a host path, or the exact value behind a slot?

A clean result means "no known-local string was found in these bytes". It does
not mean the packet is safe to disclose; that judgement stays with the release
authority and, for real material, with a person.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

WINDOWS_PATH_RE = re.compile(r"[A-Za-z]:[\\/][^\s\"']{2,}")
POSIX_PATH_RE = re.compile(r"/(?:Users|home|mnt|var|tmp)/[^\s\"']{2,}")
FILE_URI_RE = re.compile(r"file:/{2,}[^\s\"']{2,}")


@dataclass(frozen=True)
class Finding:
    code: str
    where: str


def scan_released_bytes(body: bytes, *, source_refs: list[str], source_names: list[str],
                        bound_values: list[str]) -> list[Finding]:
    """Scan the exact bytes that a transport would send."""
    findings: list[Finding] = []
    text = body.decode("utf-8", errors="replace")
    for pattern, code in (
        (WINDOWS_PATH_RE, "HOST_PATH_IN_PACKET"),
        (POSIX_PATH_RE, "HOST_PATH_IN_PACKET"),
        (FILE_URI_RE, "FILE_URI_IN_PACKET"),
    ):
        if pattern.search(text):
            findings.append(Finding(code=code, where="body"))
    for name in source_names:
        if name and name in text:
            findings.append(Finding(code="SOURCE_NAME_IN_PACKET", where="body"))
    for ref in source_refs:
        if ref and ref in text:
            findings.append(Finding(code="SOURCE_REF_IN_PACKET", where="body"))
    for value in bound_values:
        # A bound value is exactly what the slot exists to withhold.
        if value and value in text:
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
