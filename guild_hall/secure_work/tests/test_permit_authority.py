"""B1: a permit must prove more than "a well-shaped file exists in the job
directory". These tests drive a real job through the real engine and check
that dispatch only ever accepts a permit signed by the one trust key pinned in
config -- never a key the permit file itself supplies.

Every attacker key pair here is generated fresh, in pytest's own tmp_path, and
discarded at the end of the test process; nothing synthetic touches any real
pilot root.
"""
from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import pytest

from soulforge_secure_work import authority
from soulforge_secure_work.engine import BoundValuesUnavailable, EngineStop, Job, Lane


# --- keys init-pilot ---------------------------------------------------------

def test_generate_pilot_trust_keypair_refuses_inside_the_pilot_root(tmp_path):
    pilot_root = tmp_path / "pilot"
    pilot_root.mkdir()
    with pytest.raises(authority.PermitAuthorityError) as raised:
        authority.generate_pilot_trust_keypair(pilot_root / "keys", pilot_root)
    assert raised.value.code == "PERMIT_TRUST_KEYGEN_INSIDE_PILOT_ROOT"


def test_generate_pilot_trust_keypair_writes_hex_keys_and_a_warning(tmp_path):
    result = authority.generate_pilot_trust_keypair(tmp_path / "trust", tmp_path / "pilot")
    assert Path(result["pubkey_path"]).is_file()
    assert Path(result["signing_key_path"]).is_file()
    assert "BIND05" in result["warning"]
    fingerprint, _ = authority.load_trust_pubkey(Path(result["pubkey_path"]))
    assert fingerprint == result["fingerprint"]
    _, private_key = authority.load_trust_signing_key(Path(result["signing_key_path"]))
    assert private_key is not None


def test_load_trust_pubkey_fails_closed_when_unbound_or_missing(tmp_path):
    with pytest.raises(authority.PermitAuthorityError) as raised:
        authority.load_trust_pubkey(None)
    assert raised.value.code == "PERMIT_TRUST_UNBOUND"
    with pytest.raises(authority.PermitAuthorityError) as raised:
        authority.load_trust_pubkey(tmp_path / "absent.pub")
    assert raised.value.code == "PERMIT_TRUST_UNBOUND"


def test_load_trust_signing_key_fails_closed_when_unbound_or_missing(tmp_path):
    with pytest.raises(authority.PermitAuthorityError) as raised:
        authority.load_trust_signing_key(None)
    assert raised.value.code == "PERMIT_SIGNER_UNBOUND"
    with pytest.raises(authority.PermitAuthorityError) as raised:
        authority.load_trust_signing_key(tmp_path / "absent.key")
    assert raised.value.code == "PERMIT_SIGNER_UNBOUND"


# --- (b) no trust key bound: no permit is ever accepted ---------------------

def test_dispatch_refuses_every_permit_when_no_trust_key_is_bound(job_at_release_review):
    lane, job = job_at_release_review
    lane.approve_permit(job, "operator.cycle1.test")
    lane.advance(job, max_steps=1)  # RELEASE_REVIEW -> READY; step_ready does not check trust
    assert lane.phase(job) == "READY"

    unbound_config = dataclasses.replace(lane.config, permit_trust_pubkey_path=None)
    unbound_lane = Lane(unbound_config)
    reloaded = unbound_lane.load_job(job.job_id)
    with pytest.raises(EngineStop) as raised:
        unbound_lane.step_dispatch(reloaded)
    assert raised.value.code == "PERMIT_TRUST_UNBOUND"


def test_approve_permit_refuses_without_a_trust_signing_key(job_at_release_review):
    lane, job = job_at_release_review
    unbound_config = dataclasses.replace(lane.config, permit_trust_signing_key_path=None)
    unbound_lane = Lane(unbound_config)
    reloaded = unbound_lane.load_job(job.job_id)
    with pytest.raises(EngineStop) as raised:
        unbound_lane.approve_permit(reloaded, "operator.cycle1.test")
    assert raised.value.code == "PERMIT_SIGNER_UNBOUND"
    assert not reloaded.path("permit.json").is_file()


# --- (a) a permit this lane's own approval path never produced -------------

