"""M10 client binding and durable, metadata-only submission reconciliation.

The authorization verifier is deliberately NOT configurable from job JSON. The
runtime verifier uses an independently pinned installation binding; that binding
is absent in the source checkout. Tests inject synthetic trust and OS evidence.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

MAX_CANDIDATE_BYTES = 1048576
MAX_RESPONSE_BYTES = 32768
STATUS_FIELDS = {"submission_id", "lane", "project_hint", "status", "sha256", "size",
                 "official_history_written", "source_deleted"}


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
                      allow_nan=False).encode("utf-8")


def binding_digest(binding: dict) -> str:
    return hashlib.sha256(canonical(binding)).hexdigest()


@dataclass(frozen=True)
class CustodyAuthorization:
    """In-process verifier result, never accepted from a request or config file."""
    binding_sha256: str
    account_id: str
    device_id: str
    agent_id: str
    expires_at: float


def deposit(adapter, candidate_path: Path, project_hint: str, occurrence_id: str,
            idempotency_key: str, *, input_revision: str | None,
            expected_sha256: str | None, expected_size: int | None) -> dict:
    from .adapters import AdapterUnavailable

    def fail(code):
        raise AdapterUnavailable("M10", code)

    probe = adapter.probe()
    if probe.state != "AVAILABLE":
        fail(probe.detail)
    if adapter.authorization is None:
        fail("CUSTODY_AUTHORIZATION_UNBOUND")
    if (not isinstance(project_hint, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", project_hint)
            or not isinstance(occurrence_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}", occurrence_id)
            or not isinstance(idempotency_key, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}", idempotency_key)
            or not isinstance(input_revision, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", input_revision)
            or not isinstance(expected_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_sha256)
            or type(expected_size) is not int or not 1 <= expected_size <= MAX_CANDIDATE_BYTES):
        fail("CUSTODY_BINDING_REQUIRED")
    path = Path(candidate_path)
    try:
        if path.is_symlink() or not path.is_file():
            fail("CUSTODY_CANDIDATE_INVALID")
        with path.open("rb") as source:
            body = source.read(MAX_CANDIDATE_BYTES + 1)
    except OSError:
        fail("CUSTODY_CANDIDATE_UNAVAILABLE")
    if len(body) != expected_size or hashlib.sha256(body).hexdigest() != expected_sha256:
        fail("CUSTODY_CANDIDATE_CHANGED")
    del body
    binding = {"project_hint": project_hint, "occurrence_id": occurrence_id,
               "idempotency_key": idempotency_key, "input_revision": input_revision,
               "sha256": expected_sha256, "size": expected_size,
               "route_sha256": hashlib.sha256(adapter.ingress_url.encode()).hexdigest()}

    def authorize():
        try:
            proof = adapter.authorization(dict(binding))
        except AdapterUnavailable:
            raise
        except Exception:
            fail("CUSTODY_AUTHORIZATION_DENIED")
        if (type(proof) is not CustodyAuthorization or proof.binding_sha256 != binding_digest(binding)
                or type(proof.expires_at) not in (int, float) or not time.time() < proof.expires_at <= time.time() + 300
                or any(not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", value)
                       for value in (proof.account_id, proof.device_id, proof.agent_id))):
            fail("CUSTODY_AUTHORIZATION_DENIED")
        return proof

    proof = authorize()
    principal = {"account_id": proof.account_id, "device_id": proof.device_id, "agent_id": proof.agent_id}
    intent_digest = binding_digest({**binding, "principal": principal})
    with closing(sqlite3.connect(path.parent / "custody.sqlite", timeout=5)) as db:
        db.execute("PRAGMA synchronous=FULL")
        db.execute("CREATE TABLE IF NOT EXISTS submissions (key TEXT PRIMARY KEY, binding TEXT NOT NULL, submission TEXT, status TEXT)")
        db.execute("CREATE TABLE IF NOT EXISTS quarantine (digest TEXT PRIMARY KEY, code TEXT NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT binding, submission, status FROM submissions WHERE key=?", (idempotency_key,)).fetchone()
        if row and row[0] != intent_digest:
            fail("CUSTODY_IDEMPOTENCY_CONFLICT")
        if not row:
            db.execute("INSERT INTO submissions VALUES (?, ?, NULL, NULL)", (idempotency_key, intent_digest))
        db.commit()  # durable intent exists before the first sending boundary
        current = authorize()
        if (current.account_id, current.device_id, current.agent_id) != (proof.account_id, proof.device_id, proof.agent_id):
            fail("CUSTODY_AUTHORIZATION_CHANGED")
        request = {"action": "status" if row and row[1] else "upload", "binding": dict(binding),
                   "candidate_path": str(path.resolve()), "principal": dict(principal),
                   "authorization_expires_at": current.expires_at,
                   "submission_id": row[1] if row else None, "ingress_url": adapter.ingress_url}
        try:
            response = adapter._execute(request)
        except Exception:
            fail("CUSTODY_TRANSPORT_UNAVAILABLE")
        try:
            raw = canonical(response)
            valid = (len(raw) <= MAX_RESPONSE_BYTES and type(response) is dict and set(response) == STATUS_FIELDS
                     and isinstance(response["submission_id"], str)
                     and re.fullmatch(r"sfigsub_[a-f0-9]{32}", response["submission_id"])
                     and (not row or not row[1] or response["submission_id"] == row[1])
                     and response["lane"] == "team_files" and response["project_hint"] == project_hint
                     and response["sha256"] == expected_sha256 and type(response["size"]) is int
                     and response["size"] == expected_size
                     and response["status"] in {"pending_server_ack", "verified_server_ack"}
                     and response["official_history_written"] is False and response["source_deleted"] is False)
        except (TypeError, ValueError, KeyError, RecursionError):
            raw, valid = b"unserializable", False
        if not valid:
            db.execute("INSERT OR IGNORE INTO quarantine VALUES (?, ?)",
                       (hashlib.sha256(raw).hexdigest(), "CUSTODY_RESPONSE_QUARANTINED"))
            db.commit()  # no untrusted body, field, path, exception or claim is retained
            fail("CUSTODY_RESPONSE_QUARANTINED")
        db.execute("BEGIN IMMEDIATE")
        current_row = db.execute("SELECT binding, submission, status FROM submissions WHERE key=?",
                                 (idempotency_key,)).fetchone()
        if (not current_row or current_row[0] != intent_digest
                or (current_row[1] and current_row[1] != response["submission_id"])):
            fail("CUSTODY_IDEMPOTENCY_CONFLICT")
        if current_row[2] == "verified_server_ack" and response["status"] != current_row[2]:
            fail("CUSTODY_ACK_REGRESSION")
        # The remote request may already have taken effect. Recheck the exact
        # current authority after its reply and before changing local ACK state;
        # a denial leaves the durable intent available for later reconciliation.
        current = authorize()
        if (current.account_id, current.device_id, current.agent_id) != (proof.account_id, proof.device_id, proof.agent_id):
            fail("CUSTODY_AUTHORIZATION_CHANGED")
        db.execute("UPDATE submissions SET submission=?, status=? WHERE key=?",
                   (response["submission_id"], response["status"], idempotency_key))
        if time.time() >= current.expires_at:
            fail("CUSTODY_AUTHORIZATION_DENIED")
        db.commit()  # an ACK is exposed only after durable local binding succeeds
    return {**binding, "binding_sha256": intent_digest,
            "submission_id": response["submission_id"], "ingress_status": response["status"],
            "server_acknowledged": response["status"] == "verified_server_ack",
            "submission_state": "RECEIVED", "review_state": "NOT_OBSERVED", "accepted": False}
