You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=darkelf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: review_gate_evidence_pack_v0
kind: workflow
status: active
title: Review Gate Evidence Pack v0
summary: Assemble lightweight SRR/SFR/PDR/CDR/TRR/FCA/PCA-style review readiness packets from existing trace, interface, verification-plan, source-gap, and harness evidence without approving the review gate, certifying verification completion, or mutating upstream evidence.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - review_gate_project_binding
  - review_scope_refs
  - approved_review_gate_policy
optional_inputs:
  - review_gate_evidence_index_refs
  - trace_matrix_refs
  - evidence_authority_map_refs
  - trace_gap_register_refs
  - interface_control_packet_refs
  - harness_readiness_matrix_refs
  - source_gap_followup_packet_refs
  - verification_plan_summary_refs
  - trr_readiness_handoff_refs
  - fca_svr_handoff_index_refs
  - harness_composition_packet_refs
  - configuration_baseline_refs
  - owner_decision_refs
  - risk_or_open_question_register_refs
outputs:
  - review_gate_packet
  - source_index
  - evidence_matrix
  - entrance_criteria_checklist
  - success_criteria_checklist
  - review_blockers
  - action_item_register
  - decision_summary
  - review_gate_provenance
  - readiness_summary
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
workflow_modes:
  - scope_review_pack
  - rerun_update
  - closure_followup_refresh
review_family_values:
  - SRR_like
  - SFR_like
  - SRR_SFR_like
  - PDR_like
  - CDR_like
  - TRR_like
  - FCA_SVR_like
  - PCA_like
  - mixed_tailored
readiness_state_values:
  - ready_to_hold_review
  - ready_with_named_caveats
  - not_ready_to_hold_review
  - blocked_scope_unclear
  - blocked_missing_evidence
  - blocked_source_conflict
  - not_applicable_pending_owner
criterion_status_values:
  - met
  - partial
  - missing
  - not_applicable
blocker_scope_values:
  - blocks_review_scheduling
  - blocks_review_closure
  - weakens_review_confidence
decision_status_values:
  - no_owner_decision_recorded
  - proposed_decision_only
  - owner_decision_recorded
  - decision_deferred
upstream_workflows:
  - workflow_id: page_module_trace_matrix_v0
    expected_outputs:
      - review_gate_evidence_index
      - trace_matrix
      - evidence_authority_map
      - trace_gap_register
      - verification_seed_matrix
      - boundary_review_note
  - workflow_id: interface_control_and_harness_readiness_v0
    expected_outputs:
      - interface_control_packet
      - harness_readiness_matrix
      - blocked_interface_items
      - review_required_interface_items
      - owner_followup_needed
      - boundary_review_note
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - verification_plan_summary
      - trr_readiness_handoff
      - fca_svr_handoff_index
      - verification_gap_register
      - owner_followup_needed
      - boundary_review_note
  - workflow_id: source_gap_followup_packet_v0
    expected_outputs:
      - source_gap_followup_packet
      - owner_action_queue
      - retry_trigger_register
      - downstream_unblock_map
  - workflow_id: xml_harness_composition_v0
    expected_outputs:
      - blocked_connections
      - review_required_connections
      - candidate_safe_connections
      - source_supported_connections
      - composition_readiness
    status: optional_harness_context
downstream_workflows:
  - workflow_id: review_action_item_closure_loop_v0
    expected_input: action_item_register_and_review_blockers
    status: planned
  - workflow_id: configuration_baseline_and_change_control_v0
    expected_input: scoped_decision_summary_and_configuration_action_items
    status: planned
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: review_actions_that_change_verification_scope_or_evidence_needs
    status: rerun_trigger_only
  - workflow_id: source_gap_followup_packet_v0
    expected_input: review_actions_that_request_source_or_evidence_refresh
    status: rerun_trigger_only
