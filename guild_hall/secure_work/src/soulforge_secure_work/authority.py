"""M05 release authority: field review ledger and one-use permits.

Two separate approvals live here.

1. Field review. A field may appear in a packet as its exact literal text only
   when an entry in the review ledger names that field's review reference and
   matches the digest of the exact field. The ledger is an operator file outside
   this repository; nothing in this lane writes an approval into it.
2. Packet permit. A permit binds the exact request bytes, the route digest, the
   job, the mission, the round, the review reference and the policy epoch. It is
   single use and expires. `sfx permit approve` is the only way one is created.

The signing key is generated at approval time and discarded immediately; only
the public key and the signed permit are stored. That keeps the permit
verifiable and un-forgeable by a later run, and matches the kit's own
`SYNTHETIC_TEST_ONLY_NOT_AUTHORITY` label for this signing path.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


def utc_now(offset_seconds: int = 0) -> str:
    moment = datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


class FieldReviewLedger:
    """Read-only view of the operator-owned field review file."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._entries: dict[str, dict] = {}
        self.synthetic = False
        self.loaded = False
        if self.path.is_file():
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if data.get("schema") != "soulforge.secure_work.field_reviews.v0":
                raise RuntimeError("FIELD_REVIEW_SCHEMA_MISMATCH")
            self.synthetic = bool(data.get("synthetic_pilot"))
            for entry in data.get("entries", []):
                self._entries[str(entry["review_ref"])] = entry
            self.loaded = True

    def verify(self, review_ref: str, field_digest: str, policy_epoch: int) -> bool:
        entry = self._entries.get(review_ref)
        if entry is None:
            return False
        return (entry.get("field_sha256") == field_digest
                and int(entry.get("policy_epoch", -1)) == int(policy_epoch))

    def missing(self, expected: list[tuple[str, str, int]]) -> list[str]:
        return [ref for ref, digest, epoch in expected if not self.verify(ref, digest, epoch)]


def write_review_request(path: Path, job_id: str, expected: list[dict]) -> None:
    """Write what the operator would have to approve. Not an approval."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "schema": "soulforge.secure_work.field_review_request.v0",
        "job_id": job_id,
        "state": "FIELD_REVIEW_REQUIRED",
        "note": "Approval is an operator action outside this CLI.",
        "entries": expected,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def issue_permit(models, permits, canonical, digest, *, job_id: str, mission_id: str,
                 round_index: int, body: bytes, route_digest: str, review_ref: str,
                 policy_epoch: int, audience: str, lifetime_seconds: int,
                 actor_ref: str) -> tuple[dict, str]:
    """Sign a one-use permit and return (stored record, public key hex)."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    claims = models.PermitClaims(
        protocol="sf.sewe.permit/1.0",
        permit_id="o_" + digest(body)[:32],
        job_id=job_id,
        mission_id=mission_id,
        round=round_index,
        request_sha256=digest(body),
        route_sha256=route_digest,
        review_ref=review_ref,
        policy_epoch=policy_epoch,
        audience=audience,
        issued_utc=utc_now(-1),
        expires_utc=utc_now(lifetime_seconds),
        max_uses=1,
    )
    private_key = Ed25519PrivateKey.generate()
    key_id = f"permit.{job_id}"
    permit = permits.sign_for_test(claims, private_key, key_id)
    public_hex = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    ).hex()
    del private_key
    record = {
        "schema": "soulforge.secure_work.permit.v0",
        "decision": "ALLOW",
        "actor_ref": actor_ref,
        "authority": "SYNTHETIC_PILOT_OPERATOR_NOT_CLASSIFICATION_AUTHORITY",
        "key_id": key_id,
        "public_key_hex": public_hex,
        "permit": json.loads(canonical(permit).decode("utf-8")),
    }
    return record, public_hex


def load_public_key(public_hex: str):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    return Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_hex))
