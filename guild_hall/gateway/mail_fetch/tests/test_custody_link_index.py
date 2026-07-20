from __future__ import annotations

from email import policy
from email.parser import BytesParser
import hashlib
import json
import os
from pathlib import Path
import stat
from types import SimpleNamespace

import pytest

from collector.storage import custody_link_index as link_module
from collector.storage.custody_link_index import (
    CustodyLinkError,
    build_custody_link_index,
    main,
)


DATE_HEADER = "Tue, 21 Jul 2026 08:30:01 +0900"


def _raw_message(
    *,
    message_id: str | None,
    subject: str = "Synthetic subject",
    from_value: str = "Sender <sender@example.test>",
    to_value: str = "Recipient <recipient@example.test>",
    body: bytes = b"synthetic body\r\n",
    extra_headers: tuple[bytes, ...] = (),
) -> bytes:
    headers = [
        f"Date: {DATE_HEADER}".encode("ascii"),
        f"From: {from_value}".encode("ascii"),
        f"To: {to_value}".encode("ascii"),
        f"Subject: {subject}".encode("ascii"),
    ]
    if message_id is not None:
        headers.append(f"Message-ID: <{message_id}>".encode("ascii"))
    headers.extend(extra_headers)
    return b"\r\n".join(headers) + b"\r\n\r\n" + body


def _event(
    *,
    event_id: str,
    provider_id: str,
    message_id: str | None,
    subject: str = "Synthetic subject",
    from_value: str = "Sender <sender@example.test>",
    to_value: str = "Recipient <recipient@example.test>",
) -> dict[str, object]:
    uidl = provider_id if message_id is None else f"uidl-{event_id}"
    raw_message_id = uidl if message_id is None else message_id
    return {
        "event_id": event_id,
        "provider_message_id": provider_id,
        "subject": subject,
        "from": [{"name": "Sender", "address": "sender@example.test"}],
        "to": [{"name": "Recipient", "address": "recipient@example.test"}],
        "cc": [],
        "received_at": "2026-07-20T23:30:01+00:00",
        "raw": {
            "uidl": uidl,
            "message_id": raw_message_id,
            "headers": {
                "date": DATE_HEADER,
                "from": from_value,
                "to": to_value,
                "subject": subject,
            },
        },
    }


