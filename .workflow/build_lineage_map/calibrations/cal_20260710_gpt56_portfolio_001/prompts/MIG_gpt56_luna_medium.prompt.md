You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
﻿workflow_id: build_lineage_map
kind: workflow
status: active
title: Build Lineage Map
summary: Bounded opening workflow for lineage-map production that stops at evidence-backed planning artifacts.
entrypoint: run
execution_mode: party_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
inputs:
  - source_documents
  - source_notes
outputs:
  - research_notes.md
  - lineage_pbs.md
notes:
  - This sample models the bounded opening phase of a work procedure workflow rather than a fully materialized delivery pipeline.
  - The opening handoff uses the party's `stabilizer` slot to bound risk before the `investigator` slot drafts the first structure.
  - Runtime truth and produced artifacts still belong under `_workmeta/<project_code>/runs/<run_id>/`.



--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: build_lineage_map
kind: step_graph
status: active
steps:
  - step_id: investigate_sources
    actor_slot: stabilizer
    execution_profile_ref: analysis_heavy
    action:
      kind: skill
      skill_id: shield_wall
    inputs:
      - source_documents
      - source_notes
    outputs:
      - research_notes.md
    summary: Inspect the source set, localize ambiguity, and establish the safest factual boundary.
    next:
      on_success: build_pbs
      on_fail: stop
  - step_id: build_pbs
    actor_slot: investigator
    execution_profile_ref: structured_planning
    action:
      kind: skill
      skill_id: record_stitch
    inputs:
      - research_notes.md
    outputs:
      - lineage_pbs.md
    summary: Turn bounded lineage notes into a coherent draft structure before diagram drafting.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "build_lineage_map",
  "fixture_id": "PUBLIC_SYNTH_BUILD_LINEAGE_MAP",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Build Lineage Map",
  "workflow_summary": "Bounded opening workflow for lineage-map production that stops at evidence-backed planning artifacts.",
  "workflow_readiness_label": "registered",
  "input_refs": [
    "source_documents",
    "source_notes"
  ],
  "expected_output_groups": [
    "research_notes.md",
    "lineage_pbs.md"
  ],
  "must_preserve": [
    "evidence-backed",
    "planning",
    "runtime truth",
    "boundary"
  ],
  "scenario_facts": [
    "two source documents partially agree",
    "one unresolved ambiguity stays in research notes",
    "the output stops at planning artifacts and does not claim finished delivery"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
