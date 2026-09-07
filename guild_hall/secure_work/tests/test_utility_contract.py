"""Pure source/packet checks; no Lane constructor, keys, vault or transport."""
import copy
import json

import pytest

from soulforge_secure_work import extract, plan


def source_bundle(kit, path):
    from sf_sewe import codec, models
    pins, parts = extract.read_exact(path)
    bundle = plan.source_bundle(models, pins, parts, "p", "a", 1)
    return codec.digest(bundle)


@pytest.mark.parametrize("value,expected", [("5.8", "within_limit"), ("6.2", "exceeds_limit"),
                                           ("6.0", "within_limit")])
def test_local_comparison_uses_pinned_source_values(kit, tmp_path, value, expected):
    from soulforge_secure_work.utility import evaluate_local_comparisons
    source = tmp_path / "source.md"
    source.write_text(f"측정값은 {value} V다. 허용 상한은 6.0 V다.", encoding="utf-8")
    pin = source_bundle(kit, tmp_path)
    result = evaluate_local_comparisons(tmp_path, source_bundle_sha256=pin,
                                       project_ref="p", assignment_ref="a", assignment_epoch=1)
    assert result["state"] == "COMPUTED_IN_SCOPE"
    assert result["comparisons"][0]["decision"] == expected
    assert result["comparisons"][0]["operator"] == "<="
    assert result["disclosure"] == "HOLD" and result["semantic_accepted"] is False
    assert value + " V" not in json.dumps(result)
    source.write_text("측정값은 7.0 V다. 허용 상한은 6.0 V다.", encoding="utf-8")
    changed = evaluate_local_comparisons(tmp_path, source_bundle_sha256=pin,
                                        project_ref="p", assignment_ref="a", assignment_epoch=1)
    assert changed["state"] == "HOLD" and changed["comparisons"] == []


@pytest.mark.parametrize("text", [
    "측정값 미정. 허용 상한은 6.0 V다.",
    "측정값은 5.8 ms다. 허용 상한은 6.0 V다.",
    "측정값은 5.8 V다. 측정값은 6.2 V다. 허용 상한은 6.0 V다.",
    "측정값은 5.8 V라는 제안. 허용 상한은 6.0 V다.",
])
def test_ambiguous_or_missing_arithmetic_has_no_decision(kit, tmp_path, text):
    from soulforge_secure_work.utility import evaluate_local_comparisons
    (tmp_path / "source.md").write_text(text, encoding="utf-8")
    result = evaluate_local_comparisons(tmp_path, source_bundle_sha256=source_bundle(kit, tmp_path),
                                       project_ref="p", assignment_ref="a", assignment_epoch=1)
    assert result["state"] == "HOLD"
    assert all(row["decision"] == "insufficient_evidence" for row in result["comparisons"])


def packet_and_reply(kit):
    from sf_sewe.codec import canonical
    from soulforge_secure_work.worker import build_reply
    opaque = lambda c: "o_" + c * 32
    facts = [{"fact_id": opaque("1"), "status": "FACT", "segments": [
        {"kind": "literal", "text": "측정값과 상한: "},
        {"kind": "slot", "slot_id": opaque("2")},
        {"kind": "literal", "text": ", "},
        {"kind": "slot", "slot_id": opaque("3")}], "depends_on": [], "source_refs": []}]
    packet = {"protocol": "sf.sewe.packet/1.0", "mission_id": opaque("4"), "round": 0,
              "base_candidate_rev": "none", "work_type": "w", "work_revision": "0.1.0",
              "instructions": "본문", "asset_slots": [], "facts": facts,
              "slots": [{"slot_id": opaque(c), "role": "quantity", "display_hint": "VALUE"} for c in ("2", "3")],
              "sections": [{"section_id": "facts", "title": "사실", "required": True,
                            "required_fact_ids": [opaque("1")], "allowed_slot_ids": [opaque("2"), opaque("3")],
                            "required_slot_ids": [opaque("2"), opaque("3")]}]}
    reply = json.loads(build_reply(canonical({"packet": packet, "released_history": []})))
    return packet, reply["result"]


