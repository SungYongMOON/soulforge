"""Bounded local utility checks around the unchanged E14 contract.

Arithmetic is private evidence, never an automatically released fact. Evidence
preservation accepts lossless reassembly only; it cannot approve source truth,
general paraphrases, technical acceptance or disclosure.
"""
from __future__ import annotations

import re
from decimal import Decimal
from pathlib import Path

from . import extract, plan

COMPARISON_ROLE_RE = re.compile(r"^\s*(측정값|허용 상한)(?:은|는|이|가|\s|$)")
COMPARISON_DECLARATION_RE = re.compile(
    r"\s*(측정값|허용 상한)(?:은|는|이|가)?\s*"
    r"(\d{1,20}(?:\.\d{1,20})?)\s?(mV|V|ms|s|%|원|일|개월|건|회)(?:다|이다)?[.!]?\s*"
)


def evaluate_local_comparisons(source_dir: Path, *, source_bundle_sha256: str,
                               project_ref: str, assignment_ref: str,
                               assignment_epoch: int) -> dict:
    """Re-extract current exact bytes and bind before comparing same-unit fields.

    Supported: one factual measurement and inclusive upper limit per source
    file, in the explicit declarative grammar above. Duplicate/missing roles,
    unsupported units/syntax or changed source produce HOLD, not an estimate.
    No caller-supplied value, role, operator or field selection is trusted.
    """
    from sf_sewe import codec, models
    result = {"state": "HOLD", "source_bundle_sha256": source_bundle_sha256,
              "comparisons": [], "disclosure": "HOLD", "semantic_accepted": False}
    try:
        pins, parts = extract.read_exact(source_dir)
        bundle = plan.source_bundle(models, pins, parts, project_ref, assignment_ref, assignment_epoch)
        if codec.digest(bundle) != source_bundle_sha256:
            return {**result, "code": "LOCAL_SOURCE_BINDING_CHANGED"}
    except (OSError, ValueError, RuntimeError):
        return {**result, "code": "LOCAL_SOURCE_UNAVAILABLE"}
    statements = {}
    for part in parts:
        statements.setdefault((part.source_ref, part.statement_id), []).append(part)
    by_source = {}
    for (source_ref, _), members in statements.items():
        text = "".join(part.value for part in members)
        role = COMPARISON_ROLE_RE.match(text)
        if role is None:
            continue
        declaration = COMPARISON_DECLARATION_RE.fullmatch(text)
        quantities = [part for part in members if part.role == "quantity"]
        valid = (declaration is not None and len(quantities) == 1
                 and all(part.status == "FACT" for part in members))
        if valid:
            magnitude, unit = declaration.group(2, 3)
            # Match the actual extracted field; regex captures alone are not
            # a second source authority or a way around the typed field split.
            valid = quantities[0].value.replace(" ", "") == magnitude + unit
        by_source.setdefault(source_ref, {}).setdefault(role.group(1), []).append(
            (members, Decimal(magnitude) if valid else None, unit if valid else None))
    for source_ref, roles in by_source.items():
        row = {"source_ref_sha256": codec.digest(source_ref.encode()), "operator": "<=",
               "state": "HOLD", "decision": "insufficient_evidence"}
        measured, upper = roles.get("측정값", []), roles.get("허용 상한", [])
        if len(measured) == len(upper) == 1:
            left, right = measured[0], upper[0]
            if left[1] is not None and right[1] is not None and left[2] == right[2]:
                row.update({"state": "COMPUTED_IN_SCOPE",
                            "decision": "within_limit" if left[1] <= right[1] else "exceeds_limit",
                            "evidence_sha256": codec.digest({
                                "source_bundle_sha256": source_bundle_sha256,
                                "operator": "<=", "unit": left[2],
                                "fields": [{"field_id": p.field_id, "source_ref": p.source_ref,
                                            "source_revision": p.source_revision,
                                            "span_start": p.span_start, "span_end": p.span_end,
                                            "value": p.value, "role": p.role, "status": p.status}
                                           for p in left[0] + right[0]]})})
        result["comparisons"].append(row)
    result["state"] = ("NOT_APPLICABLE" if not by_source else "COMPUTED_IN_SCOPE"
                       if all(r["state"] == "COMPUTED_IN_SCOPE" for r in result["comparisons"]) else "HOLD")
    return result


def check_evidence_preservation(packet, document) -> dict:
    """Check exact ordered evidence/slot roles through one candidate seam.

    Section/block/key serialization order is harmless; each block must retain
    cited fact order, dependency closure, segments and status. New literals or
    changed slot roles require review. This is deliberately not a paraphrase
    validator; passing means only source evidence was preserved in scope.
    """
    from sf_sewe import artifacts, codec, models
    base = {"state": "HOLD", "semantic_accepted": False, "code": "SOURCE_EVIDENCE_CHANGED"}
    try:
        packet = models.WorkPacket.model_validate(packet)
        document = models.DocumentIR.model_validate(document)
        artifacts.validate_document(models.CheckResultInput(
            packet=packet, result=document, current_base=packet.base_candidate_rev))
        base.update({"packet_sha256": codec.digest(packet), "result_sha256": codec.digest(document)})
        facts = {fact.fact_id: fact for fact in packet.facts}
        specs = {section.section_id: section for section in packet.sections}
        if document.completion != "COMPLETE_CANDIDATE" or document.missing_evidence:
            return base
        seen_sections = set()
        for section in document.sections:
            if section.section_id in seen_sections or section.section_id not in specs:
                return base
            seen_sections.add(section.section_id)
            ordered = specs[section.section_id].required_fact_ids
            used = set()
            for block in section.blocks:
                ids = block.evidence_ids
                if (not ids or len(ids) != len(set(ids)) or used.intersection(ids)
                    or any(fid not in ordered or fid not in facts for fid in ids)
                    or ids != sorted(ids, key=ordered.index)
                    or block.kind != "paragraph" or block.columns or block.rows):
                    return base
                members = [facts[fid] for fid in ids]
                if any(dep not in ids for fact in members for dep in fact.depends_on):
                    return base
                expected = [segment for fact in members for segment in fact.segments]
                statuses = {fact.status for fact in members}
                status = ("FACT" if statuses == {"FACT"} else "UNKNOWN" if "UNKNOWN" in statuses
                          else "PROPOSAL" if "PROPOSAL" in statuses else "ANALYSIS")
                if block.segments != expected or block.status != status:
                    return base
                used.update(ids)
            if used != set(ordered):
                return base
        if any(spec.required and spec.section_id not in seen_sections for spec in packet.sections):
            return base
    except (ValueError, RuntimeError, KeyError, TypeError):
        return base
    return {**base, "state": "PASS_IN_SCOPE", "code": "SOURCE_EVIDENCE_PRESERVED"}
