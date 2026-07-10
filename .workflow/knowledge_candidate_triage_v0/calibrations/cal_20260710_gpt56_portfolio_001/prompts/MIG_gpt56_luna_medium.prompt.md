You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: knowledge_candidate_triage_v0
kind: workflow
status: active
title: Knowledge Candidate Triage v0
summary: Classify candidate sources and derived knowledge artifacts into inbox, CANON, packet-eligible, owner-review, hold-private, or rejected routes without overclaiming source truth or approval.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - candidate_scope_binding
  - bookshelf_state_policy
  - triage_policy
optional_inputs:
  - source_packet_refs
  - existing_source_ledger_refs
  - notebooklm_packet_refs
  - sourcebound_concept_register_refs
  - knowledge_access_rollup_refs
  - promotion_candidate_register_refs
  - owner_decision_refs
outputs:
  - candidate_triage_register
  - bookshelf_placement_decision
  - notebooklm_packet_eligibility_note
  - owner_review_queue
  - downstream_route_map
  - boundary_review_note
validation_level: pilot_executed_private_evidence
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_outputs:
      - concept_candidate_register
      - claim_ceiling_and_promotion_route
    status: optional_derived_candidate_source
  - workflow_id: knowledge_access_event_capture_v0
    expected_outputs:
      - retention_label_packet
      - orphan_redundancy_candidate_register
    status: optional_maintenance_candidate_source
downstream_workflows:
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_input: candidate_requires_sourcebound_deepening
    status: optional_source_deepening
  - workflow_id: owner_decision_packet_v0
    expected_input: candidate_requires_owner_decision
    status: optional_owner_gate
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_or_policy_change_triggered_by_candidate_triage
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - candidate_triage_register_shape
    - bookshelf_placement_decision_shape
    - notebooklm_packet_eligibility_shape
    - owner_review_queue_shape
    - downstream_route_map_shape
  does_not_own:
    - raw_source_truth
    - owner_approval_authority
    - notebooklm_runtime_operation
    - ontology_acceptance
    - canon_promotion
    - archive_or_retire_execution
  boundaries:
    candidate_labels_are_not_authority: true
    inbox_candidates_are_not_active_canon: true
    packet_eligibility_is_not_source_support: true
    no_payload_copy_into_public_package: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    candidate_triage_register: templates/candidate_triage_register.template.yaml
    bookshelf_placement_decision: templates/bookshelf_placement_decision.template.yaml
    notebooklm_packet_eligibility_note: templates/notebooklm_packet_eligibility_note.template.yaml
    owner_review_queue: templates/owner_review_queue.template.yaml
    downstream_route_map: templates/downstream_route_map.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - This workflow unifies candidate routing that was previously scattered across sourcebound outputs, manual procedure capture, and analytics candidates.
  - Recommended role posture is archivist for classification, with auditor or owner gate only when the candidate threatens to overclaim.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: knowledge_candidate_triage_v0
kind: step_graph
status: active
steps:
  - step_id: bind_candidate_scope
    title: Bind Candidate Scope
    actor_slot: triage_runner
    action:
      kind: candidate_scope_and_bookshelf_policy_binding
      requires:
        - candidate_scope_binding
        - bookshelf_state_policy
        - triage_policy
      validates:
        - owner_scope_declared
        - public_package_payload_free
        - candidate_and_canon_states_distinct
    summary: Resolve which candidate family is being triaged and which bookshelf state rules apply.
    next:
      on_success: collect_candidate_inputs
      on_fail: stop
  - step_id: collect_candidate_inputs
    title: Collect Candidate Inputs
    actor_slot: source_classifier
    action:
      kind: metadata_only_candidate_collection
      artifacts_in:
        - source_packet_refs
        - existing_source_ledger_refs
        - notebooklm_packet_refs
        - sourcebound_concept_register_refs
        - knowledge_access_rollup_refs
        - promotion_candidate_register_refs
      artifact_out: candidate_triage_register
      allowed_content:
        - stable_candidate_ref
        - candidate_type
        - current_bookshelf_state
        - visible_gap_or_reason
        - approval_basis_ref
        - usage_signal_ref
      forbidden_content:
        - raw_source_payload
        - notebooklm_answer_payload
        - secret_or_session_material
    summary: Gather candidate metadata without copying source or answer payloads.
    next:
      on_success: classify_bookshelf_and_packet_eligibility
      on_fail: stop
  - step_id: classify_bookshelf_and_packet_eligibility
    title: Classify Bookshelf And Packet Eligibility
    actor_slot: source_classifier
    action:
      kind: candidate_state_and_packet_eligibility_classification
      artifacts_in:
        - candidate_triage_register
        - bookshelf_state_policy
      artifacts_out:
        - bookshelf_placement_decision
        - notebooklm_packet_eligibility_note
      states:
        - inbox_candidate
        - canon_candidate
        - canon_approved
        - superseded
        - rejected_or_unclear
    summary: Decide the safe bookshelf state and whether the candidate can join active NotebookLM packets.
    next:
      on_success: route_owner_and_followup_actions
      on_fail: stop
  - step_id: route_owner_and_followup_actions
    title: Route Owner And Follow-up Actions
    actor_slot: promotion_router
    action:
      kind: candidate_followup_and_promotion_routing
      artifacts_in:
        - candidate_triage_register
        - bookshelf_placement_decision
        - notebooklm_packet_eligibility_note
        - owner_decision_refs
      artifacts_out:
        - owner_review_queue
        - downstream_route_map
      route_targets:
        - hold_private
        - sourcebound_deepening
        - owner_decision
        - packet_membership_update
        - reject
    summary: Preserve whether a candidate can be used now, must wait for owner review, must deepen sources, or should be rejected.
    next:
      on_success: write_boundary_review
      on_fail: stop
  - step_id: write_boundary_review
    title: Write Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: candidate_triage_boundary_review
      artifacts_in:
        - candidate_triage_register
        - bookshelf_placement_decision
        - notebooklm_packet_eligibility_note
        - owner_review_queue
        - downstream_route_map
      artifact_out: boundary_review_note
      checks:
        - no_candidate_overclaims
        - no_payload_copy
        - no_owner_approval_inference
        - no_canon_promotion_inference
    summary: Confirm that triage preserved metadata-only posture and did not convert candidate state into authority.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "knowledge_candidate_triage_v0",
  "fixture_id": "PUBLIC_SYNTH_KNOWLEDGE_CANDIDATE_TRIAGE_V0",
  "source_kind": "synthetic_from_workflow_contract_metadata_only",
  "public_safe": true,
  "workflow_title": "Knowledge Candidate Triage v0",
  "workflow_summary": "Classify candidate sources and derived knowledge artifacts into inbox, CANON, packet-eligible, owner-review, hold-private, or rejected routes without overclaiming source truth or approval.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "candidate_scope_binding",
    "bookshelf_state_policy",
    "triage_policy"
  ],
  "expected_output_groups": [
    "candidate_triage_register",
    "bookshelf_placement_decision",
    "notebooklm_packet_eligibility_note",
    "owner_review_queue",
    "downstream_route_map",
    "boundary_review_note"
  ],
  "must_preserve": [
    "triage",
    "owner review",
    "hold-private",
    "boundary",
    "no source truth claim"
  ],
  "scenario_facts": [
    "one candidate goes to packet-eligible",
    "one candidate goes to owner review",
    "one candidate stays hold-private",
    "one rejection reason is explicit"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
