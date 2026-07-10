You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: owner_decision_packet, decision_effect_register, downstream_effect_map, boundary_review_note.
Serialization requirement for this corrected harness run: return exactly one valid JSON object and no Markdown fence or surrounding prose.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: owner_decision_packet_v0
kind: workflow
status: active
title: Owner Decision Packet v0
summary: Record scoped owner decisions, approval boundaries, affected artifacts, and downstream effects in a reusable packet without mutating upstream artifacts or overstating technical evidence.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - owner_decision_scope
  - owner_decision_statement
  - owner_decision_policy
optional_inputs:
  - affected_workflow_refs
  - evidence_basis_refs
  - affected_page_asset_refs
  - affected_harness_refs
  - affected_connection_refs
outputs:
  - owner_decision_packet
  - decision_effect_register
  - downstream_effect_map
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
notes:
  - This workflow defines a reusable owner-decision packet shape for later workflows that already accept `owner_decision_refs`.
  - It records scope and effect; it does not itself make technical evidence true.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: owner_decision_packet_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_decision_binding
    title: Prepare Decision Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_owner_decision_binding_setup
    summary: Resolve bounded decision scope and output root.
  - step_id: curate_decision
    title: Curate Decision
    actor_slot: decision_curator
    action:
      kind: scoped_owner_decision_inventory
    summary: Record the scoped decision, affected surfaces, and evidence basis refs.
  - step_id: map_effects
    title: Map Effects
    actor_slot: effect_mapper
    action:
      kind: downstream_effect_and_non_claim_mapping
    summary: Map downstream impact and preserve what the decision does not prove.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: owner_decision_bundle_write_and_boundary_review
    summary: Confirm no upstream mutation and no overclaim of technical evidence.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "affected_workflow_refs": [
    "workflow:project_readiness_digest_v0"
  ],
  "evidence_basis_refs": [
    "decision-note:public-synthetic-001"
  ],
  "expected_output_groups": [
    "owner_decision_packet",
    "decision_effect_register",
    "downstream_effect_map",
    "boundary_review_note"
  ],
  "fixture_id": "PUBLIC_SYNTH_OWNER_DECISION_PACKET",
  "owner_decision_policy": "Record scope, affected artifacts, downstream effects, and non-claims. Do not mutate upstream artifacts or claim tests passed.",
  "owner_decision_scope": "public sample release naming convention only",
  "owner_decision_statement": "Owner approves renaming the public sample output field from old_label to display_label for future examples.",
  "public_safe": true,
  "source_kind": "synthetic_from_workflow_contract",
  "workflow_id": "owner_decision_packet_v0"
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
