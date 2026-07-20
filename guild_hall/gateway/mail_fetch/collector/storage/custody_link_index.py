from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import timezone
from email import policy
from email.header import decode_header
from email.parser import BytesHeaderParser
from email.utils import getaddresses, parsedate_to_datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import unicodedata
from typing import Any, Iterable, Iterator, Mapping, Optional, Sequence
from uuid import uuid4


_HASH_NAME_RE = re.compile(r"^[0-9a-f]{64}$")
_REPARSE_POINT_ATTRIBUTE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x00000400)
_HEADER_LIMIT_BYTES = 1024 * 1024


class CustodyLinkError(RuntimeError):
    """Fail-closed error whose text never includes mail or provider content."""

    def __init__(self, code: str, *, event_id: Optional[str] = None) -> None:
        self.code = code
        self.event_id = event_id
        super().__init__(code)


@dataclass(frozen=True)
class CustodyLinkRecord:
    event_id: str
    provider_id_sha256: str
    eml_sha256: str
    eml_size: int
    storage_ref: str
    match_method: str
    verified: bool = True

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class CustodyLinkSummary:
    record_count: int
    output_sha256: str
    written: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class _EmlRecord:
    sha256: str
    size: int
    storage_ref: str
    message_id: Optional[str]
    header_signature: tuple[str, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]]


def _absolute_path(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(Path(path).expanduser())))


def _is_reparse_or_link(info: os.stat_result) -> bool:
    return stat.S_ISLNK(info.st_mode) or bool(
        int(getattr(info, "st_file_attributes", 0)) & _REPARSE_POINT_ATTRIBUTE
    )


def _lstat(path: Path, *, missing_ok: bool = False) -> Optional[os.stat_result]:
    try:
        return os.lstat(path)
    except FileNotFoundError:
        if missing_ok:
            return None
        raise CustodyLinkError("path_missing") from None
    except OSError as exc:
        raise CustodyLinkError("path_inspection_failed") from exc


def _assert_safe_existing_chain(path: Path) -> os.stat_result:
    absolute = _absolute_path(path)
    anchor = Path(absolute.anchor)
    if not anchor:
        raise CustodyLinkError("path_not_absolute")

    current = anchor
    final_info: Optional[os.stat_result] = None
    for part in absolute.parts[1:]:
        current = current / part
        final_info = _lstat(current)
        if final_info is None or _is_reparse_or_link(final_info):
            raise CustodyLinkError("reparse_forbidden")
    if final_info is None:
        final_info = _lstat(anchor)
    if final_info is None or _is_reparse_or_link(final_info):
        raise CustodyLinkError("reparse_forbidden")
    return final_info


def _assert_contained(root: Path, candidate: Path) -> None:
    root_key = os.path.normcase(os.fspath(_absolute_path(root)))
    candidate_key = os.path.normcase(os.fspath(_absolute_path(candidate)))
    try:
        common = os.path.normcase(os.path.commonpath((root_key, candidate_key)))
    except ValueError as exc:
        raise CustodyLinkError("path_escape") from exc
    if common != root_key:
        raise CustodyLinkError("path_escape")


def _iter_safe_files(root: Path, *, suffix: str) -> Iterator[Path]:
    absolute = _absolute_path(root)
    root_info = _assert_safe_existing_chain(absolute)
    if stat.S_ISREG(root_info.st_mode):
        if absolute.name.lower().endswith(suffix):
            yield absolute
            return
        raise CustodyLinkError("input_root_type_invalid")
    if not stat.S_ISDIR(root_info.st_mode):
        raise CustodyLinkError("input_root_type_invalid")

    pending = [absolute]
    while pending:
        directory = pending.pop()
        _assert_contained(absolute, directory)
        try:
            entries = sorted(os.scandir(directory), key=lambda row: row.name.casefold())
        except OSError as exc:
            raise CustodyLinkError("input_scan_failed") from exc
        child_directories: list[Path] = []
        for entry in entries:
            child = Path(entry.path)
            _assert_contained(absolute, child)
            try:
                info = entry.stat(follow_symlinks=False)
            except OSError as exc:
                raise CustodyLinkError("path_inspection_failed") from exc
            if _is_reparse_or_link(info):
                raise CustodyLinkError("reparse_forbidden")
            if stat.S_ISDIR(info.st_mode):
                child_directories.append(child)
            elif stat.S_ISREG(info.st_mode) and entry.name.lower().endswith(suffix):
                yield child
        pending.extend(reversed(child_directories))


