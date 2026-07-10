You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=orc; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: formal_minutes, action_items, followup_note.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: meeting_followup
kind: workflow
status: active
title: Meeting Follow-up
summary: Turn public-safe meeting notes into formal minutes, action items, and a follow-up note while preserving uncertainty and non-invention boundaries.
entrypoint: run
execution_mode: party_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
calibrations: calibrations/
history: history/
inputs:
  - meeting_followup_request
outputs:
  - formal_minutes
  - action_items
  - followup_note
notes:
  - This workflow owns the reusable meeting follow-up procedure and its profile calibration policy.
  - Runtime meeting source material and private transcripts do not belong in this workflow canon.
  - Public-safe synthetic or redacted profile calibration archives live under `calibrations/`.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: meeting_followup
kind: step_graph
status: active
steps:
  - step_id: extract_minutes
    title: Extract Minutes
    actor_slot: minutes_writer
    next:
      - derive_actions
  - step_id: derive_actions
    title: Derive Actions
    actor_slot: action_tracker
    next:
      - build_followup_note
  - step_id: build_followup_note
    title: Build Follow-up Note
    actor_slot: action_tracker
    next:
      - boundary_review
  - step_id: boundary_review
    title: Boundary Review
    actor_slot: boundary_reviewer
    next: []


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "meeting_followup",
  "fixture_id": "PUBLIC_MEETING_SMOKE",
  "request_type": "meeting_followup_request",
  "source_kind": "synthetic_public_safe",
  "public_safe": true,
  "original_matrix_fixture_label": "PUBLIC_MEETING_SMOKE meeting_followup_request",
  "fixture_source_status": "reconstructed_public_fixture_for_archive",
  "meeting_title": "UI Theme Package Release Readiness",
  "named_people": [
    "Minjun",
    "Seoyeon",
    "Doyun",
    "Hara"
  ],
  "facts": [
    "No customer or external partner was named.",
    "Public release target is Friday 15:00 KST only if smoke passes.",
    "Wednesday was an internal stretch goal only, not the final public release date.",
    "Hara proposed changing smoke-theme-pack.mjs to ignore packageName mismatch; that proposal was rejected.",
    "Final decision: check package config first, and only review the script if the contract is wrong.",
    "Minjun reruns smoke by Friday 10:00 KST.",
    "Doyun writes the failure triage note in action_items.md by Friday 12:00 KST.",
    "README install steps should be reviewed by Thursday if possible, but no owner was assigned.",
    "Hara checks the generated tarball path after Minjun posts smoke results; no exact deadline was assigned.",
    "Risk: wrong tarball path delays release.",
    "Risk: stale README install steps may mislead users.",
    "Open question: who has release approval authority.",
    "Open question: whether the release note should mention the Wednesday stretch goal.",
    "Do not invent customer name, budget, security incident, production outage, legal approval, extra owner, or unstated deadline."
  ],
  "expected_output_groups": [
    "formal_minutes",
    "action_items",
    "followup_note"
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
