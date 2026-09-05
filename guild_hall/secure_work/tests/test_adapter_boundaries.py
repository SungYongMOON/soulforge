"""Adapter boundary tests.

These cover the three claims the lane must not get wrong: an unbound external
route performs no call, a released body carries no withheld value, and a field
review that was never granted does not become a literal in a packet.
"""
from __future__ import annotations

import json

import pytest

from soulforge_secure_work import guard
from soulforge_secure_work.adapters import (
    AdapterUnavailable,
    LocalManagerAdapter,
    OpenRouterTransport,
    TongsCustodyAdapter,
)
from soulforge_secure_work.authority import FieldReviewLedger


# --- external route: no key, no call ---------------------------------------

def test_openrouter_without_key_file_is_unavailable(tmp_path):
    transport = OpenRouterTransport(key_file=str(tmp_path / "absent.key"),
                                    base_url="https://example.invalid",
                                    model="m", live_enabled=True)
    probe = transport.probe()
    assert probe.state == "UNAVAILABLE"
    assert probe.detail == "key file missing"
    with pytest.raises(AdapterUnavailable):
        transport.send_exact(b"{}", tmp_path)


def test_openrouter_with_key_but_route_not_enabled_refuses_dispatch(tmp_path):
    key = tmp_path / "present.key"
    key.write_text("placeholder-not-a-real-credential\n", encoding="utf-8")
    transport = OpenRouterTransport(key_file=str(key), base_url="https://example.invalid",
                                    model="m", live_enabled=False)
    assert transport.probe().state == "DISABLED"
    with pytest.raises(AdapterUnavailable):
        transport.send_exact(b"{}", tmp_path)


def test_custody_without_bearer_is_unavailable_and_deposits_nothing(tmp_path):
    client = tmp_path / "ingress_client_cli.mjs"
    client.write_text("// stand-in for the real client\n", encoding="utf-8")
    custody = TongsCustodyAdapter(client_cli=str(client),
                                  ingress_url="http://127.0.0.1:4312",
                                  control_url="http://127.0.0.1:4311",
                                  token_file=str(tmp_path / "absent.bearer"),
                                  live_enabled=True)
    probe = custody.probe()
    assert probe.state == "UNAVAILABLE"
    assert probe.detail == "bearer file missing"
    with pytest.raises(AdapterUnavailable):
        custody.deposit(tmp_path / "candidate.md", "project", "occurrence", "key")


def test_disabled_local_manager_makes_no_request():
    manager = LocalManagerAdapter(base_url="http://127.0.0.1:1/v1", model="auto",
                                  timeout_s=1, enabled=False)
    assert manager.probe().state == "DISABLED"
    with pytest.raises(AdapterUnavailable) as raised:
        manager.propose("prompt")
    assert raised.value.reason == "disabled"


# --- egress guard -----------------------------------------------------------

def test_guard_flags_a_withheld_value_in_the_released_body():
    body = json.dumps({"facts": [{"text": "금액: 732641원"}]}, ensure_ascii=False).encode("utf-8")
    findings = guard.scan_released_bytes(body, source_refs=[], source_names=[],
                                         bound_values=["732641원"])
    assert [finding.code for finding in findings] == ["BOUND_VALUE_IN_PACKET"]


def test_guard_flags_a_host_path_and_a_source_name():
    # Assembled at runtime on purpose: the repository's absolute-path policy
    # scans source bytes, so a literal drive-rooted string in this file would
    # read as a real host path.
    drive = "D" + ":"
    body = json.dumps({"note": drive + "\\example-root\\x", "file": "01_contract"}).encode("utf-8")
    codes = {finding.code for finding in guard.scan_released_bytes(
        body, source_refs=[], source_names=["01_contract"], bound_values=[])}
    assert codes == {"HOST_PATH_IN_PACKET", "SOURCE_NAME_IN_PACKET"}


def test_guard_passes_a_body_that_only_holds_opaque_tokens():
    body = json.dumps({"slots": [{"slot_id": "o_" + "a" * 32}]}).encode("utf-8")
    assert guard.scan_released_bytes(body, source_refs=["src.01_contract"],
                                     source_names=["01_contract"],
                                     bound_values=["732641원"]) == []


def test_guard_flags_a_withheld_value_in_a_log_line():
    findings = guard.scan_log_line('{"note":"금액: 732641원"}',
                                   bound_values=["732641원"], key_material=[])
    assert [finding.code for finding in findings] == ["BOUND_VALUE_IN_LOG"]


# --- field review authority -------------------------------------------------