def _decode_header(value: Any) -> str:
    text = str(value or "")
    chunks: list[str] = []
    try:
        decoded_parts = decode_header(text)
    except Exception:
        decoded_parts = [(text, None)]
    for part, encoding in decoded_parts:
        if isinstance(part, bytes):
            try:
                chunks.append(part.decode(encoding or "utf-8", errors="replace"))
            except LookupError:
                chunks.append(part.decode("utf-8", errors="replace"))
        else:
            chunks.append(part)
    return "".join(chunks)


def _normalize_text(value: Any) -> str:
    decoded = _decode_header(value)
    return " ".join(unicodedata.normalize("NFC", decoded).split()).casefold()


def _normalize_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")
    except (TypeError, ValueError, OverflowError):
        pass
    try:
        from datetime import datetime

        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")
    except (TypeError, ValueError, OverflowError):
        return _normalize_text(raw)


def _address_values(value: Any) -> list[str]:
    if isinstance(value, list):
        rendered: list[str] = []
        for item in value:
            if isinstance(item, Mapping):
                address = str(item.get("address", "") or "").strip()
                name = str(item.get("name", "") or "").strip()
                rendered.append(f"{name} <{address}>" if name else address)
            else:
                rendered.append(str(item or ""))
        return rendered
    return [str(value or "")]


def _normalize_addresses(value: Any) -> tuple[str, ...]:
    raw_values = _address_values(value)
    parsed = getaddresses(raw_values)
    addresses = {
        unicodedata.normalize("NFC", str(address or "").strip()).casefold()
        for _, address in parsed
        if str(address or "").strip()
    }
    if addresses:
        return tuple(sorted(addresses))
    fallback = {_normalize_text(item) for item in raw_values if _normalize_text(item)}
    return tuple(sorted(fallback))


def _header_signature(
    *,
    subject: Any,
    date: Any,
    from_value: Any,
    to_value: Any,
    cc_value: Any,
) -> tuple[str, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    return (
        _normalize_text(subject),
        _normalize_date(date),
        _normalize_addresses(from_value),
        _normalize_addresses(to_value),
        _normalize_addresses(cc_value),
    )


def _signature_is_usable(
    signature: tuple[str, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]],
) -> bool:
    _, date, from_values, to_values, cc_values = signature
    return bool(date and from_values and (to_values or cc_values))


def _canonical_message_id(value: Any) -> Optional[str]:
    candidate = " ".join(str(value or "").split()).strip()
    if not candidate:
        return None
    if candidate.startswith("<") and candidate.endswith(">"):
        candidate = candidate[1:-1].strip()
    if (
        not candidate
        or "@" not in candidate
        or any(char.isspace() for char in candidate)
    ):
        return None
    if "<" in candidate or ">" in candidate:
        return None
    return candidate


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _event_provider_id(row: Mapping[str, Any]) -> str:
    raw = _mapping(row.get("raw"))
    metadata = _mapping(row.get("metadata"))
    value = str(row.get("provider_message_id", "") or "").strip()
    if not value:
        value = str(raw.get("uidl", "") or metadata.get("uidl", "") or "").strip()
    if not value:
        raise CustodyLinkError("event_provider_id_missing", event_id=_event_id(row))
    return value


def _event_id(row: Mapping[str, Any]) -> Optional[str]:
    value = str(row.get("event_id", "") or "").strip()
    return value or None