review_gate_contract:
  owns:
    - review_scope_and_family_selection
    - bounded_source_index
    - review_question_to_evidence_mapping
    - entrance_criteria_checklist
    - success_criteria_checklist
    - blocker_register
    - action_item_register
    - decision_summary_with_decision_status
    - non_claims_and_overclaim_guardrails
    - review_gate_provenance_and_carry_forward
  does_not_own:
    - source_xml_mutation
    - page_module_spec_schema_design
    - upstream_packet_repair
    - official_source_acquisition
    - interface_or_harness_claim_strengthening
    - verification_plan_authoring
    - verification_execution
    - verification_result_acceptance
    - configuration_baseline_approval
    - formal_review_gate_approval
    - owner_decision_authority
  required_output_shapes:
    review_gate_packet: templates/review_gate_packet.template.yaml
    source_index: templates/source_index.template.yaml
    evidence_matrix: templates/evidence_matrix.template.yaml
    entrance_criteria_checklist: templates/entrance_criteria_checklist.template.yaml
    success_criteria_checklist: templates/success_criteria_checklist.template.yaml
    review_blockers: templates/review_blockers.template.yaml
    action_item_register: templates/action_item_register.template.yaml
    decision_summary: templates/decision_summary.template.yaml
    review_gate_provenance: templates/review_gate_provenance.template.yaml
    readiness_summary: templates/readiness_summary.template.md
    boundary_review_note: templates/boundary_review_note.template.md
    project_binding: templates/project_binding.template.yaml
  authority_boundary:
    review_gate_packet_is_review_approval: false
    readiness_summary_is_review_outcome: false
    decision_summary_creates_owner_decisions: false
    action_items_close_themselves: false
    verification_plan_handoff_is_verification_completion: false
    fca_svr_handoff_is_functional_acceptance: false
    pca_lens_is_configuration_audit_acceptance: false
    upstream_artifacts_are_read_only: true
    evidence_gaps_remain_visible: true
    owner_decisions_must_be_scoped_and_sourced: true
    public_package_contains_templates_not_raw_payloads: true
  review_family_mapping:
    SRR_like:
      question: Are stakeholder needs, scope, source basis, and open source gaps clear enough to hold the next review conversation?
      emphasis:
        - source_index
        - trace_rows
        - source_gaps
        - owner_questions
    SFR_like:
      question: Are expected functions and boundaries stable enough to shape the solution discussion?
      emphasis:
        - trace_matrix
        - interface_readiness
        - functional_decomposition
        - unresolved_ambiguity
    PDR_like:
      question: Is the proposed design direction credible enough for preliminary review and follow-up planning?
      emphasis:
        - interface_control
        - quantitative_evidence
        - harness_readiness
        - risks_and_tradeoffs
    CDR_like:
      question: Is detailed design evidence organized enough to discuss build, validation, or handoff readiness?
      emphasis:
        - finalized_trace_refs
        - interface_contracts
        - quantitative_thresholds
        - harness_readiness
        - open_blockers
    TRR_like:
      question: Is the test, simulation, inspection, analysis, or demonstration activity ready enough to discuss running it?
      emphasis:
        - verification_plan_summary
        - trr_readiness_handoff
        - procedure_and_resource_gaps
        - residual_risk
    FCA_SVR_like:
      question: Do delivered behavior claims have trace and result anchors ready for functional review once accepted result packets exist?
      emphasis:
        - trace_to_function_claims
        - verification_result_anchors
        - deviations
        - action_items
    PCA_like:
      question: Does the artifact package have enough configuration evidence to discuss physical or package alignment with the declared baseline?
      emphasis:
        - baseline_refs
        - artifact_inventory_refs
        - checksum_or_version_gaps
        - configuration_actions
  required_non_claims:
    - This evidence pack does not approve the review gate.
    - This evidence pack does not certify verification completion.
    - This evidence pack does not replace owner judgment.
    - This evidence pack does not make missing sources true.
    - This evidence pack does not mutate upstream evidence.
    - This evidence pack does not make private evidence public-safe.
