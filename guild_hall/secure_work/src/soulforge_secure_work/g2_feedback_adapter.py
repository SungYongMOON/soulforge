"""Fixed feedback codec candidate using E14 DTOs/review/permit primitives.

No approval, signing, key generation, model call, or transport lives here.
SOURCE preparation and SENDER verification use distinct installed processes.
"""
from __future__ import annotations

import base64
import hashlib
import json
import sys

PROFILE_FIELDS = {"codec_id", "version", "job_id", "mission_id", "round", "review_ref",
                  "producer_ref", "publisher_ref", "projection_ref", "scope_ref", "kind",
                  "allowed_write_paths", "acceptance_checks", "valid_from", "valid_until",
                  "generation", "field_review_ref", "audience", "qualification_ref",
                  "receiver_sha256", "control_root_sha256"}
EVIDENCE_FIELDS = {"selection", "source_binding", "source_bundle_sha256", "field_sha256",
                   "field_span_end", "work", "profile_sha256", "grant_sha256", "route_sha256"}


def require(value, code="FEEDBACK_ADAPTER_HOLD"):
    if not value:
        raise ValueError(code)


def exact(value, fields):
    require(isinstance(value, dict) and set(value) == set(fields))


def api():
    from sf_sewe import codec, models, projection, permits
    return codec, models, projection, permits


def profile_check(profile, grant):
    codec, models, _, _ = api()
    exact(profile, PROFILE_FIELDS)
    require(profile["codec_id"] == "feedback.exact.v1" and profile["version"] == "0.1.0")
    for name in ("job_id", "mission_id"):
        require(isinstance(profile[name], str) and len(profile[name]) == 34 and profile[name].startswith("o_"))
    require(profile["round"] == 0 and type(profile["generation"]) is int and profile["generation"] > 0)
    require(profile["producer_ref"] == grant["g2_leader_ref"] and profile["scope_ref"] == grant["scope_ref"])
    require(profile["producer_ref"] != profile["publisher_ref"])
    require(profile["kind"] in ("bug", "feature", "improvement") and profile["kind"] in grant["allowed_kinds"])
    for key in ("allowed_write_paths", "acceptance_checks"):
        values = profile[key]
        require(isinstance(values, list) and values and len(values) == len(set(values))
                and all(value in grant[key] for value in values), "FEEDBACK_GRANT_WIDENING")
    require(profile["qualification_ref"] and profile["audience"], "FEEDBACK_RECEIVER_UNQUALIFIED")
    import re
    require(all(isinstance(profile[key], str) and re.fullmatch(r"[a-f0-9]{64}", profile[key])
                for key in ("receiver_sha256", "control_root_sha256")), "FEEDBACK_RECEIVER_UNBOUND")
    require(codec.utc_seconds(profile["valid_from"]) < codec.utc_seconds(profile["valid_until"]))
    # The G1 grant uses ISO timestamps, including optional milliseconds.
    from datetime import datetime
    stamp = lambda value: datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    require(stamp(grant["valid_from"]) <= stamp(profile["valid_from"])
            < stamp(profile["valid_until"]) <= stamp(grant["valid_until"]), "FEEDBACK_GRANT_EXPIRY")


def source_field(wrapper_bytes, selection, assignment):
    codec, models, _, _ = api()
    wrapper = codec.strict_loads(wrapper_bytes)
    exact(wrapper, {"schema_version", "kind", "object_id", "content_sha256", "object"})
    issue = wrapper["object"]
    require(wrapper["kind"] == "issues" and wrapper["object_id"] == selection["issue_id"]
            and issue["id"] == selection["issue_id"]
            and wrapper["content_sha256"] == selection["issue_content_sha256"])
    require(wrapper_bytes == codec.canonical(wrapper) + b"\n", "FEEDBACK_SOURCE_BYTES")
    require("sha256:" + codec.digest(issue) == selection["issue_content_sha256"], "FEEDBACK_SOURCE_BYTES")
    summary = issue.get("description")
    require(isinstance(summary, str) and 0 < len(summary) <= 2000, "FEEDBACK_SUMMARY_REQUIRED")
    source_ref = "linear.issue:" + selection["issue_id"]
    revision = selection["issue_content_sha256"][7:]
    binding = models.SourceBinding(project_ref=selection["scope_ref"], assignment_ref=assignment["assignment_ref"],
        assignment_epoch=assignment["assignment_epoch"], sources=[models.SourcePin(source_ref=source_ref,
        revision=revision, sha256=codec.digest(wrapper_bytes))])
    # The span covers the complete JSON source record; the extraction rule is
    # exactly object.description, never a guessed substring or model mapping.
    field = models.PrivateField(field_id="feedback.summary", source_ref=source_ref,
        source_revision=revision, span_start=0, span_end=len(wrapper_bytes), value=summary,
        role="text", status="PROPOSAL", dependencies=[], classification="RELEASE_CANDIDATE")
    return binding, field