def _event_message_id(row: Mapping[str, Any], provider_id: str) -> Optional[str]:
    raw = _mapping(row.get("raw"))
    metadata = _mapping(row.get("metadata"))
    headers = _mapping(raw.get("headers"))
    uidl = str(raw.get("uidl", "") or metadata.get("uidl", "") or "").strip()

    for value in (
        row.get("message_id"),
        headers.get("message_id"),
        headers.get("Message-ID"),
    ):
        normalized = _canonical_message_id(value)
        if normalized:
            return normalized

    raw_message_id = str(raw.get("message_id", "") or "").strip()
    if raw_message_id and (not uidl or raw_message_id != uidl):
        normalized = _canonical_message_id(raw_message_id)
        if normalized:
            return normalized

    if not uidl or provider_id != uidl:
        return _canonical_message_id(provider_id)
    return None


def _event_header_signature(
    row: Mapping[str, Any],
) -> tuple[str, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    raw = _mapping(row.get("raw"))
    headers = _mapping(raw.get("headers"))
    return _header_signature(
        subject=headers.get("subject", row.get("subject", "")),
        date=headers.get("date", row.get("received_at", "")),
        from_value=headers.get("from", row.get("from", [])),
        to_value=headers.get("to", row.get("to", [])),
        cc_value=headers.get("cc", row.get("cc", [])),
    )


def _read_event_rows(event_roots: Sequence[Path]) -> list[Mapping[str, Any]]:
    files: dict[str, Path] = {}
    for root in event_roots:
        for path in _iter_safe_files(Path(root), suffix=".jsonl"):
            key = os.path.normcase(os.fspath(_absolute_path(path)))
            files[key] = path
    if not files:
        raise CustodyLinkError("event_jsonl_missing")

    rows: list[Mapping[str, Any]] = []
    for key in sorted(files):
        path = files[key]
        try:
            with path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    if not line.strip():
                        continue
                    try:
                        row = json.loads(line)
                    except (json.JSONDecodeError, UnicodeError) as exc:
                        raise CustodyLinkError("event_json_invalid") from exc
                    if not isinstance(row, Mapping):
                        raise CustodyLinkError("event_record_invalid")
                    rows.append(row)
        except CustodyLinkError:
            raise
        except OSError as exc:
            raise CustodyLinkError("event_jsonl_read_failed") from exc
    if not rows:
        raise CustodyLinkError("event_record_missing")
    return rows


def _file_identity(info: os.stat_result) -> tuple[int, int]:
    try:
        identity = (int(info.st_dev), int(info.st_ino))
    except (AttributeError, TypeError, ValueError) as exc:
        raise CustodyLinkError("eml_identity_unavailable") from exc
    if identity == (0, 0):
        raise CustodyLinkError("eml_identity_unavailable")
    return identity


def _file_stability(info: os.stat_result) -> tuple[int, int, int, int]:
    return (
        *_file_identity(info),
        int(info.st_size),
        int(info.st_mtime_ns),
    )


def _header_end(payload: bytearray) -> Optional[int]:
    markers = [
        index + len(marker)
        for marker in (b"\r\n\r\n", b"\n\n")
        if (index := payload.find(marker)) >= 0
    ]
    return min(markers) if markers else None


def _read_eml_file(path: Path) -> tuple[str, int, bytes]:
    before = _lstat(path)
    if before is None or _is_reparse_or_link(before) or not stat.S_ISREG(before.st_mode):
        raise CustodyLinkError("reparse_forbidden")

    digest = hashlib.sha256()
    size = 0
    header_payload = bytearray()
    header_block: Optional[bytes] = None
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise CustodyLinkError("eml_read_failed") from exc
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or _is_reparse_or_link(opened):
            raise CustodyLinkError("reparse_forbidden")
        expected_stability = _file_stability(opened)
        if _file_identity(before) != _file_identity(opened):
            raise CustodyLinkError("eml_identity_changed")
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            size += len(chunk)
            if header_block is None:
                header_payload.extend(chunk)
                end = _header_end(header_payload)
                if end is not None:
                    if end > _HEADER_LIMIT_BYTES:
                        raise CustodyLinkError("eml_headers_too_large")
                    header_block = bytes(header_payload[:end])
                    header_payload.clear()
                elif len(header_payload) > _HEADER_LIMIT_BYTES:
                    raise CustodyLinkError("eml_headers_too_large")
        if size != opened.st_size or _file_stability(os.fstat(descriptor)) != expected_stability:
            raise CustodyLinkError("eml_identity_changed")
    except CustodyLinkError:
        raise
    except OSError as exc:
        raise CustodyLinkError("eml_read_failed") from exc
    finally:
        os.close(descriptor)

    after = _lstat(path)
    if (
        after is None
        or _is_reparse_or_link(after)
        or not stat.S_ISREG(after.st_mode)
        or _file_stability(after) != expected_stability
    ):
        raise CustodyLinkError("eml_identity_changed")
    if header_block is None:
        header_block = bytes(header_payload)
    return digest.hexdigest(), size, header_block


def _canonical_eml_storage_ref(root: Path, path: Path) -> tuple[str, str]:
    relative = path.relative_to(root)
    parts = relative.parts
    if len(parts) != 4 or parts[:2] != ("hiworks", "sha256"):
        raise CustodyLinkError("eml_path_noncanonical")

    filename_hash = Path(parts[3]).stem
    if (
        not _HASH_NAME_RE.fullmatch(filename_hash)
        or parts[3] != f"{filename_hash}.eml"
    ):
        raise CustodyLinkError("eml_hash_filename_invalid")
    if parts[2] != filename_hash[:2]:
        raise CustodyLinkError("eml_hash_prefix_mismatch")
    return filename_hash, PurePosixPath(*parts).as_posix()


def _load_eml_records(eml_root: Path) -> list[_EmlRecord]:
    root = _absolute_path(eml_root)
    root_info = _assert_safe_existing_chain(root)
    if not stat.S_ISDIR(root_info.st_mode):
        raise CustodyLinkError("eml_root_not_directory")

    records: list[_EmlRecord] = []
    seen_digests: dict[str, str] = {}
    for path in _iter_safe_files(root, suffix=".eml"):
        filename_hash, storage_ref = _canonical_eml_storage_ref(root, path)
        digest, size, header_block = _read_eml_file(path)
        if digest != filename_hash:
            raise CustodyLinkError("eml_hash_filename_mismatch")

        previous_ref = seen_digests.get(digest)
        if previous_ref is not None and previous_ref != storage_ref:
            raise CustodyLinkError("duplicate_eml_digest")
        seen_digests[digest] = storage_ref

        try:
            message = BytesHeaderParser(policy=policy.default).parsebytes(
                header_block
            )
        except Exception as exc:
            raise CustodyLinkError("eml_header_parse_failed") from exc
        records.append(
            _EmlRecord(
                sha256=digest,
                size=size,
                storage_ref=storage_ref,
                message_id=_canonical_message_id(message.get("Message-ID", "")),
                header_signature=_header_signature(
                    subject=message.get("Subject", ""),
                    date=message.get("Date", ""),
                    from_value=message.get_all("From", []),
                    to_value=message.get_all("To", []),
                    cc_value=message.get_all("Cc", []),
                ),
            )
        )
    if not records:
        raise CustodyLinkError("eml_record_missing")
    return records


def _index_eml_records(
    records: Iterable[_EmlRecord],
) -> tuple[
    dict[str, list[_EmlRecord]],
    dict[
        tuple[str, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]],
        list[_EmlRecord],
    ],
]:
    by_message_id: dict[str, list[_EmlRecord]] = {}
    by_signature: dict[
        tuple[str, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]],
        list[_EmlRecord],
    ] = {}
    for record in records:
        if record.message_id:
            by_message_id.setdefault(record.message_id, []).append(record)
        elif _signature_is_usable(record.header_signature):
            by_signature.setdefault(record.header_signature, []).append(record)
    return by_message_id, by_signature