notes:
  - This workflow sits after evidence-producing lanes and before an owner-led review conversation or follow-up planning loop.
  - It packages review readiness, evidence links, criteria, blockers, actions, decisions, and provenance; it does not run or close the review.
  - Entrance criteria describe whether a review conversation is worth holding; success criteria describe what the review intends to decide or unblock.
  - Decisions must be separated from proposed decisions. The workflow may record a responsible owner decision when a scoped decision source exists, but it cannot create one.
  - Public workflow canon stores only portable orchestration rules, state semantics, boundary policy, and sanitized templates.
  - Public workflow files must not contain raw project payloads, source XML bodies, vendor document text, test logs, simulation results, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: review_gate_evidence_pack_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_review_gate_binding
    title: Prepare Review Gate Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_review_gate_binding_setup
      requires:
        - review_gate_project_binding
        - review_scope_refs
        - approved_review_gate_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - review_family_is_explicit
        - owner_surface_is_explicit
        - input_refs_are_read_only
        - review_approval_claim_allowed_is_false
        - verification_completion_claim_allowed_is_false
        - upstream_mutation_allowed_is_false
        - public_package_contains_no_payloads
        - no_runtime_absolute_paths_in_public_package
      creates:
        - review_gate_output_root
        - review_gate_run_log_root
    summary: Resolve the bounded review scope, review family, owner surface, and output root before reading upstream evidence.
    next:
      on_success: build_bounded_source_index
      on_fail: stop
  - step_id: build_bounded_source_index
    title: Build Bounded Source Index
    actor_slot: source_index_curator
    action:
      kind: read_only_review_source_inventory
      artifacts_in:
        - review_gate_evidence_index_refs
        - trace_matrix_refs
        - evidence_authority_map_refs
        - trace_gap_register_refs
        - interface_control_packet_refs
        - harness_readiness_matrix_refs
        - source_gap_followup_packet_refs
        - verification_plan_summary_refs
        - trr_readiness_handoff_refs
        - fca_svr_handoff_index_refs
        - harness_composition_packet_refs
        - configuration_baseline_refs
        - owner_decision_refs
        - risk_or_open_question_register_refs
      artifact_out: source_index
      records:
        - artifact_ref
        - artifact_kind
        - owning_workflow_id
        - checksum_sha256
        - approval_scope
        - freshness_note
        - consumed_for
      forbidden_basis:
        - unbounded_chat_history
        - secret_or_session_state
        - hidden_reference_oracle
        - verifier_report
        - previous_candidate_repair_packet
        - raw_source_payload_text
        - unindexed_owner_file
        - archived_or_relocation_stub_as_canon
    summary: Inventory only approved evidence refs and their authority/freshness notes; do not copy payloads or treat unsupported files as truth.
    next:
      on_success: select_review_family_questions
      on_fail: stop
  - step_id: select_review_family_questions
    title: Select Review Family Questions
    actor_slot: review_family_mapper
    action:
      kind: review_family_question_selection
      artifacts_in:
        - source_index
        - review_scope_refs
      artifact_out: review_question_set
      review_family_values:
        - SRR_like
        - SFR_like
        - SRR_SFR_like
        - PDR_like
        - CDR_like
        - TRR_like
        - FCA_SVR_like
        - PCA_like
        - mixed_tailored
      rules:
        - primary_review_family_required
        - secondary_lenses_are_named_separately
        - mixed_tailored_pack_must_not_blur_entrance_and_success_criteria
        - review_questions_are_lightweight_local_interpretations_not_full_formal_ceremony
    summary: Select the primary review lens and secondary lenses so criteria and evidence emphasis stay explicit.
    next:
      on_success: map_evidence_to_review_questions
      on_fail: stop
  - step_id: map_evidence_to_review_questions
    title: Map Evidence To Review Questions
    actor_slot: evidence_matrix_builder
    action:
      kind: review_question_evidence_matrix_write
      artifacts_in:
        - source_index
        - review_question_set
      artifacts_out:
        - evidence_matrix
        - review_gate_packet_draft
      evidence_states:
        - supported
        - partial
        - missing
        - conflicting
        - not_applicable
      invariant: every_major_review_question_maps_to_source_refs_or_explicit_gap
      forbidden_shortcuts:
        - infer_evidence_from_filename_only
        - suppress_missing_or_conflicting_evidence
        - upgrade_review_required_to_supported_without_owner_or_source_basis
    summary: Crosswalk review questions to source refs, trace rows, readiness packets, source gaps, harness state, and explicit gaps.
    next:
      on_success: write_criteria_checklists
      on_fail: stop
  - step_id: write_criteria_checklists
    title: Write Criteria Checklists
    actor_slot: criteria_writer
    action:
      kind: entrance_and_success_criteria_write
      artifacts_in:
        - evidence_matrix
        - review_gate_packet_draft
      artifacts_out:
        - entrance_criteria_checklist
        - success_criteria_checklist
      criterion_status_values:
        - met
        - partial
        - missing
        - not_applicable
      rules:
        - entrance_criteria_are_review_readiness_checks_not_system_pass_fail
        - success_criteria_are_review_outcomes_not_implementation_promises
        - each_criterion_has_evidence_ref_or_explicit_gap
        - unmet_criteria_name_owner_or_routing_surface
    summary: Separate readiness-to-hold criteria from desired review outcomes and preserve partial/missing states.
    next:
      on_success: classify_blockers_and_actions
      on_fail: stop
  - step_id: classify_blockers_and_actions
    title: Classify Blockers And Actions
    actor_slot: blocker_action_router
    action:
      kind: review_blocker_and_action_register_write
      artifacts_in:
        - evidence_matrix
        - entrance_criteria_checklist
        - success_criteria_checklist
        - source_index
      artifacts_out:
        - review_blockers
        - action_item_register
      blocker_scope_values:
        - blocks_review_scheduling
        - blocks_review_closure
        - weakens_review_confidence
      action_rules:
        - action_items_have_owner_or_responsible_surface
        - action_items_have_evidence_target
        - action_items_have_trigger_or_due_condition
        - action_items_do_not_count_as_closed_without_external_evidence
        - retry_actions_route_to_narrowest_owning_workflow
    summary: Preserve missing source, conflicting trace, unresolved owner decision, absent harness, unstable interface, and quantitative gaps as actionable records.
    next:
      on_success: write_decision_summary_and_non_claims
      on_fail: stop
  - step_id: write_decision_summary_and_non_claims
    title: Write Decision Summary And Non-Claims
    actor_slot: decision_recorder
    action:
      kind: decision_summary_and_non_claim_guardrail_write
      artifacts_in:
        - review_gate_packet_draft
        - entrance_criteria_checklist
        - success_criteria_checklist
        - review_blockers
        - action_item_register
        - owner_decision_refs
      artifacts_out:
        - decision_summary
        - readiness_summary
        - review_gate_packet
      decision_status_values:
        - no_owner_decision_recorded
        - proposed_decision_only
        - owner_decision_recorded
        - decision_deferred
      readiness_state_values:
        - ready_to_hold_review
        - ready_with_named_caveats
        - not_ready_to_hold_review
        - blocked_scope_unclear
        - blocked_missing_evidence
        - blocked_source_conflict
        - not_applicable_pending_owner
      required_non_claims:
        - no_review_gate_approval_claim
        - no_verification_completion_claim
        - no_owner_judgment_replacement_claim
        - no_missing_source_truth_claim
        - no_private_to_public_safety_claim
      rules:
        - actual_decisions_require_scoped_owner_decision_ref
        - proposed_decisions_are_labeled_separately
        - readiness_summary_is_scheduling_or_conversation_readiness_only
    summary: Write decisions only when sourced, otherwise label proposals or deferrals and include explicit non-claims.
    next:
      on_success: write_provenance_and_boundary_review
      on_fail: stop
  - step_id: write_provenance_and_boundary_review
    title: Write Provenance And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: review_gate_bundle_boundary_and_overclaim_review
      artifacts_in:
        - review_gate_packet
        - source_index
        - evidence_matrix
        - entrance_criteria_checklist
        - success_criteria_checklist
        - review_blockers
        - action_item_register
        - decision_summary
        - readiness_summary
      artifacts_out:
        - review_gate_provenance
        - boundary_review_note
      checks:
        - every_review_question_has_evidence_or_gap
        - entrance_and_success_criteria_are_separate
        - blockers_distinguish_scheduling_from_closure
        - action_items_have_evidence_targets
        - decisions_are_separate_from_recommendations
        - non_claims_present
        - no_review_approval_or_verification_completion_overclaim
        - no_upstream_artifact_mutation
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Finalize provenance, boundary checks, output counts, blockers, actions, decision status, and the best first pilot route.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "fixture_id": "SYNTH_REVIEW_DEMO",
  "public_safe": true,
  "project_binding": {
    "project_code": "SYNTH_REVIEW_DEMO",
    "review_family": "TRR_like",
    "secondary_lenses": ["PDR_like"],
    "owner_surface": "synthetic_owner_board",
    "approval_claim_allowed": false,
    "verification_completion_claim_allowed": false,
    "upstream_mutation_allowed": false
  },
  "review_scope_refs": {
    "scope_id": "synthetic_ctrl_board_harness_trr",
    "scope_summary": "Review readiness for holding a TRR-style conversation about a simulated controller-board XML harness and verification-plan handoff."
  },
  "sources": [
    {"ref": "TM-001", "checksum_sha256": "sha256:demo-tm001", "owning_workflow_id": "page_module_trace_matrix_v0", "summary": "Power supported; CAN partial; reset conflicting."},
    {"ref": "EAM-001", "checksum_sha256": "sha256:demo-eam001", "owning_workflow_id": "page_module_trace_matrix_v0", "summary": "Power authoritative; CAN informative; reset proposed only."},
    {"ref": "ICP-001", "checksum_sha256": "sha256:demo-icp001", "owning_workflow_id": "interface_control_and_harness_readiness_v0", "summary": "PWR stable; CAN_TERM review_required; RESET conflicting."},
    {"ref": "HRM-001", "checksum_sha256": "sha256:demo-hrm001", "owning_workflow_id": "interface_control_and_harness_readiness_v0", "summary": "Smoke harness available; CAN loopback fixture absent; reset timing probe not configured."},
    {"ref": "VPS-001", "checksum_sha256": "sha256:demo-vps001", "owning_workflow_id": "verification_plan_from_page_contracts_v0", "summary": "VT-PWR-001 ready; VT-CAN-002 blocked on fixture; VT-RST-003 blocked on timing source conflict."},
    {"ref": "TRR-001", "checksum_sha256": "sha256:demo-trr001", "owning_workflow_id": "verification_plan_from_page_contracts_v0", "summary": "Ready_with_named_caveats only if CAN/reset blockers are named."},
    {"ref": "SGF-001", "checksum_sha256": "sha256:demo-sgf001", "owning_workflow_id": "source_gap_followup_packet_v0", "summary": "GAP-CAN-TERM and GAP-RST-TIMING open."},
    {"ref": "ODR-001", "checksum_sha256": "sha256:demo-odr001", "owning_workflow_id": "synthetic_owner_board", "summary": "No recorded owner decision; reset proposal exists but is not accepted."},
    {"ref": "RR-001", "checksum_sha256": "sha256:demo-rr001", "owning_workflow_id": "synthetic_owner_board", "summary": "CAN fixture absence may block TRR execution; reset conflict may weaken confidence."}
  ],
  "required_outputs": [
    "review_gate_packet",
    "source_index",
    "evidence_matrix",
    "entrance_criteria_checklist",
    "success_criteria_checklist",
    "review_blockers",
    "action_item_register",
    "decision_summary",
    "review_gate_provenance",
    "readiness_summary",
    "boundary_review_note"
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