def _write_events(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def _write_eml(root: Path, raw: bytes) -> tuple[Path, str]:
    digest = hashlib.sha256(raw).hexdigest()
    path = root / "hiworks" / "sha256" / digest[:2] / f"{digest}.eml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return path, digest


def _read_receipts(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_exact_242_style_message_id_receipt_is_public_safe(tmp_path: Path) -> None:
    message_id = "242.20260721.083001.12345@mail.hiworks.example"
    provider_id = message_id
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    output = tmp_path / "receipts" / "links.jsonl"
    _write_events(
        event_root / "2026-07.jsonl",
        [_event(event_id="evt-242", provider_id=provider_id, message_id=message_id)],
    )
    raw = _raw_message(message_id=message_id)
    _, digest = _write_eml(eml_root, raw)

    summary = build_custody_link_index(
        event_roots=[event_root], eml_root=eml_root, output_path=output
    )

    assert summary.record_count == 1
    assert summary.written is True
    assert _read_receipts(output) == [
        {
            "eml_sha256": digest,
            "eml_size": len(raw),
            "event_id": "evt-242",
            "match_method": "message_id_exact",
            "provider_id_sha256": hashlib.sha256(
                provider_id.encode("utf-8")
            ).hexdigest(),
            "storage_ref": f"hiworks/sha256/{digest[:2]}/{digest}.eml",
            "verified": True,
        }
    ]
    rendered = output.read_text(encoding="utf-8")
    assert provider_id not in rendered
    assert "Synthetic subject" not in rendered
    assert "sender@example.test" not in rendered


def test_missing_message_id_uses_unique_header_crosswalk(tmp_path: Path) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    output = tmp_path / "links.jsonl"
    _write_events(
        event_root / "events.jsonl",
        [
            _event(
                event_id="evt-no-mid", provider_id="private-uidl-001", message_id=None
            )
        ],
    )
    _write_eml(eml_root, _raw_message(message_id=None))

    build_custody_link_index(
        event_roots=[event_root], eml_root=eml_root, output_path=output
    )

    receipt = _read_receipts(output)[0]
    assert receipt["match_method"] == "header_signature_unique"
    assert receipt["verified"] is True
    assert "private-uidl-001" not in output.read_text(encoding="utf-8")


def test_missing_message_id_rejects_ambiguous_header_crosswalk(tmp_path: Path) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    _write_events(
        event_root / "events.jsonl",
        [
            _event(
                event_id="evt-ambiguous",
                provider_id="private-uidl-002",
                message_id=None,
            )
        ],
    )
    _write_eml(eml_root, _raw_message(message_id=None, body=b"first body\r\n"))
    _write_eml(eml_root, _raw_message(message_id=None, body=b"second body\r\n"))

    with pytest.raises(CustodyLinkError) as error:
        build_custody_link_index(
            event_roots=[event_root],
            eml_root=eml_root,
            output_path=tmp_path / "links.jsonl",
        )

    assert error.value.code == "ambiguous_header_signature"
    assert error.value.event_id == "evt-ambiguous"
    assert str(error.value) == "ambiguous_header_signature"


def test_duplicate_message_id_is_narrowed_only_by_unique_header_signature(
    tmp_path: Path,
) -> None:
    message_id = "duplicated-message-id@example.test"
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    output = tmp_path / "links.jsonl"
    rows = [
        _event(
            event_id="evt-duplicate-a",
            provider_id=message_id,
            message_id=message_id,
            subject="Synthetic A",
        ),
        _event(
            event_id="evt-duplicate-b",
            provider_id=message_id,
            message_id=message_id,
            subject="Synthetic B",
        ),
    ]
    _write_events(event_root / "events.jsonl", rows)
    _write_eml(
        eml_root,
        _raw_message(message_id=message_id, subject="Synthetic A", body=b"body a\r\n"),
    )
    _write_eml(
        eml_root,
        _raw_message(message_id=message_id, subject="Synthetic B", body=b"body b\r\n"),
    )

    build_custody_link_index(
        event_roots=[event_root], eml_root=eml_root, output_path=output
    )

    receipts = _read_receipts(output)
    assert len(receipts) == 2
    assert {row["match_method"] for row in receipts} == {
        "message_id_plus_header_signature"
    }


def test_rejects_hash_filename_mismatch(tmp_path: Path) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    message_id = "hash-check@example.test"
    _write_events(
        event_root / "events.jsonl",
        [_event(event_id="evt-hash", provider_id=message_id, message_id=message_id)],
    )
    incorrect_digest = "0" * 64
    eml_path = eml_root / "hiworks" / "sha256" / "00" / f"{incorrect_digest}.eml"
    eml_path.parent.mkdir(parents=True)
    eml_path.write_bytes(_raw_message(message_id=message_id))

    with pytest.raises(CustodyLinkError) as error:
        build_custody_link_index(
            event_roots=[event_root],
            eml_root=eml_root,
            output_path=tmp_path / "links.jsonl",
        )

    assert error.value.code == "eml_hash_filename_mismatch"


def test_rejects_eml_below_noncanonical_private_segment(tmp_path: Path) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    message_id = "noncanonical@example.test"
    _write_events(
        event_root / "events.jsonl",
        [
            _event(
                event_id="evt-noncanonical",
                provider_id=message_id,
                message_id=message_id,
            )
        ],
    )
    _write_eml(eml_root / "private", _raw_message(message_id=message_id))

    with pytest.raises(CustodyLinkError) as error:
        build_custody_link_index(
            event_roots=[event_root],
            eml_root=eml_root,
            output_path=tmp_path / "links.jsonl",
        )

    assert error.value.code == "eml_path_noncanonical"


def test_eml_replacement_during_single_descriptor_read_is_blocked_or_rejected(
    monkeypatch, tmp_path: Path
) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    message_id = "replacement@example.test"
    raw = _raw_message(message_id=message_id)
    _write_events(
        event_root / "events.jsonl",
        [_event(event_id="evt-replacement", provider_id=message_id, message_id=message_id)],
    )
    eml_path, _ = _write_eml(eml_root, raw)
    replacement = tmp_path / "replacement.eml"
    replacement.write_bytes(raw)
    original_read = link_module.os.read
    replacement_blocked = False
    replacement_attempted = False

    def replacing_read(descriptor: int, count: int) -> bytes:
        nonlocal replacement_attempted, replacement_blocked
        chunk = original_read(descriptor, count)
        if chunk and not replacement_attempted:
            replacement_attempted = True
            try:
                os.replace(replacement, eml_path)
            except OSError:
                replacement_blocked = True
        return chunk

    monkeypatch.setattr(link_module.os, "read", replacing_read)
    caught: CustodyLinkError | None = None
    try:
        build_custody_link_index(
            event_roots=[event_root],
            eml_root=eml_root,
            output_path=tmp_path / "links.jsonl",
        )
    except CustodyLinkError as exc:
        caught = exc
    if replacement_blocked:
        assert os.name == "nt"
        assert caught is None
    else:
        assert caught is not None
        assert caught.code == "eml_identity_changed"
    assert replacement_attempted is True


def test_eml_tamper_during_single_descriptor_read_is_blocked_or_rejected(
    monkeypatch, tmp_path: Path
) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    message_id = "tamper@example.test"
    raw = _raw_message(message_id=message_id, body=b"a" * (2 * 1024 * 1024))
    _write_events(
        event_root / "events.jsonl",
        [_event(event_id="evt-tamper", provider_id=message_id, message_id=message_id)],
    )
    eml_path, _ = _write_eml(eml_root, raw)
    original_read = link_module.os.read
    tamper_blocked = False
    tamper_attempted = False

    def tampering_read(descriptor: int, count: int) -> bytes:
        nonlocal tamper_attempted, tamper_blocked
        chunk = original_read(descriptor, count)
        if chunk and not tamper_attempted:
            tamper_attempted = True
            try:
                with eml_path.open("r+b") as handle:
                    handle.seek(-1, os.SEEK_END)
                    handle.write(b"b")
                    handle.flush()
                    os.fsync(handle.fileno())
            except OSError:
                tamper_blocked = True
        return chunk

    monkeypatch.setattr(link_module.os, "read", tampering_read)
    caught: CustodyLinkError | None = None
    try:
        build_custody_link_index(
            event_roots=[event_root],
            eml_root=eml_root,
            output_path=tmp_path / "links.jsonl",
        )
    except CustodyLinkError as exc:
        caught = exc
    if tamper_blocked:
        assert os.name == "nt"
        assert caught is None
    else:
        assert caught is not None
        assert caught.code == "eml_identity_changed"
    assert tamper_attempted is True


def test_empty_body_tnef_structure_is_unchanged_and_never_output(
    tmp_path: Path,
) -> None:
    message_id = "tnef-empty@example.test"
    boundary = b"safe-boundary"
    private_marker = b"PRIVATE-TNEF-BINARY-MARKER"
    raw = _raw_message(
        message_id=message_id,
        subject="PRIVATE-TNEF-SUBJECT",
        from_value="Private Sender <private.sender@example.test>",
        to_value="Private Recipient <private.recipient@example.test>",
        body=(
            b"--" + boundary + b"\r\n"
            b"Content-Type: text/plain; charset=utf-8\r\n"
            b"Content-Transfer-Encoding: 7bit\r\n\r\n"
            b"\r\n"
            b"--" + boundary + b"\r\n"
            b"Content-Type: application/ms-tnef; name=winmail.dat\r\n"
            b"Content-Transfer-Encoding: base64\r\n\r\n"
            b"UFJJVkFURS1UTkVGLUJJTkFSWS1NQVJLRVI=\r\n"
            b"--" + boundary + b"--\r\n"
        ),
        extra_headers=(
            b"MIME-Version: 1.0",
            b'Content-Type: multipart/mixed; boundary="safe-boundary"',
        ),
    )
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    output = tmp_path / "links.jsonl"
    _write_events(
        event_root / "events.jsonl",
        [
            _event(
                event_id="evt-tnef",
                provider_id=message_id,
                message_id=message_id,
                subject="PRIVATE-TNEF-SUBJECT",
                from_value="Private Sender <private.sender@example.test>",
                to_value="Private Recipient <private.recipient@example.test>",
            )
        ],
    )
    eml_path, _ = _write_eml(eml_root, raw)
    before = eml_path.read_bytes()

    build_custody_link_index(
        event_roots=[event_root], eml_root=eml_root, output_path=output
    )

    assert eml_path.read_bytes() == before
    reparsed = BytesParser(policy=policy.default).parsebytes(before)
    text_parts = [
        part for part in reparsed.walk() if part.get_content_type() == "text/plain"
    ]
    tnef_parts = [
        part
        for part in reparsed.walk()
        if part.get_content_type() == "application/ms-tnef"
    ]
    assert len(text_parts) == 1
    assert text_parts[0].get_payload(decode=True) in {b"", b"\r\n"}
    assert [part.get_payload(decode=True) for part in tnef_parts] == [private_marker]
    rendered = output.read_bytes()
    assert b"PRIVATE-TNEF-SUBJECT" not in rendered
    assert b"private.sender@example.test" not in rendered
    assert private_marker not in rendered


def test_deterministic_replay_and_immutable_existing_output(tmp_path: Path) -> None:
    event_root_a = tmp_path / "events-a"
    event_root_b = tmp_path / "events-b"
    eml_root = tmp_path / "custody"
    first_output = tmp_path / "first.jsonl"
    second_output = tmp_path / "second.jsonl"
    message_a = "deterministic-a@example.test"
    message_b = "deterministic-b@example.test"
    _write_events(
        event_root_a / "z.jsonl",
        [_event(event_id="evt-b", provider_id=message_b, message_id=message_b)],
    )
    _write_events(
        event_root_b / "a.jsonl",
        [_event(event_id="evt-a", provider_id=message_a, message_id=message_a)],
    )
    _write_eml(eml_root, _raw_message(message_id=message_b, body=b"body b\r\n"))
    _write_eml(eml_root, _raw_message(message_id=message_a, body=b"body a\r\n"))

    first = build_custody_link_index(
        event_roots=[event_root_a, event_root_b],
        eml_root=eml_root,
        output_path=first_output,
    )
    replay = build_custody_link_index(
        event_roots=[event_root_b, event_root_a],
        eml_root=eml_root,
        output_path=second_output,
    )
    immutable_replay = build_custody_link_index(
        event_roots=[event_root_a, event_root_b],
        eml_root=eml_root,
        output_path=first_output,
    )

    assert first_output.read_bytes() == second_output.read_bytes()
    assert first.output_sha256 == replay.output_sha256 == immutable_replay.output_sha256
    assert first.written is True
    assert replay.written is True
    assert immutable_replay.written is False
    assert [row["event_id"] for row in _read_receipts(first_output)] == [
        "evt-a",
        "evt-b",
    ]

    first_output.write_bytes(b"tampered receipt\n")
    with pytest.raises(CustodyLinkError) as conflict:
        build_custody_link_index(
            event_roots=[event_root_a, event_root_b],
            eml_root=eml_root,
            output_path=first_output,
        )
    assert conflict.value.code == "output_exists_conflict"
    assert first_output.read_bytes() == b"tampered receipt\n"


def test_rejects_unmatched_event_and_duplicate_conflicting_link(tmp_path: Path) -> None:
    unmatched_events = tmp_path / "unmatched-events"
    unmatched_eml = tmp_path / "unmatched-eml"
    event_message = "event-only@example.test"
    eml_message = "eml-only@example.test"
    _write_events(
        unmatched_events / "events.jsonl",
        [
            _event(
                event_id="evt-unmatched",
                provider_id=event_message,
                message_id=event_message,
            )
        ],
    )
    _write_eml(unmatched_eml, _raw_message(message_id=eml_message))

    with pytest.raises(CustodyLinkError) as unmatched:
        build_custody_link_index(
            event_roots=[unmatched_events],
            eml_root=unmatched_eml,
            output_path=tmp_path / "unmatched.jsonl",
        )
    assert unmatched.value.code == "unmatched_event"

    conflict_events = tmp_path / "conflict-events"
    conflict_eml = tmp_path / "conflict-eml"
    message_a = "conflict-a@example.test"
    message_b = "conflict-b@example.test"
    _write_events(
        conflict_events / "events.jsonl",
        [
            _event(
                event_id="evt-conflict", provider_id=message_a, message_id=message_a
            ),
            _event(
                event_id="evt-conflict", provider_id=message_b, message_id=message_b
            ),
        ],
    )
    _write_eml(conflict_eml, _raw_message(message_id=message_a, body=b"body a\r\n"))
    _write_eml(conflict_eml, _raw_message(message_id=message_b, body=b"body b\r\n"))

    with pytest.raises(CustodyLinkError) as conflict:
        build_custody_link_index(
            event_roots=[conflict_events],
            eml_root=conflict_eml,
            output_path=tmp_path / "conflict.jsonl",
        )
    assert conflict.value.code == "duplicate_conflicting_link"


def test_rejects_reparse_eml_root_without_exposing_path(
    monkeypatch, tmp_path: Path
) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    eml_root.mkdir()
    _write_events(
        event_root / "events.jsonl",
        [
            _event(
                event_id="evt-reparse",
                provider_id="reparse@example.test",
                message_id="reparse@example.test",
            )
        ],
    )
    original_lstat = link_module._lstat

    def fake_lstat(path: Path, *, missing_ok: bool = False):
        if Path(path) == eml_root:
            return SimpleNamespace(
                st_mode=stat.S_IFDIR,
                st_file_attributes=link_module._REPARSE_POINT_ATTRIBUTE,
            )
        return original_lstat(path, missing_ok=missing_ok)

    monkeypatch.setattr(link_module, "_lstat", fake_lstat)
    with pytest.raises(CustodyLinkError) as error:
        build_custody_link_index(
            event_roots=[event_root],
            eml_root=eml_root,
            output_path=tmp_path / "links.jsonl",
        )

    assert error.value.code == "reparse_forbidden"
    assert str(eml_root) not in str(error.value)


def test_cli_rejection_never_logs_mail_or_provider_content(
    capsys, tmp_path: Path
) -> None:
    event_root = tmp_path / "events"
    eml_root = tmp_path / "custody"
    provider_marker = "PRIVATE-PROVIDER-ID@example.test"
    subject_marker = "PRIVATE-SUBJECT-MARKER"
    address_marker = "private.address@example.test"
    _write_events(
        event_root / "events.jsonl",
        [
            _event(
                event_id="evt-safe-error",
                provider_id=provider_marker,
                message_id=provider_marker,
                subject=subject_marker,
                from_value=f"Private <{address_marker}>",
            )
        ],
    )
    _write_eml(eml_root, _raw_message(message_id="different@example.test"))

    exit_code = main(
        [
            "--event-root",
            str(event_root),
            "--eml-root",
            str(eml_root),
            "--output",
            str(tmp_path / "links.jsonl"),
        ]
    )
    captured = capsys.readouterr()

    assert exit_code == 2
    assert captured.out == ""
    assert json.loads(captured.err) == {
        "code": "unmatched_event",
        "event_id": "evt-safe-error",
        "ok": False,
    }
    for marker in (provider_marker, subject_marker, address_marker):
        assert marker not in captured.err
