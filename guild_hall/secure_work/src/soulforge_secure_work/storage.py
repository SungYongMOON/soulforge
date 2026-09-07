"""Bounded working-store access, not OS custody or a mission transaction.

The installation must keep parent directories stable against hostile writers.
Checks reject observed aliases and changed handles; they do not replace that
OS boundary or make several job files an atomic transaction.
"""
from __future__ import annotations

import json
import os
import re
import stat
from pathlib import Path


class StorageHold(RuntimeError):
    """Code-only failure: never include a path or decoded input."""


def identifier(value: str) -> str:
    # Existing opaque IDs and safe legacy ASCII refs (e.g. job.synthetic,
    # R1-07) remain usable. No case folding or Windows filename aliases.
    if (not isinstance(value, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", value)
            or value.endswith(".")
            or value.split(".", 1)[0].upper() in {
                "CON", "PRN", "AUX", "NUL", "CLOCK$", "CONIN$", "CONOUT$",
                *(f"COM{i}" for i in range(10)), *(f"LPT{i}" for i in range(10))}):
        raise StorageHold("STORE_ID_HOLD")
    return value


def _regular(info):
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
            or getattr(info, "st_file_attributes", 0) & 0x400):
        raise StorageHold("STORE_FILE_HOLD")


def _identity(info):
    # Windows Python can report different ctime semantics through lstat and
    # fstat. Compare ctime only between observations from the same interface.
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)


def checked_path(root: Path, *parts: str, missing: bool = False) -> Path:
    for part in parts:
        identifier(part)
    root = Path(root)
    if not root.is_absolute() or ".." in root.parts:
        raise StorageHold("STORE_ROOT_HOLD")
    path = root.joinpath(*parts)
    try:
        # lstat precedes resolution, so junctions/reparse points are never
        # followed just to establish containment (including root ancestors).
        for entry in [*reversed(path.parents), path]:
            try:
                info = entry.lstat()
            except FileNotFoundError:
                if missing:
                    continue
                raise
            if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
                raise StorageHold("STORE_ALIAS_HOLD")
            if entry != path and not stat.S_ISDIR(info.st_mode):
                raise StorageHold("STORE_PATH_HOLD")
            if stat.S_ISREG(info.st_mode):
                _regular(info)
            elif not stat.S_ISDIR(info.st_mode):
                raise StorageHold("STORE_PATH_HOLD")
        resolved_root = root.resolve(strict=not missing)
        resolved = path.resolve(strict=not missing)
        if not resolved.is_relative_to(resolved_root):
            raise StorageHold("STORE_PATH_HOLD")
        # Windows realpath expands short names and normalizes existing case.
        if str(resolved) != str(path):
            raise StorageHold("STORE_ALIAS_HOLD")
        return path
    except FileNotFoundError:
        raise StorageHold("STORE_NOT_FOUND") from None
    except (OSError, ValueError, RuntimeError) as error:
        if isinstance(error, StorageHold):
            raise
        raise StorageHold("STORE_PATH_HOLD") from None


def read_bytes(root: Path, *parts: str, maximum: int) -> bytes:
    path = checked_path(root, *parts)
    try:
        expected = path.lstat()
        _regular(expected)
        if not 0 < expected.st_size <= maximum:
            raise StorageHold("STORE_SIZE_HOLD")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0)
                             | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            _regular(before)
            if _identity(before) != _identity(expected):
                raise StorageHold("STORE_CHANGED_HOLD")
            body = stream.read(maximum + 1)
            after = os.fstat(stream.fileno())
            _regular(after)
            if (_identity(before) != _identity(after) or before.st_ctime_ns != after.st_ctime_ns
                    or len(body) != before.st_size):
                raise StorageHold("STORE_CHANGED_HOLD")
        checked_path(root, *parts)
        final = path.lstat()
        if _identity(final) != _identity(expected) or final.st_ctime_ns != expected.st_ctime_ns:
            raise StorageHold("STORE_CHANGED_HOLD")
        return body
    except OSError:
        raise StorageHold("STORE_READ_HOLD") from None


def decode_object(body: bytes) -> dict:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError()
            result[key] = value
        return result

    try:
        value = json.loads(body.decode("utf-8"), object_pairs_hook=unique,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, RecursionError):
        raise StorageHold("STORE_JSON_HOLD") from None


def write_bytes(root: Path, *parts: str, body: bytes, previous: bytes | None):
    """Exclusive first write; compare before updating an already loaded job.

    A failed/partial write is retained for explicit review. This is not a CAS
    against a hostile concurrent writer or an atomic job/journal transaction.
    """
    path = checked_path(root, *parts, missing=previous is None)
    try:
        expected = path.lstat() if previous is not None else None
        if expected is not None:
            _regular(expected)
        flags = os.O_RDWR | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
        if previous is None:
            flags |= os.O_CREAT | os.O_EXCL
        descriptor = os.open(path, flags, 0o600)
        with os.fdopen(descriptor, "r+b") as stream:
            info = os.fstat(stream.fileno())
            _regular(info)
            if expected is not None:
                if _identity(info) != _identity(expected) or info.st_size != len(previous):
                    raise StorageHold("STORE_CHANGED_HOLD")
                if stream.read(len(previous) + 1) != previous:
                    raise StorageHold("STORE_CHANGED_HOLD")
            checked_path(root, *parts)
            if _identity(path.lstat()) != _identity(info):
                raise StorageHold("STORE_CHANGED_HOLD")
            stream.seek(0)
            stream.write(body)
            stream.truncate()
            stream.flush()
            os.fsync(stream.fileno())
    except FileExistsError:
        raise StorageHold("STORE_EXISTS_HOLD") from None
    except OSError:
        raise StorageHold("STORE_WRITE_HOLD") from None