@pytest.mark.parametrize("mutation", ["exact", "key_order", "swap", "invented_acceptance"])
def test_same_evidence_seam_accepts_preservation_and_holds_changes(kit, mutation):
    from soulforge_secure_work.utility import check_evidence_preservation
    packet, result = packet_and_reply(kit)
    changed = copy.deepcopy(result)
    segments = changed["sections"][0]["blocks"][0]["segments"]
    if mutation == "swap":
        segments[1], segments[3] = segments[3], segments[1]
    elif mutation == "invented_acceptance":
        segments.append({"kind": "literal", "text": "시험 합격이 공식 수락되었다."})
    elif mutation == "key_order":
        changed = json.loads(json.dumps(changed, sort_keys=True))
    verdict = check_evidence_preservation(packet, changed)
    assert verdict["state"] == ("PASS_IN_SCOPE" if mutation in {"exact", "key_order"} else "HOLD")
    assert verdict["semantic_accepted"] is False


def test_engine_validation_connects_local_comparison_without_outbox_disclosure(kit, tmp_path):
    from sf_sewe import codec, models, artifacts
    from soulforge_secure_work.engine import Job, Lane
    from types import SimpleNamespace
    source = tmp_path / "source"
    source.mkdir()
    (source / "source.md").write_text("측정값은 5.8 V다. 허용 상한은 6.0 V다.", encoding="utf-8")
    packet, result = packet_and_reply(kit)
    job = Job(SimpleNamespace(jobs_root=tmp_path / "jobs"), "synthetic", {
        "source_bundle_sha256": source_bundle(kit, source), "project_ref": "p", "assignment_ref": "a",
        "assignment_epoch": 1, "base_candidate_rev": "none", "candidate_sha256": "a" * 64})
    job.path("quarantine").mkdir(parents=True)
    job.path("packet.json").write_bytes(codec.canonical(packet))
    job.path("quarantine", "reply.json").write_bytes(codec.canonical({"result": result, "more_context": None}))
    verdict = artifacts.validate_document(models.CheckResultInput(
        packet=models.WorkPacket.model_validate(packet), result=models.DocumentIR.model_validate(result), current_base="none"))
    job.path("verdict.json").write_bytes(codec.canonical(verdict))
    lane = object.__new__(Lane)
    lane.models, lane.codec, lane.config = models, codec, SimpleNamespace(source_root=source)
    lane.transition = lambda *args, **kwargs: (args[1], "synthetic.receipt")
    assert lane.step_validate(job)[0] == "REVIEW_PENDING"
    local = json.loads(job.path("local_validation.json").read_bytes())
    assert local["comparisons"][0]["decision"] == "within_limit"
    report = json.loads(job.path("validation.json").read_bytes())
    assert report["utility"] == "REVIEW_REQUIRED"
    assert "within_limit" not in json.dumps(report)
    assert job.path("packet.json").read_bytes() == codec.canonical(packet)


@pytest.mark.parametrize("step", ["step_structure_check", "step_bind", "step_validate"])
def test_engine_holds_changed_evidence_before_render_or_candidate(kit, tmp_path, step):
    from sf_sewe import codec, models, artifacts
    from soulforge_secure_work.engine import EngineStop, Job, Lane
    from types import SimpleNamespace
    packet, result = packet_and_reply(kit)
    result["sections"][0]["blocks"][0]["segments"].append(
        {"kind": "literal", "text": "시험 합격이 공식 수락되었다."})
    job = Job(SimpleNamespace(jobs_root=tmp_path / "jobs"), "synthetic", {"base_candidate_rev": "none"})
    job.path("quarantine").mkdir(parents=True)
    job.path("packet.json").write_bytes(codec.canonical(packet))
    job.path("quarantine", "reply.json").write_bytes(codec.canonical({"result": result, "more_context": None}))
    verdict = artifacts.validate_document(models.CheckResultInput(
        packet=models.WorkPacket.model_validate(packet), result=models.DocumentIR.model_validate(result), current_base="none"))
    job.path("verdict.json").write_bytes(codec.canonical(verdict))
    lane = object.__new__(Lane)
    lane.models, lane.codec, lane.artifacts = models, codec, artifacts
    lane.transition = lambda *args, **kwargs: pytest.fail("must not transition")
    with pytest.raises(EngineStop, match="SEMANTIC_EVIDENCE_HOLD"):
        getattr(lane, step)(job)
    assert not job.path("candidate.md").exists()
    assert json.loads(job.path("semantic_evidence.json").read_bytes())["state"] == "HOLD"
