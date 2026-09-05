"""M05 release authority: field review ledger and one-use permits.

Two separate approvals live here.

1. Field review. A field may appear in a packet as its exact literal text only
   when an entry in the review ledger names that field's review reference and
   matches the digest of the exact field. The ledger is an operator file outside
   this repository; nothing in this lane writes an approval into it.
2. Packet permit. A permit binds the exact request bytes, the route digest, the
   job, the mission, the round, the review reference and the policy epoch. It is
   single use and expires. `sfx permit approve` is the only way one is created.

The public half is stored beside the permit, so the signature proves the
record is internally consistent -- it does NOT by itself prove who approved.
What makes a permit trustworthy is that it is signed with a persistent trust
key the Owner places outside this repository (`permit_trust_signing_key_path`),
and that verification always re-reads the matching public key from its own
pinned location (`permit_trust_pubkey_path`) rather than from the permit file
being checked. There is still no trusted *identity* registry in cycle 1: the
signing key answers "was this issued by the thing that holds the trust key",
not "which person decided this". That is why the kit labels this signing path
`SYNTHETIC_TEST_ONLY_NOT_AUTHORITY`, and why BIND09 (identity binding for the
permit signer) has to close before BIND05 (the external route) opens.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

TRUST_KEY_ID_PREFIX = "trust."

# Shown to stdout and written to a README next to any pilot key this lane
# generates for itself. Not a permission check -- a legibility one, so nobody
# mistakes a keygen convenience for an Owner-issued credential.
PILOT_KEY_WARNING = (
    "SYNTHETIC PILOT KEY -- test only. Replace with an Owner-issued key "
    "before enabling BIND05 (the external route)."
)


class PermitAuthorityError(RuntimeError):
    """A bounded, code-carrying failure of the permit trust machinery. Never a payload."""

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.detail = detail
        super().__init__(code if not detail else f"{code}: {detail}")


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


def _trust_fingerprint(raw_public_key: bytes) -> str:
    return TRUST_KEY_ID_PREFIX + hashlib.sha256(raw_public_key).hexdigest()[:32]


def _read_hex_line(path: Path) -> bytes:
    text = path.read_text(encoding="utf-8").strip()
    try:
        raw = bytes.fromhex(text)
    except ValueError:
        raise PermitAuthorityError("PERMIT_TRUST_KEY_MALFORMED", str(path)) from None
    if len(raw) != 32:
        raise PermitAuthorityError("PERMIT_TRUST_KEY_MALFORMED", str(path))
    return raw


def _write_hex_line(path: Path, raw: bytes) -> None:
    path.write_text(raw.hex() + "\n", encoding="utf-8")


def load_trust_pubkey(path: Path | None):
    """The one key permits are ever checked against. Fails closed, never guesses."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    if path is None or not Path(path).is_file():
        raise PermitAuthorityError("PERMIT_TRUST_UNBOUND", str(path) if path else "not configured")
    raw = _read_hex_line(Path(path))
    return _trust_fingerprint(raw), Ed25519PublicKey.from_public_bytes(raw)


def load_trust_signing_key(path: Path | None):
    """The matching private half. Only `sfx permit approve` ever calls this."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    if path is None or not Path(path).is_file():
        raise PermitAuthorityError("PERMIT_SIGNER_UNBOUND", str(path) if path else "not configured")
    raw = _read_hex_line(Path(path))
    private_key = Ed25519PrivateKey.from_private_bytes(raw)
    public_raw = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw)
    return _trust_fingerprint(public_raw), private_key


def generate_pilot_trust_keypair(out_dir: Path, pilot_root: Path) -> dict:
    """`sfx keys init-pilot --out <dir>`. Synthetic-pilot convenience only.

    Refuses to write inside the pilot root -- key material and mission data
    stay in separate places even for a throwaway pilot key -- and never
    overwrites an existing key pair.
    """
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    from . import winsec

    resolved_out = Path(out_dir).resolve()
    resolved_pilot = Path(pilot_root).resolve()
    if resolved_out == resolved_pilot or resolved_pilot in resolved_out.parents:
        raise PermitAuthorityError("PERMIT_TRUST_KEYGEN_INSIDE_PILOT_ROOT", str(resolved_out))
    key_path = resolved_out / "permit_trust.key"
    pub_path = resolved_out / "permit_trust.pub"
    if key_path.exists() or pub_path.exists():
        raise PermitAuthorityError("PERMIT_TRUST_KEYGEN_ALREADY_EXISTS", str(resolved_out))
    resolved_out.mkdir(parents=True, exist_ok=True)

    private_key = Ed25519PrivateKey.generate()
    private_raw = private_key.private_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption())
    public_raw = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw)
    fingerprint = _trust_fingerprint(public_raw)
    del private_key

    _write_hex_line(key_path, private_raw)
    del private_raw
    _write_hex_line(pub_path, public_raw)
    key_lockdown = winsec.restrict_to_current_user(key_path)
    (resolved_out / "README_PILOT_KEY.txt").write_text(
        f"{PILOT_KEY_WARNING}\nfingerprint: {fingerprint}\n"
        f"acl_lockdown: attempted={key_lockdown.attempted} applied={key_lockdown.applied} "
        f"detail={key_lockdown.detail}\n",
        encoding="utf-8")
    return {
        "pubkey_path": str(pub_path),
        "signing_key_path": str(key_path),
        "fingerprint": fingerprint,
        "warning": PILOT_KEY_WARNING,
        "acl_lockdown": key_lockdown.as_dict(),
    }


def issue_permit(models, permits, canonical, digest, *, job_id: str, mission_id: str,
                 round_index: int, body: bytes, route_digest: str, review_ref: str,
                 policy_epoch: int, audience: str, lifetime_seconds: int,
                 actor_ref: str, trust_signing_key_path: Path | None) -> tuple[dict, str]:
    """Sign a one-use permit with the pinned trust key. Returns (stored record, fingerprint).

    Raises `PermitAuthorityError(PERMIT_SIGNER_UNBOUND)` if no trust signing key
    is configured or the file it names is absent -- this function never falls
    back to generating its own key pair.
    """
    fingerprint, private_key = load_trust_signing_key(trust_signing_key_path)
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
    permit = permits.sign_for_test(claims, private_key, fingerprint)
    del private_key
    record = {
        "schema": "soulforge.secure_work.permit.v0",
        "decision": "ALLOW",
        "actor_ref": actor_ref,
        "authority": "SYNTHETIC_PILOT_OPERATOR_NOT_CLASSIFICATION_AUTHORITY",
        "issuer_key_id": fingerprint,
        "permit": json.loads(canonical(permit).decode("utf-8")),
    }
    return record, fingerprint