def route_digest(route, profile):
    codec, models, _, _ = api()
    value = models.RouteProfile.model_validate(route)
    require(value.codec_id == "feedback.exact.v1", "FEEDBACK_CODEC_UNBOUND")
    return codec.digest({"route": value.model_dump(mode="json"),
        "header_profile_sha256": codec.digest({"content-type": "application/json"}),
        "codec_version": "0.1.0", "destination_profile": value.transport_id,
        "destination_binding_sha256": profile["receiver_sha256"], "publication_store_sha256": profile["control_root_sha256"]})


def scope_digest(evidence):
    codec, _, _, _ = api()
    exact(evidence, EVIDENCE_FIELDS)
    # Closed candidate scope interpretation for the existing PolicyReview DTO.
    # The independent reviewer must use these same bytes; no new ALLOW record.
    return codec.digest(evidence)


def prepare_data(wrapper_bytes, selection, profile, grant, route, identity, ledger):
    codec, models, projector, _ = api()
    profile_check(profile, grant)
    require(identity["purpose"] == "SOURCE" and identity["principal_ref"] == profile["producer_ref"]
            and identity["project_ref"] == profile["scope_ref"], "FEEDBACK_PREPARER_ROLE")
    require(codec.utc_seconds(profile["valid_until"]) * 1000 <= identity["expires_at"], "FEEDBACK_SOURCE_AUTHORITY_EXPIRY")
    binding, field = source_field(wrapper_bytes, selection, identity)
    source = models.SourceBundle(protocol="sf.sewe.private-source/1.0", binding=binding,
        fields=[field], extraction_complete=True, gaps=[])
    work = models.WorkDefinition(work_type="feedback.code", revision="0.1.0",
        instructions="Use only the reviewed code requirement.", section_titles={"summary": "Reviewed requirement"},
        required_sections=["summary"], output_profile="feedback.exact.v1", max_rounds=1, validators=["feedback.exact.v1"])
    plan = models.ProjectionPlan(protocol="sf.sewe.projection-plan/1.0", mission_id=profile["mission_id"], round=0,
        base_candidate_rev="none", source_bundle_sha256=codec.digest(source), work_definition_sha256=codec.digest(work),
        policy_epoch=identity["policy_epoch"], rules=[models.FieldRule(field_id=field.field_id,
        action="KEEP_REVIEWED", section_ids=["summary"], required=True, review_ref=profile["field_review_ref"])])
    packet = projector.project(models.ProjectInput(source=source, plan=plan, work=work), ledger.verify).packet
    projection = {"projection_ref": profile["projection_ref"], "producer_ref": profile["producer_ref"],
        "content_class": "public_safe_code", "issue_id": selection["issue_id"],
        "issue_content_sha256": selection["issue_content_sha256"], "scope_ref": profile["scope_ref"],
        "kind": profile["kind"], "summary": field.value, "allowed_write_paths": profile["allowed_write_paths"],
        "acceptance_checks": profile["acceptance_checks"], "valid_from": profile["valid_from"],
        "valid_until": profile["valid_until"], "echo": None}
    body = codec.canonical(projection)
    require(len(body) <= route["max_request_bytes"], "FEEDBACK_ROUTE_SIZE")
    route_sha = route_digest(route, profile)
    require(route["transport_id"] == profile["audience"] and route_sha == identity["route_sha256"]
            and profile["audience"] == identity["audience"], "FEEDBACK_ROUTE_UNBOUND")
    prepared = models.PreparedRequest(request_id=profile["job_id"], job_id=profile["job_id"],
        mission_id=profile["mission_id"], round=0, packet_sha256=codec.digest(packet), review_ref=profile["review_ref"],
        body=models.ResourceRef(object_id=profile["job_id"], revision="feedback.v1", sha256=codec.digest(body),
            media_type="application/json", byte_length=len(body), classification="RELEASE_CANDIDATE"),
        route_sha256=route_sha, codec_version="0.1.0", header_profile_sha256=codec.digest({"content-type": "application/json"}))
    evidence = {"selection": selection, "source_binding": binding.model_dump(mode="json"),
        "source_bundle_sha256": codec.digest(source), "field_sha256": codec.digest(field), "field_span_end": len(wrapper_bytes),
        "work": work.model_dump(mode="json"), "profile_sha256": codec.digest(profile),
        "grant_sha256": codec.digest(grant), "route_sha256": route_sha}
    return {"body": body, "packet": codec.canonical(packet), "prepared": codec.canonical(prepared), "evidence": codec.canonical(evidence)}


