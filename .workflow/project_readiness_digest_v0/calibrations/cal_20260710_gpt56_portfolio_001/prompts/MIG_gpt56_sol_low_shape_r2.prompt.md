You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=administrator.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: project_readiness_digest, status_rollup, priority_blockers, owner_input_queue, next_action_recommendations, boundary_review_note.
Serialization requirement for this corrected harness run: return exactly one valid JSON object and no Markdown fence or surrounding prose.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: project_readiness_digest_v0
kind: workflow
status: active
title: Project Readiness Digest v0
summary: Aggregate current workflow statuses, key blockers, owner-input backlog, calibration priorities, and next recommended actions into an owner-readable readiness digest without becoming a source of truth or mutating upstream artifacts.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - digest_scope_refs
  - approved_digest_policy
optional_inputs:
  - workflow_status_refs
  - review_gate_packet_refs
  - verification_plan_refs
  - source_gap_packet_refs
  - closure_loop_refs
  - owner_backlog_refs
  - calibration_priority_refs
outputs:
  - project_readiness_digest
  - status_rollup
  - priority_blockers
  - owner_input_queue
  - next_action_recommendations
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
notes:
  - This workflow is an owner-readable reporting layer. It links back to upstream packet refs instead of replacing them.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: project_readiness_digest_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_digest_binding
    title: Prepare Digest Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_digest_binding_setup
    summary: Resolve bounded digest scope and output root.
  - step_id: inventory_status_and_backlog
    title: Inventory Status And Backlog
    actor_slot: status_curator
    action:
      kind: workflow_status_and_owner_backlog_inventory
    summary: Gather workflow statuses, blockers, owner-input queues, and calibration-priority refs.
  - step_id: compose_digest
    title: Compose Digest
    actor_slot: recommendation_writer
    action:
      kind: owner_readiness_digest_write
    summary: Write status rollup, blockers, owner-input queue, and next recommendations from bounded refs.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: digest_bundle_write_and_boundary_review
    summary: Confirm no overclaim or upstream mutation before publication.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "approved_digest_policy": "Report only from bounded refs; do not mutate upstream artifacts; separate blocker, owner input, calibration priority, and next action.",
  "calibration_priority_refs": [
    {
      "priority": "next",
      "workflow_id": "owner_decision_packet_v0"
    }
  ],
  "digest_scope_refs": [
    "workflow_status:alpha",
    "review_gate:beta",
    "owner_backlog:gamma"
  ],
  "expected_output_groups": [
    "project_readiness_digest",
    "status_rollup",
    "priority_blockers",
    "owner_input_queue",
    "next_action_recommendations",
    "boundary_review_note"
  ],
  "fixture_id": "PUBLIC_SYNTH_PROJECT_READINESS_DIGEST",
  "owner_backlog_refs": [
    {
      "ask": "Confirm release scope owner",
      "priority": "high",
      "ref": "owner_backlog:gamma"
    }
  ],
  "public_safe": true,
  "review_gate_packet_refs": [
    {
      "blocker": "boundary review needs owner confirmation",
      "ref": "review_gate:beta"
    }
  ],
  "source_kind": "synthetic_from_workflow_contract",
  "workflow_id": "project_readiness_digest_v0",
  "workflow_status_refs": [
    {
      "note": "source packet validated; profile calibration pending",
      "ref": "workflow_status:alpha",
      "state": "ready_with_gap"
    },
    {
      "note": "owner decision missing for release scope",
      "ref": "workflow_status:delta",
      "state": "blocked"
    }
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