def build_link_records(
    event_rows: Sequence[Mapping[str, Any]], eml_records: Sequence[_EmlRecord]
) -> list[CustodyLinkRecord]:
    by_message_id, by_signature = _index_eml_records(eml_records)
    linked_eml: dict[str, str] = {}
    linked_event: dict[str, CustodyLinkRecord] = {}

    prepared: list[tuple[str, str, Optional[str], Mapping[str, Any]]] = []
    for row in event_rows:
        event_id = _event_id(row)
        if not event_id:
            raise CustodyLinkError("event_id_missing")
        provider_id = _event_provider_id(row)
        prepared.append(
            (event_id, provider_id, _event_message_id(row, provider_id), row)
        )
    prepared.sort(
        key=lambda item: (
            item[2] is None,
            item[0],
            hashlib.sha256(item[1].encode("utf-8")).hexdigest(),
        )
    )

    for event_id, provider_id, message_id, row in prepared:
        if message_id is not None:
            candidates = by_message_id.get(message_id, [])
            match_method = "message_id_exact"
            ambiguous_code = "ambiguous_message_id"
            if len(candidates) > 1:
                signature = _event_header_signature(row)
                if _signature_is_usable(signature):
                    narrowed = [
                        candidate
                        for candidate in candidates
                        if candidate.header_signature == signature
                    ]
                    if len(narrowed) == 1:
                        candidates = narrowed
                        match_method = "message_id_plus_header_signature"
        else:
            signature = _event_header_signature(row)
            if not _signature_is_usable(signature):
                raise CustodyLinkError("header_signature_incomplete", event_id=event_id)
            candidates = by_signature.get(signature, [])
            match_method = "header_signature_unique"
            ambiguous_code = "ambiguous_header_signature"

        if not candidates:
            raise CustodyLinkError("unmatched_event", event_id=event_id)
        if len(candidates) != 1:
            raise CustodyLinkError(ambiguous_code, event_id=event_id)
        eml = candidates[0]

        provider_hash = hashlib.sha256(provider_id.encode("utf-8")).hexdigest()
        record = CustodyLinkRecord(
            event_id=event_id,
            provider_id_sha256=provider_hash,
            eml_sha256=eml.sha256,
            eml_size=eml.size,
            storage_ref=eml.storage_ref,
            match_method=match_method,
        )

        previous_event = linked_event.get(event_id)
        if previous_event is not None:
            if previous_event != record:
                raise CustodyLinkError("duplicate_conflicting_link", event_id=event_id)
            continue
        previous_eml_event = linked_eml.get(eml.sha256)
        if previous_eml_event is not None and previous_eml_event != event_id:
            raise CustodyLinkError("duplicate_conflicting_link", event_id=event_id)
        linked_event[event_id] = record
        linked_eml[eml.sha256] = event_id

    if len(linked_eml) != len(eml_records):
        raise CustodyLinkError("unmatched_eml")
    return sorted(
        linked_event.values(),
        key=lambda row: (row.event_id, row.provider_id_sha256, row.eml_sha256),
    )


