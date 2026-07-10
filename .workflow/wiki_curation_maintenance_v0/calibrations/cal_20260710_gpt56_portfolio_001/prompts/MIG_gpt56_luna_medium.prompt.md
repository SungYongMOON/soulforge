You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: wiki_curation_maintenance_v0
kind: workflow
status: active
title: Wiki Curation Maintenance v0
summary: Maintain project wiki state after bounded work by producing metadata-only update packets for source ledgers, packet maps, notebook bindings, lifecycle states, residual gaps, and review handoff.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - curation_scope_binding
  - curation_policy
  - lifecycle_policy
optional_inputs:
  - project_source_ledger_refs
  - project_notebook_binding_refs
  - notebooklm_packet_map_refs
  - preflight_handoff_refs
  - candidate_triage_refs
  - sourcebound_packet_refs
  - knowledge_access_rollup_refs
  - owner_decision_refs
outputs:
  - source_ledger_curation_packet
  - packet_map_update_note
  - notebook_binding_update_note
  - lifecycle_state_delta
  - residual_gap_register
  - review_handoff
  - boundary_review_note
validation_level: pilot_executed_private_evidence
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: monster_knowledge_preflight_v0
    expected_outputs:
      - main_workflow_handoff
      - claim_ceiling_seed
    status: optional_preflight_context
  - workflow_id: knowledge_candidate_triage_v0
    expected_outputs:
      - bookshelf_placement_decision
      - notebooklm_packet_eligibility_note
      - downstream_route_map
    status: optional_candidate_context
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_outputs:
      - sourcebound_knowledge_packet_manifest
      - concept_candidate_register
      - claim_ceiling_and_promotion_route
    status: optional_sourcebound_context
  - workflow_id: knowledge_access_event_capture_v0
    expected_outputs:
      - usage_rollup
      - retention_label_packet
    status: optional_usage_context
downstream_workflows:
  - workflow_id: owner_decision_packet_v0
    expected_input: curation_requires_owner_decision
    status: optional_owner_gate
  - workflow_id: post_development_review_gate_v0
    expected_input: curation_changed_claim_or_policy_posture
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - source_ledger_curation_packet_shape
    - packet_map_update_note_shape
    - notebook_binding_update_note_shape
    - lifecycle_state_delta_shape
    - residual_gap_register_shape
    - review_handoff_shape
  does_not_own:
    - source_truth
    - notebooklm_runtime_operation
    - owner_approval_authority
    - canon_promotion
    - archive_or_retire_execution
    - graph_mutation
  boundaries:
    metadata_only_updates: true
    packet_membership_is_not_authority: true
    drive_folder_existence_is_not_source_truth: true
    no_payload_copy_into_public_package: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    source_ledger_curation_packet: templates/source_ledger_curation_packet.template.yaml
    packet_map_update_note: templates/packet_map_update_note.template.yaml
    notebook_binding_update_note: templates/notebook_binding_update_note.template.yaml
    lifecycle_state_delta: templates/lifecycle_state_delta.template.yaml
    residual_gap_register: templates/residual_gap_register.template.yaml
    review_handoff: templates/review_handoff.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - This workflow produces curation packets and notes, not direct source-truth claims.
  - It is the executable companion to the workspace runbook, not a replacement for owner decisions or sourcebound review.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: wiki_curation_maintenance_v0
