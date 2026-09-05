"""Turn an E13 recipe plus extracted parts into the E14 M03 inputs.

CODE owns the action assignment. The local manager (G2) may propose, but every
proposal is re-derived and re-checked here: an unrecognised field, a role
mismatch or a missing field review is an error, never a silent KEEP.
"""
from __future__ import annotations

import json
from pathlib import Path

from .extract import Part

SECTION_TITLES = {
    "facts": "확인된 사실",
    "changes": "변경",
    "impacts": "영향",
    "actions": "조치",
    "unknowns": "미상",
}

WORK_INSTRUCTIONS = (
    "제공된 사실만으로 업무·변경 보고를 작성한다. 근거는 fact_id로 인용한다. "
    "FACT / PROPOSAL / UNKNOWN 구분을 유지하고 검증되지 않은 항목을 완료로 적지 않는다. "
    "값이 슬롯으로 가려진 자리는 슬롯 그대로 두고 임의의 숫자나 이름을 만들지 않는다."
)

# Role -> the single action CODE will assign when the field is selected.
DEFAULT_ACTION = {
    "entity": "TOKENIZE_ID",
    "quantity": "TYPED_SLOT",
    "date": "TYPED_SLOT",
    "text": "KEEP_REVIEWED",
    "verbatim": "LOCAL_VERBATIM_SLOT",
}


def load_recipe(recipe_root: Path, recipe_id: str) -> dict:
    path = Path(recipe_root) / f"{recipe_id}.json"
    if not path.is_file():
        raise RuntimeError("RECIPE_NOT_FOUND")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("recipe_id") != recipe_id:
        raise RuntimeError("RECIPE_ID_MISMATCH")
    return data


def work_definition(models, recipe: dict):
    required = [s for s in recipe["required_sections"] if s in SECTION_TITLES]
    if len(required) != len(recipe["required_sections"]):
        raise RuntimeError("RECIPE_SECTION_UNSUPPORTED")
    return models.WorkDefinition(
        work_type=f"r1.{recipe['recipe_id'].lower().replace('-', '_')}",
        revision="0.1.0",
        instructions=WORK_INSTRUCTIONS,
        section_titles={key: SECTION_TITLES[key] for key in required},
        required_sections=required,
        output_profile="markdown.literal.v1",
        max_rounds=4,
        validators=["structural.v1", "semantic.review.v1"],
    )


def field_review_ref(part: Part) -> str:
    return f"review.field.{part.field_id}"


def source_bundle(models, pins: list[dict], parts: list[Part], project_ref: str,
                  assignment_ref: str, epoch: int):
    fields = [
        models.PrivateField(
            field_id=p.field_id,
            source_ref=p.source_ref,
            source_revision=p.source_revision,
            span_start=p.span_start,
            span_end=p.span_end,
            value=p.value,
            role=p.role,
            status=p.status,
            dependencies=list(p.dependencies),
            classification="RELEASE_CANDIDATE" if p.role == "text" else "PRIVATE",
        )
        for p in parts
    ]
    binding = models.SourceBinding(
        project_ref=project_ref,
        assignment_ref=assignment_ref,
        assignment_epoch=epoch,
        sources=[models.SourcePin(**pin) for pin in pins],
    )
    return models.SourceBundle(
        protocol="sf.sewe.private-source/1.0",
        binding=binding,
        fields=fields,
        extraction_complete=True,
        gaps=[],
    )


def projection_plan(models, digest, bundle, work, parts: list[Part], mission_id: str,
                    selected: set[str], policy_epoch: int, base_rev: str = "none",
                    round_index: int = 0):
    """One rule per field. Unselected fields are OMIT, never implicit KEEP."""
    by_id = {p.field_id: p for p in parts}
    rules = []
    for part in parts:
        if part.field_id not in selected:
            rules.append(
                models.FieldRule(field_id=part.field_id, action="OMIT", section_ids=[],
                                 required=False, review_ref=None)
            )
            continue
        action = DEFAULT_ACTION[part.role]
        review_ref = field_review_ref(part) if action == "KEEP_REVIEWED" else None
        rules.append(
            models.FieldRule(
                field_id=part.field_id,
                action=action,
                section_ids=list(part.section_ids),
                required=bool(part.required),
                review_ref=review_ref,
            )
        )
    # A selected part must keep its statement root selected, or the dependency
    # closure check in M03 fails closed rather than dropping the context.
    for field_id in list(selected):
        for dependency in by_id[field_id].dependencies:
            if dependency not in selected:
                raise RuntimeError("REQUIRED_CONTEXT_UNDISCLOSABLE")
    return models.ProjectionPlan(
        protocol="sf.sewe.projection-plan/1.0",
        mission_id=mission_id,
        round=round_index,
        base_candidate_rev=base_rev,
        source_bundle_sha256=digest(bundle),
        work_definition_sha256=digest(work),
        policy_epoch=policy_epoch,
        rules=rules,
    )


def default_selection(parts: list[Part], work_sections: set[str]) -> set[str]:
    """Select every part whose statement lands in at least one work section."""
    selected = {p.field_id for p in parts if set(p.section_ids) & work_sections}
    by_id = {p.field_id: p for p in parts}
    changed = True
    while changed:
        changed = False
        for field_id in list(selected):
            for dependency in by_id[field_id].dependencies:
                if dependency not in selected:
                    selected.add(dependency)
                    changed = True
        # A selected root must keep the rest of its statement, or a sentence is
        # published with a hole where a token was.
        for part in parts:
            if part.statement_id in {by_id[f].statement_id for f in selected} \
                    and part.field_id not in selected:
                selected.add(part.field_id)
                changed = True
    return selected