def verify_data(parts, profile, grant, route, review, record, identity, ledger, public_keys, now_utc):
    codec, models, _, permits = api()
    profile_check(profile, grant)
    require(identity["purpose"] == "G3_PROVIDER" and identity["principal_ref"] == profile["publisher_ref"]
            and identity["project_ref"] == profile["scope_ref"], "FEEDBACK_PUBLISHER_ROLE")
    require(codec.utc_seconds(profile["valid_until"]) * 1000 <= identity["expires_at"], "FEEDBACK_PUBLISHER_AUTHORITY_EXPIRY")
    packet = codec.decode(models.WorkPacket, parts["packet"])
    prepared = codec.decode(models.PreparedRequest, parts["prepared"])
    evidence = codec.strict_loads(parts["evidence"])
    body = parts["body"]
    require(len(body) <= route["max_request_bytes"], "FEEDBACK_ROUTE_SIZE")
    projection = codec.strict_loads(body)
    require(body == codec.canonical(projection), "FEEDBACK_BODY_CHANGED")
    policy = models.PolicyReview.model_validate(review)
    exact(evidence, EVIDENCE_FIELDS)
    require(policy.decision == "ALLOW" and policy.mode == "HUMAN_REVIEWED_EXACT"
            and codec.utc_seconds(now_utc) < codec.utc_seconds(policy.expires_utc), "FEEDBACK_REVIEW_REQUIRED")
    require(policy.review_ref == profile["review_ref"] == prepared.review_ref
            and policy.packet_digest == codec.digest(packet) == prepared.packet_sha256
            and policy.work_digest == codec.digest(evidence["work"])
            and policy.scope_digest == scope_digest(evidence)
            and policy.policy_epoch == identity["policy_epoch"], "FEEDBACK_REVIEW_BINDING")
    require(evidence["profile_sha256"] == codec.digest(profile) and evidence["grant_sha256"] == codec.digest(grant)
            and evidence["route_sha256"] == route_digest(route, profile) == prepared.route_sha256 == identity["route_sha256"]
            and profile["audience"] == route["transport_id"] == identity["audience"], "FEEDBACK_CURRENT_BINDING")
    binding = models.SourceBinding.model_validate(evidence["source_binding"])
    require(binding.project_ref == profile["scope_ref"] and binding.assignment_ref == identity["assignment_ref"]
            and binding.assignment_epoch == identity["assignment_epoch"] and len(binding.sources) == 1)
    require(len(packet.facts) == 1 and len(packet.facts[0].segments) == 1
            and packet.facts[0].segments[0].kind == "literal" and not packet.slots and not packet.asset_slots,
            "FEEDBACK_PACKET_MAPPING")
    summary = packet.facts[0].segments[0].text
    pin = binding.sources[0]
    field = models.PrivateField(field_id="feedback.summary", source_ref=pin.source_ref, source_revision=pin.revision,
        span_start=0, span_end=evidence["field_span_end"], value=summary, role="text", status="PROPOSAL",
        dependencies=[], classification="RELEASE_CANDIDATE")
    source = models.SourceBundle(protocol="sf.sewe.private-source/1.0", binding=binding, fields=[field], extraction_complete=True, gaps=[])
    require(codec.digest(field) == evidence["field_sha256"] and codec.digest(source) == evidence["source_bundle_sha256"]
            and ledger.verify(profile["field_review_ref"], codec.digest(field), identity["policy_epoch"]), "FEEDBACK_FIELD_REVIEW_REQUIRED")
    selected = evidence["selection"]
    expected = {"projection_ref": profile["projection_ref"], "producer_ref": profile["producer_ref"], "content_class": "public_safe_code",
        "issue_id": selected["issue_id"], "issue_content_sha256": selected["issue_content_sha256"], "scope_ref": profile["scope_ref"],
        "kind": profile["kind"], "summary": summary, "allowed_write_paths": profile["allowed_write_paths"],
        "acceptance_checks": profile["acceptance_checks"], "valid_from": profile["valid_from"], "valid_until": profile["valid_until"], "echo": None}
    require(projection == expected and prepared.body.sha256 == codec.digest(body) and prepared.body.byte_length == len(body)
            and prepared.job_id == profile["job_id"] and prepared.mission_id == profile["mission_id"]
            and packet.mission_id == profile["mission_id"] and packet.round == prepared.round == 0
            and prepared.header_profile_sha256 == codec.digest({"content-type": "application/json"})
            and prepared.codec_version == "0.1.0", "FEEDBACK_PREPARED_BINDING")
    require(record.get("schema") == "soulforge.secure_work.permit.v0" and record.get("decision") == "ALLOW"
            and record.get("actor_ref") == policy.actor_ref, "FEEDBACK_REVIEW_ACTOR")
    permit = models.SignedPermit.model_validate(record["permit"])
    require(record.get("issuer_key_id") == permit.key_id == identity["issuer_key_id"], "FEEDBACK_PERMIT_ISSUER")
    permits.verify_permit(permit, public_keys, body, prepared.route_sha256, prepared.job_id, prepared.mission_id,
        prepared.round, policy.review_ref, identity["policy_epoch"], profile["audience"], now_utc)
    require(codec.utc_seconds(profile["valid_from"]) <= codec.utc_seconds(now_utc) < codec.utc_seconds(profile["valid_until"])
            <= min(codec.utc_seconds(policy.expires_utc), codec.utc_seconds(permit.claims.expires_utc)), "FEEDBACK_RELEASE_EXPIRY")
    require(pin.source_ref == "linear.issue:" + selected["issue_id"] and pin.revision == selected["issue_content_sha256"][7:]
            and selected["scope_ref"] == profile["scope_ref"] and 0 < len(summary) <= 2000, "FEEDBACK_SOURCE_BINDING")
    return {"body_sha256": codec.digest(body), "permit_id": permit.claims.permit_id,
        "review_ref": policy.review_ref, "scope_digest": policy.scope_digest, "selection": selected,
        "job_id": prepared.job_id, "attempt_id": "o_" + codec.digest({"permit": permit.claims.permit_id, "body": codec.digest(body)})[:32]}