def _serialize_records(records: Iterable[CustodyLinkRecord]) -> bytes:
    lines = [
        json.dumps(
            record.to_dict(), ensure_ascii=True, sort_keys=True, separators=(",", ":")
        )
        for record in records
    ]
    return (("\n".join(lines) + "\n") if lines else "").encode("utf-8")


def _ensure_safe_output_parent(parent: Path) -> None:
    absolute = _absolute_path(parent)
    anchor = Path(absolute.anchor)
    if not anchor:
        raise CustodyLinkError("output_path_not_absolute")
    _assert_safe_existing_chain(anchor)
    current = anchor
    for part in absolute.parts[1:]:
        current = current / part
        info = _lstat(current, missing_ok=True)
        if info is None:
            try:
                current.mkdir()
            except FileExistsError:
                pass
            except OSError as exc:
                raise CustodyLinkError("output_directory_create_failed") from exc
            info = _lstat(current)
        if info is None or _is_reparse_or_link(info) or not stat.S_ISDIR(info.st_mode):
            raise CustodyLinkError("output_reparse_forbidden")


def _read_exact_file(path: Path, expected: bytes) -> bool:
    info = _lstat(path, missing_ok=True)
    if info is None:
        return False
    if (
        _is_reparse_or_link(info)
        or not stat.S_ISREG(info.st_mode)
        or info.st_size != len(expected)
    ):
        raise CustodyLinkError("output_exists_conflict")
    try:
        actual = path.read_bytes()
    except OSError as exc:
        raise CustodyLinkError("output_read_failed") from exc
    if actual != expected:
        raise CustodyLinkError("output_exists_conflict")
    return True


