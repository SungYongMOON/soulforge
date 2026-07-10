You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=human; class=administrator.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: frontline_assault
kind: workflow
status: active
title: Frontline Assault
summary: Canonical workflow for coordinating the frontline assault, keeping curated lessons distinct from mission runtime truth.
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
notes:
  - Curated lessons live in the workflow canon while raw execution truth remains with `_workspaces/<project_code>`.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: frontline_assault
kind: step_graph
status: active
steps:
  - step_id: scout
    title: Scout
    next:
      - decide
  - step_id: decide
    title: Decide
    next:
      - deliver
  - step_id: deliver
    title: Deliver
    next: []


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "frontline_assault",
  "fixture_id": "PUBLIC_SYNTH_FRONTLINE_ASSAULT",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Frontline Assault",
  "workflow_summary": "Canonical workflow for coordinating the frontline assault, keeping curated lessons distinct from mission runtime truth.",
  "workflow_readiness_label": "registered",
  "input_refs": [],
  "expected_output_groups": [
    "scout_report",
    "decision_note",
    "delivery_handoff",
    "boundary_review_note"
  ],
  "must_preserve": [
    "curated lessons",
    "runtime truth",
    "boundary",
    "handoff"
  ],
  "scenario_facts": [
    "one confirmed frontline objective",
    "one ambiguous threat signal that must remain unresolved",
    "one delivery handoff that depends on later runtime execution"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