def journal_phase(root, phase, verified, project_ref):
    from pathlib import Path
    import sqlite3
    from . import storage
    from sf_sewe.journal import Journal
    require(phase in ("check", "reserve", "complete"))
    if phase == "check":
        return "NOT_CONSUMED"
    target = storage.checked_path(Path(root), "attempts.db", missing=True)
    if target.exists():
        # Never invoke the CREATE IF NOT EXISTS constructor on retained state:
        # an empty/partial restored DB must not become a fresh permit ledger.
        require(target.stat().st_size > 0, "FEEDBACK_JOURNAL_INCOMPLETE")
        journal = Journal.__new__(Journal)
        journal.db = sqlite3.connect(target.as_uri() + "?mode=rw", uri=True, isolation_level=None, timeout=5)
        try:
            journal.db.execute("PRAGMA trusted_schema=OFF")
            journal.db.execute("PRAGMA foreign_keys=ON")
            journal.db.execute("PRAGMA synchronous=FULL")
            tables = {row[0] for row in journal.db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            require(tables == {"jobs", "events", "commands", "attempts"}
                    and journal.db.execute("SELECT 1 FROM sqlite_master WHERE type IN ('view','trigger') LIMIT 1").fetchone() is None,
                    "FEEDBACK_JOURNAL_INCOMPLETE")
        except Exception:
            journal.close()
            raise
    else:
        journal = Journal(str(target))
    try:
        row = journal.db.execute("SELECT project_ref FROM jobs WHERE job_id=?", (verified["job_id"],)).fetchone()
        if row is None:
            journal.create(verified["job_id"], project_ref, "feedback.code")
        else:
            require(row[0] == project_ref, "FEEDBACK_JOURNAL_SCOPE")
        existing = journal.db.execute("SELECT permit_id,request_sha256,state FROM attempts WHERE attempt_id=?",
            (verified["attempt_id"],)).fetchone()
        if existing is not None:
            require(existing[:2] == (verified["permit_id"], verified["body_sha256"]), "FEEDBACK_ATTEMPT_CONFLICT")
            if phase == "complete" and existing[2] == "IN_FLIGHT":
                journal.mark_attempt(verified["attempt_id"], "RESPONSE_RECEIVED")
                return "RESPONSE_RECEIVED"
            require(existing[2] == "RESPONSE_RECEIVED", "FEEDBACK_DELIVERY_UNKNOWN")
            return existing[2]
        require(phase == "reserve", "FEEDBACK_ATTEMPT_MISSING")
        journal.reserve_attempt(verified["attempt_id"], verified["job_id"], verified["permit_id"], verified["body_sha256"])
        journal.mark_attempt(verified["attempt_id"], "IN_FLIGHT")
        return "IN_FLIGHT"
    finally:
        journal.close()


def main(mode):
    from . import launch_runtime, kit, authority
    path, raw = launch_runtime.checked_config()
    config = json.loads(raw)
    kit.bind(__import__("pathlib").Path(config["kit_root"]))
    codec, _, _, _ = api()
    operation = "jobs.advance" if mode == "feedback_prepare" else "model.dispatch"
    identity = launch_runtime.role_entry(operation)
    require(identity is not None, "FEEDBACK_LAUNCH_REQUIRED")
    request = codec.strict_loads(sys.stdin.buffer.read(4194305))
    require(len(codec.canonical(request)) <= 4194304)
    fixed = config["g2_feedback"]
    documents = {}
    for name in ("profile", "grant", "route", "field_ledger"):
        value = base64.b64decode(request["documents"][name], validate=True)
        require(hashlib.sha256(value).hexdigest() == fixed[name]["sha256"], "FEEDBACK_DOCUMENT_PIN")
        documents[name] = codec.strict_loads(value)
    # Reuse the existing read-only ledger after Node checked current protected
    # file custody. Its exact pin is checked again, never a model-owned ALLOW.
    ledger_path = __import__("pathlib").Path(fixed["field_ledger"]["path"])
    require(hashlib.sha256(ledger_path.read_bytes()).hexdigest() == fixed["field_ledger"]["sha256"])
    ledger = authority.FieldReviewLedger(ledger_path)
    if mode == "feedback_prepare":
        parts = prepare_data(base64.b64decode(request["wrapper"], validate=True), request["selection"],
            documents["profile"], documents["grant"], documents["route"], identity, ledger)
        output = {name: base64.b64encode(value).decode("ascii") for name, value in parts.items()}
    else:
        for name in ("review", "permit"):
            value = base64.b64decode(request["documents"][name], validate=True)
            require(hashlib.sha256(value).hexdigest() == fixed[name]["sha256"])
            documents[name] = codec.strict_loads(value)
        record = documents["permit"]
        launch_runtime.role_check("permit.identity", {key: identity[key] for key in
            ("project_ref", "assignment_ref", "assignment_epoch", "task_ref", "policy_epoch", "route_sha256", "audience")}, record)
        public_path = __import__("pathlib").Path(fixed["public_key"]["path"])
        require(hashlib.sha256(public_path.read_bytes()).hexdigest() == fixed["public_key"]["sha256"])
        key_id, key = authority.load_trust_pubkey(public_path)
        parts = {name: base64.b64decode(value, validate=True) for name, value in request["parts"].items()}
        output = verify_data(parts, documents["profile"], documents["grant"], documents["route"],
            documents["review"], record, identity, ledger, {key_id: key}, authority.utc_now())
        output["attempt_state"] = journal_phase(fixed["control_root"], request["phase"], output, identity["project_ref"])
    require(launch_runtime.role_entry(operation) == identity, "FEEDBACK_ROLE_CHANGED")
    sys.stdout.write(json.dumps({"ok": True, "result": output}, separators=(",", ":")))
    return 0