def _write_immutable(path: Path, payload: bytes) -> bool:
    target = _absolute_path(path)
    _ensure_safe_output_parent(target.parent)
    if _read_exact_file(target, payload):
        return False

    temporary = target.parent / f".{target.name}.{uuid4().hex}.partial"
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_BINARY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(temporary, flags, 0o600)
        try:
            view = memoryview(payload)
            offset = 0
            while offset < len(view):
                written = os.write(descriptor, view[offset:])
                if written <= 0:
                    raise CustodyLinkError("output_write_failed")
                offset += written
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        try:
            os.link(temporary, target)
            written = True
        except FileExistsError:
            if not _read_exact_file(target, payload):
                raise CustodyLinkError("output_exists_conflict")
            written = False
        except OSError as exc:
            raise CustodyLinkError("output_publish_failed") from exc
        if not _read_exact_file(target, payload):
            raise CustodyLinkError("output_write_failed")
        return written
    finally:
        try:
            info = _lstat(temporary, missing_ok=True)
            if (
                info is not None
                and stat.S_ISREG(info.st_mode)
                and not _is_reparse_or_link(info)
            ):
                os.unlink(temporary)
        except (OSError, CustodyLinkError):
            pass


def build_custody_link_index(
    *, event_roots: Sequence[Path], eml_root: Path, output_path: Path
) -> CustodyLinkSummary:
    if not event_roots:
        raise CustodyLinkError("event_root_missing")
    event_rows = _read_event_rows(event_roots)
    eml_records = _load_eml_records(eml_root)
    records = build_link_records(event_rows, eml_records)
    payload = _serialize_records(records)
    written = _write_immutable(output_path, payload)
    return CustodyLinkSummary(
        record_count=len(records),
        output_sha256=hashlib.sha256(payload).hexdigest(),
        written=written,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build a privacy-safe event-to-RFC822 custody link index offline."
    )
    parser.add_argument(
        "--event-root",
        action="append",
        required=True,
        type=Path,
        help="Event JSONL file or directory; may be repeated.",
    )
    parser.add_argument(
        "--eml-root", required=True, type=Path, help="Content-addressed EML root."
    )
    parser.add_argument(
        "--output", required=True, type=Path, help="Immutable JSONL receipt path."
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        summary = build_custody_link_index(
            event_roots=args.event_root,
            eml_root=args.eml_root,
            output_path=args.output,
        )
    except CustodyLinkError as exc:
        payload: dict[str, object] = {"ok": False, "code": exc.code}
        if exc.event_id:
            payload["event_id"] = exc.event_id
        print(json.dumps(payload, ensure_ascii=True, sort_keys=True), file=sys.stderr)
        return 2
    except Exception:
        print('{"code":"unexpected_failure","ok":false}', file=sys.stderr)
        return 3
    print(
        json.dumps({"ok": True, **summary.to_dict()}, ensure_ascii=True, sort_keys=True)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