def test_dispatch_rejects_a_permit_whose_issuer_key_id_is_unknown(job_at_release_review):
    """The literal reviewer scenario: write permit.json directly with a
    self-generated key pair. `sfx permit approve` is never called."""
    lane, job = job_at_release_review
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    attacker_key = Ed25519PrivateKey.generate()
    body = job.path("body.bin").read_bytes()
    claims = lane.models.PermitClaims(
        protocol="sf.sewe.permit/1.0",
        permit_id="o_" + lane.codec.digest(body)[:32],
        job_id=job.job_id, mission_id=job.data["mission_id"], round=job.data["round"],
        request_sha256=lane.codec.digest(body), route_sha256=job.data["route_sha256"],
        review_ref=job.data["review_ref"], policy_epoch=job.data["policy_epoch"],
        audience=job.data.get("transport_id", lane.scripted.name),
        issued_utc=authority.utc_now(-1), expires_utc=authority.utc_now(300), max_uses=1,
    )
    forged = lane.permits.sign_for_test(claims, attacker_key, "attacker.own.key.id")
    record = {
        "schema": "soulforge.secure_work.permit.v0",
        "decision": "ALLOW",
        "actor_ref": "ATTACKER_NOT_THE_OPERATOR",
        "authority": "SYNTHETIC_PILOT_OPERATOR_NOT_CLASSIFICATION_AUTHORITY",
        "issuer_key_id": "attacker.own.key.id",
        "permit": json.loads(lane.codec.canonical(forged).decode("utf-8")),
    }
    job.path("permit.json").write_text(json.dumps(record) + "\n", encoding="utf-8")

    results = lane.advance(job, max_steps=2)
    assert results[-1]["state"] == "STOPPED"
    assert results[-1]["code"] == "PERMIT_ISSUER_UNKNOWN"
    # Rejected before the READY -> RUNNING transition was even attempted.
    assert lane.phase(job) == "READY"


def test_dispatch_rejects_a_permit_signed_by_the_wrong_key_even_with_a_matching_issuer_id(
        job_at_release_review):
    """Worst case: the attacker also guesses/copies the real trust fingerprint
    as `issuer_key_id`. The explicit issuer check alone would not catch this --
    only the cryptographic check inside `dispatch.send` does."""
    lane, job = job_at_release_review
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    attacker_key = Ed25519PrivateKey.generate()
    real_fingerprint, _ = authority.load_trust_pubkey(lane.config.permit_trust_pubkey_path)
    body = job.path("body.bin").read_bytes()
    claims = lane.models.PermitClaims(
        protocol="sf.sewe.permit/1.0",
        permit_id="o_" + lane.codec.digest(body)[:32],
        job_id=job.job_id, mission_id=job.data["mission_id"], round=job.data["round"],
        request_sha256=lane.codec.digest(body), route_sha256=job.data["route_sha256"],
        review_ref=job.data["review_ref"], policy_epoch=job.data["policy_epoch"],
        audience=job.data.get("transport_id", lane.scripted.name),
        issued_utc=authority.utc_now(-1), expires_utc=authority.utc_now(300), max_uses=1,
    )
    forged = lane.permits.sign_for_test(claims, attacker_key, real_fingerprint)
    record = {
        "schema": "soulforge.secure_work.permit.v0",
        "decision": "ALLOW",
        "actor_ref": "ATTACKER_NOT_THE_OPERATOR",
        "authority": "SYNTHETIC_PILOT_OPERATOR_NOT_CLASSIFICATION_AUTHORITY",
        "issuer_key_id": real_fingerprint,
        "permit": json.loads(lane.codec.canonical(forged).decode("utf-8")),
    }
    job.path("permit.json").write_text(json.dumps(record) + "\n", encoding="utf-8")

    results = lane.advance(job, max_steps=2)
    assert results[-1]["state"] == "STOPPED"
    assert results[-1]["code"] == "PERMIT_INVALID"
    assert results[-1]["detail"] == "PERMIT_SIGNATURE"
    # Never reached a delivered/quarantined result.
    assert lane.phase(job) != "RESULT_QUARANTINED"


# --- (d) expiry and reuse ----------------------------------------------------

def test_dispatch_rejects_an_expired_but_genuinely_signed_permit(job_at_release_review, monkeypatch):
    lane, job = job_at_release_review
    import soulforge_secure_work.engine as engine_module

    monkeypatch.setattr(engine_module, "PERMIT_LIFETIME_SECONDS", -5)
    lane.approve_permit(job, "operator.cycle1.test")
    results = lane.advance(job, max_steps=2)
    assert results[-1]["state"] == "STOPPED"
    assert results[-1]["code"] == "PERMIT_INVALID"
    assert results[-1]["detail"] == "PERMIT_EXPIRED"