kind: step_graph
status: active
steps:
  - step_id: bind_curation_scope
    title: Bind Curation Scope
    actor_slot: curation_runner
    action:
      kind: project_wiki_curation_scope_binding
      requires:
        - curation_scope_binding
        - curation_policy
        - lifecycle_policy
      validates:
        - project_owner_scope_declared
        - payload_free_public_package
        - lifecycle_actions_are_metadata_only
    summary: Resolve which project wiki surfaces and lifecycle rules are in scope before any curation update is proposed.
    next:
      on_success: inspect_current_wiki_state
      on_fail: stop
  - step_id: inspect_current_wiki_state
    title: Inspect Current Wiki State
    actor_slot: curation_runner
    action:
      kind: project_source_ledger_packet_map_and_binding_inventory
      artifacts_in:
        - project_source_ledger_refs
        - project_notebook_binding_refs
        - notebooklm_packet_map_refs
        - preflight_handoff_refs
        - candidate_triage_refs
        - sourcebound_packet_refs
      artifacts_out:
        - source_ledger_curation_packet
      allowed_content:
        - source_handle
        - packet_handle
        - notebook_binding_ref
        - drive_ref
        - lifecycle_state
        - gap_ref
      forbidden_content:
        - source_payload_body
        - notebooklm_answer_payload
        - auth_or_session_material
    summary: Inspect the current wiki surfaces and collect only the metadata needed to propose safe curation changes.
    next:
      on_success: plan_packet_and_binding_updates
      on_fail: stop
  - step_id: plan_packet_and_binding_updates
    title: Plan Packet And Binding Updates
    actor_slot: curation_archivist
    action:
      kind: packet_membership_binding_and_ledger_update_planning
      artifacts_in:
        - source_ledger_curation_packet
        - knowledge_access_rollup_refs
      artifacts_out:
        - packet_map_update_note
        - notebook_binding_update_note
      rules:
        packet_membership_is_metadata_only: true
        notebook_binding_note_is_not_source_truth: true
        residual_gap_must_remain_visible: true
    summary: Decide how packet membership and notebook-binding notes should change without overstating approval or source truth.
    next:
      on_success: plan_lifecycle_and_gap_updates
      on_fail: stop
  - step_id: plan_lifecycle_and_gap_updates
    title: Plan Lifecycle And Gap Updates
    actor_slot: curation_archivist
    action:
      kind: lifecycle_state_and_residual_gap_update_planning
      artifacts_in:
        - source_ledger_curation_packet
        - packet_map_update_note
        - notebook_binding_update_note
        - owner_decision_refs
      artifacts_out:
        - lifecycle_state_delta
        - residual_gap_register
      states:
        - candidate
        - owner_approved
        - superseded
        - rejected
        - review_required
    summary: Record lifecycle and gap deltas so reusable wiki state stays honest about approval, replacement, and unresolved scope.
    next:
      on_success: assemble_review_handoff
      on_fail: stop
  - step_id: assemble_review_handoff
    title: Assemble Review Handoff
    actor_slot: boundary_reviewer
    action:
      kind: curation_review_handoff_and_boundary_review
      artifacts_in:
        - source_ledger_curation_packet
        - packet_map_update_note
        - notebook_binding_update_note
        - lifecycle_state_delta
        - residual_gap_register
      artifacts_out:
        - review_handoff
        - boundary_review_note
      checks:
        - no_source_truth_overclaim
        - no_owner_approval_inference
        - no_payload_copy
        - no_graph_or_archive_execution
    summary: Package the curation result for downstream review and confirm that the output remains metadata-only.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "wiki_curation_maintenance_v0",
  "fixture_id": "PUBLIC_SYNTH_WIKI_CURATION_MAINTENANCE_V0",
  "source_kind": "synthetic_from_workflow_contract_metadata_only",
  "public_safe": true,
  "workflow_title": "Wiki Curation Maintenance v0",
  "workflow_summary": "Maintain project wiki state after bounded work by producing metadata-only update packets for source ledgers, packet maps, notebook bindings, lifecycle states, residual gaps, and review handoff.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "curation_scope_binding",
    "curation_policy",
    "lifecycle_policy"
  ],
  "expected_output_groups": [
    "source_ledger_curation_packet",
    "packet_map_update_note",
    "notebook_binding_update_note",
    "lifecycle_state_delta",
    "residual_gap_register",
    "review_handoff",
    "boundary_review_note"
  ],
  "must_preserve": [
    "metadata-only",
    "curation",
    "residual gap",
    "boundary",
    "no source-truth claim"
  ],
  "scenario_facts": [
    "one source ledger update",
    "one packet map update",
    "one residual gap",
    "one review handoff"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