def test_field_review_ledger_refuses_an_unlisted_or_altered_field(tmp_path):
    path = tmp_path / "field_reviews.json"
    path.write_text(json.dumps({
        "schema": "soulforge.secure_work.field_reviews.v0",
        "synthetic_pilot": True,
        "entries": [{"review_ref": "review.field.a", "field_sha256": "a" * 64,
                     "policy_epoch": 1}],
    }), encoding="utf-8")
    ledger = FieldReviewLedger(path)
    assert ledger.verify("review.field.a", "a" * 64, 1) is True
    assert ledger.verify("review.field.a", "b" * 64, 1) is False   # field text changed
    assert ledger.verify("review.field.a", "a" * 64, 2) is False   # policy epoch moved
    assert ledger.verify("review.field.unlisted", "a" * 64, 1) is False


def test_missing_ledger_file_grants_nothing(tmp_path):
    ledger = FieldReviewLedger(tmp_path / "absent.json")
    assert ledger.loaded is False
    assert ledger.missing([("review.field.a", "a" * 64, 1)]) == ["review.field.a"]


# --- projection refuses an unreviewed literal (needs the kit) ---------------

def test_projection_refuses_keep_reviewed_without_a_review(kit):
    from sf_sewe.codec import ContractViolation, digest
    from sf_sewe.models import (FieldRule, PrivateField, ProjectInput, ProjectionPlan,
                                SourceBinding, SourceBundle, SourcePin, WorkDefinition)
    from sf_sewe.projection import project

    pin = SourcePin(source_ref="src.synthetic", revision="r1", sha256="0" * 64)
    field = PrivateField(field_id="f1", source_ref=pin.source_ref, source_revision="r1",
                         span_start=0, span_end=3, value="abc", role="text", status="FACT",
                         dependencies=[], classification="RELEASE_CANDIDATE")
    bundle = SourceBundle(protocol="sf.sewe.private-source/1.0",
                          binding=SourceBinding(project_ref="p", assignment_ref="a",
                                                assignment_epoch=1, sources=[pin]),
                          fields=[field], extraction_complete=True, gaps=[])
    work = WorkDefinition(work_type="w", revision="0.1.0", instructions="i",
                          section_titles={"facts": "사실"}, required_sections=["facts"],
                          output_profile="markdown.literal.v1", max_rounds=4,
                          validators=["structural.v1"])
    plan = ProjectionPlan(protocol="sf.sewe.projection-plan/1.0", mission_id="o_" + "1" * 32,
                          round=0, base_candidate_rev="none",
                          source_bundle_sha256=digest(bundle),
                          work_definition_sha256=digest(work), policy_epoch=1,
                          rules=[FieldRule(field_id="f1", action="KEEP_REVIEWED",
                                           section_ids=["facts"], required=True,
                                           review_ref="review.field.f1")])
    with pytest.raises(ContractViolation) as raised:
        project(ProjectInput(source=bundle, plan=plan, work=work), lambda *args: False)
    assert raised.value.code == "FIELD_REVIEW_REQUIRED"


def test_scripted_worker_sees_only_the_released_body(kit):
    from sf_sewe.codec import canonical
    from soulforge_secure_work.worker import build_reply

    packet = {
        "protocol": "sf.sewe.packet/1.0", "mission_id": "o_" + "2" * 32, "round": 0,
        "base_candidate_rev": "none", "work_type": "w", "work_revision": "0.1.0",
        "instructions": "본문", "asset_slots": [],
        "facts": [{"fact_id": "o_" + "3" * 32, "status": "FACT",
                   "segments": [{"kind": "literal", "text": "센서 상한은 "},
                                {"kind": "slot", "slot_id": "o_" + "4" * 32}],
                   "depends_on": [], "source_refs": []}],
        "slots": [{"slot_id": "o_" + "4" * 32, "role": "quantity", "display_hint": "VALUE"}],
        "sections": [{"section_id": "facts", "title": "사실", "required": True,
                      "required_fact_ids": ["o_" + "3" * 32],
                      "allowed_slot_ids": ["o_" + "4" * 32],
                      "required_slot_ids": ["o_" + "4" * 32]}],
    }
    reply = build_reply(canonical({"packet": packet, "released_history": []}))
    text = reply.decode("utf-8")
    assert "6.0 V" not in text            # the worker never learns the value
    assert "o_" + "4" * 32 in text        # it returns the slot it was given
    assert json.loads(text)["result"]["completion"] == "COMPLETE_CANDIDATE"