def test_dispatch_rejects_a_replayed_attempt(job_at_release_review, scripted_python_executable, tmp_path):
    if not scripted_python_executable or not Path(scripted_python_executable).is_file():
        pytest.skip("no bound scripted interpreter; set SOULFORGE_SECURE_WORK_CONFIG")
    lane, job = job_at_release_review
    lane.approve_permit(job, "operator.cycle1.test")
    record = lane._permit_record(job)
    fingerprint, trust_pubkey = authority.load_trust_pubkey(lane.config.permit_trust_pubkey_path)
    public_keys = {fingerprint: trust_pubkey}
    permit = lane.models.SignedPermit.model_validate(record["permit"])
    body = job.path("body.bin").read_bytes()
    transport_id = job.data.get("transport_id", lane.scripted.name)

    from soulforge_secure_work.engine import _BoundTransport

    handle = lane.open_journal(job)
    try:
        transport = _BoundTransport(lane.scripted, tmp_path / "workdir1")
        (tmp_path / "workdir1").mkdir()
        dispatch = lane.runtime.DispatchReference(handle, transport, public_keys)
        attempt_id = "o_" + "a" * 32
        state, reply = dispatch.send(
            attempt_id, permit, body, job.data["route_sha256"], job.job_id,
            job.data["mission_id"], job.data["round"], job.data["review_ref"],
            job.data["policy_epoch"], transport_id, authority.utc_now())
        assert state == "RESPONSE_RECEIVED"

        with pytest.raises(lane.codec.ContractViolation) as raised:
            dispatch.send(
                attempt_id, permit, body, job.data["route_sha256"], job.job_id,
                job.data["mission_id"], job.data["round"], job.data["review_ref"],
                job.data["policy_epoch"], transport_id, authority.utc_now())
        assert raised.value.code == "PERMIT_REPLAY"
    finally:
        handle.close()


# --- (c) a genuinely approved permit is accepted ----------------------------

def test_dispatch_accepts_a_genuinely_approved_permit(job_at_release_review, scripted_python_executable):
    if not scripted_python_executable or not Path(scripted_python_executable).is_file():
        pytest.skip("no bound scripted interpreter; set SOULFORGE_SECURE_WORK_CONFIG")
    lane, job = job_at_release_review
    record = lane.approve_permit(job, "operator.cycle1.test")
    assert record["issuer_key_id"]
    assert "public_key_hex" not in record  # the self-referential field is gone, not just unused

    results = lane.advance(job, max_steps=2)
    assert lane.phase(job) == "RESULT_QUARANTINED"
    dispatch_result = next(r for r in results if r.get("action") == "step_dispatch")
    assert dispatch_result["state"] == "ADVANCED"
    assert dispatch_result["receipt"]
    assert job.data["external_network_calls"] == 0


# --- N1: the leak guard must fail closed, not open --------------------------

def test_leak_guard_fails_closed_when_a_bound_value_cannot_be_resolved(hermetic_lane):
    lane = hermetic_lane
    job = Job(lane.config, "o_" + "1" * 32, {"mission_id": "o_" + "2" * 32})
    job.root.mkdir(parents=True, exist_ok=True)
    job.path("bindings_digest.json").write_text(json.dumps({
        "slot_ids": ["o_" + "9" * 32],
        "source_bundle_sha256": "0" * 64,
    }), encoding="utf-8")

    with pytest.raises(BoundValuesUnavailable):
        lane._bound_values(job)

    with pytest.raises(EngineStop) as raised:
        lane.append_event(job, "test.probe", "PHASE_A", "PHASE_B", "evidence.test")
    assert raised.value.code == "LEAK_GUARD_UNAVAILABLE"

    with pytest.raises(EngineStop) as raised:
        lane.write_receipt(job, 1, "test.probe", {})
    assert raised.value.code == "LEAK_GUARD_UNAVAILABLE"


def test_leak_guard_stays_empty_before_any_binding_exists(hermetic_lane):
    """No `bindings_digest.json` yet means nothing has been sealed -- an empty
    list is the correct answer there, not a fallback."""
    lane = hermetic_lane
    job = Job(lane.config, "o_" + "3" * 32, {"mission_id": "o_" + "4" * 32})
    job.root.mkdir(parents=True, exist_ok=True)
    assert lane._bound_values(job) == []


# --- N3: the engine must never select the external transport ---------------

def test_dispatch_never_selects_the_openrouter_transport(job_at_release_review, scripted_python_executable):
    if not scripted_python_executable or not Path(scripted_python_executable).is_file():
        pytest.skip("no bound scripted interpreter; set SOULFORGE_SECURE_WORK_CONFIG")
    lane, job = job_at_release_review
    lane.approve_permit(job, "operator.cycle1.test")

    calls = {"scripted": 0, "openrouter": 0}

    class SpyScripted:
        name = "scripted.subprocess"

        def send_exact(self, body, workdir):
            calls["scripted"] += 1
            return b"{}"

    class SpyOpenRouter:
        name = "openrouter.https"

        def send_exact(self, body, workdir):
            calls["openrouter"] += 1
            raise AssertionError("engine must never dispatch through the external transport")

    lane.scripted = SpyScripted()
    lane.openrouter = SpyOpenRouter()
    lane.advance(job, max_steps=2)  # RELEASE_REVIEW -> READY -> RESULT_QUARANTINED
    assert calls == {"scripted": 1, "openrouter": 0}
