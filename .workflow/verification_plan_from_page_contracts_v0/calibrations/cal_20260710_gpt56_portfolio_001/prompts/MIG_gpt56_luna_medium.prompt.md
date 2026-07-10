You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=human; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: verification_plan_from_page_contracts_v0
kind: workflow
status: active
title: Verification Plan From Page Contracts v0
summary: Convert page/module trace rows, quantitative gaps, source gaps, interface-control ceilings, harness blockers, and scoped owner decisions into explicit verification planning packets without claiming that verification execution, approval, or pass/fail results already exist.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - verification_plan_project_binding
  - verification_scope_refs
  - approved_verification_planning_policy
optional_inputs:
  - page_module_spec_refs
  - verification_seed_matrix_refs
  - trace_matrix_refs
  - evidence_authority_map_refs
  - trace_gap_register_refs
  - official_source_packet_refs
  - component_materials_packet_refs
  - layout_guide_packet_refs
  - quantitative_enrichment_packet_refs
  - simulation_source_packet_refs
  - interface_control_packet_refs
  - harness_composition_packet_refs
  - source_gap_followup_packet_refs
  - configuration_baseline_refs
  - owner_decision_refs
  - test_or_simulation_resource_policy_refs
outputs:
  - verification_plan
  - verification_requirements_matrix
  - method_map
  - evidence_need_register
  - verification_gap_register
  - test_or_simulation_readiness
  - owner_followup_needed
  - trr_readiness_handoff
  - fca_svr_handoff_index
  - verification_plan_summary
  - verification_plan_provenance
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
workflow_modes:
  - skeleton
  - plan_from_trace
  - plan_from_harness
  - rerun_update
method_values:
  - inspection
  - analysis
  - simulation
  - test
  - demonstration
  - owner_review
  - not_ready
readiness_state_values:
  - plan_ready
  - plan_ready_with_prerequisites
  - owner_review_required
  - blocked_missing_evidence
  - blocked_source_conflict
  - blocked_configuration
  - not_applicable_pending_owner
upstream_workflows:
  - workflow_id: page_module_trace_matrix_v0
    expected_outputs:
      - verification_seed_matrix
      - trace_matrix
      - evidence_authority_map
      - trace_gap_register
      - harness_trace_delta
  - workflow_id: page_quantitative_enrichment_v0
    expected_outputs:
      - quantitative_claims
      - source_gap_report
      - owner_followup_needed
      - harness_readiness_delta
    status: optional_but_required_for_quantitative_criteria
  - workflow_id: simulation_source_collect_v0
    expected_outputs:
      - simulation_source_packet
      - model_inventory
      - simulator_compatibility_matrix
      - missing_models
      - access_blockers
    status: optional_when_simulation_is_a_possible_method
  - workflow_id: interface_control_and_harness_readiness_v0
    expected_outputs:
      - interface_control_ledger
      - harness_readiness_matrix
      - blocked_interface_items
      - review_required_interface_items
      - candidate_safe_possible_items
      - source_supported_possible_items
  - workflow_id: xml_harness_composition_v0
    expected_outputs:
      - blocked_connections
      - review_required_connections
      - candidate_safe_connections
      - source_supported_connections
      - owner_followup_needed
      - composition_readiness
  - workflow_id: source_gap_followup_packet_v0
    expected_outputs:
      - source_gap_followup_packet
      - owner_action_queue
      - retry_trigger_register
      - downstream_unblock_map
    status: optional_gap_route_input
downstream_workflows:
  - workflow_id: test_harness_asset_planning_v0
    expected_input: test_or_simulation_readiness_and_trr_readiness_handoff
    status: planned
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: verification_plan_summary_and_trr_readiness_handoff
    status: planned
  - workflow_id: functional_configuration_audit_page_library_v0
    expected_input: fca_svr_handoff_index_after_accepted_result_packets_exist
    status: later_result_consumer_only
  - workflow_id: source_gap_followup_packet_v0
    expected_input: verification_gap_register_and_owner_followup_needed
verification_plan_contract:
  owns:
    - verification_item_identity
    - method_assignment_and_rationale
    - evidence_needed_rows
    - criteria_seed_status
    - blocked_readiness_and_owner_review_routing
    - test_or_simulation_readiness_planning
    - trr_preparation_handoff_index
    - fca_svr_expected_result_anchor_index
    - verification_plan_provenance_and_rerun_delta
  does_not_own:
    - source_xml_mutation
    - page_module_spec_schema_design
    - official_source_acquisition
    - component_material_truth
    - layout_guidance_extraction
    - quantitative_value_truth
    - simulation_model_collection
    - simulation_deck_generation
    - simulation_execution
    - physical_or_tool_test_execution
    - harness_connection_promotion
    - configuration_baseline_approval
    - verification_result_acceptance
    - trr_approval
    - fca_svr_acceptance
  required_output_shapes:
    verification_plan: templates/verification_plan.template.yaml
    verification_requirements_matrix: templates/verification_requirements_matrix.template.yaml
    method_map: templates/method_map.template.yaml
    evidence_need_register: templates/evidence_need_register.template.yaml
    verification_gap_register: templates/verification_gap_register.template.yaml
    test_or_simulation_readiness: templates/test_or_simulation_readiness.template.yaml
    owner_followup_needed: templates/owner_followup_needed.template.yaml
    trr_readiness_handoff: templates/trr_readiness_handoff.template.yaml
    fca_svr_handoff_index: templates/fca_svr_handoff_index.template.yaml
    verification_plan_provenance: templates/verification_plan_provenance.template.yaml
    verification_plan_summary: templates/verification_plan_summary.template.md
    boundary_review_note: templates/boundary_review_note.template.md
  authority_boundary:
    verification_plan_is_verification_result: false
    verification_requirements_matrix_is_pass_fail_record: false
    method_map_executes_methods: false
    test_or_simulation_readiness_is_execution_readiness_only: true
    trr_handoff_is_trr_approval: false
    fca_svr_index_is_acceptance_evidence: false
    owner_followup_is_owner_decision: false
    missing_evidence_can_be_suppressed: false
    upstream_artifacts_are_read_only: true
    source_conflicts_block_affected_items: true
    criteria_seed_requires_allowed_evidence_or_remains_blocked: true
  stable_verification_item_id_rule:
    stable_id_basis:
      - verification_scope_key
      - trace_row_id_or_provisional_claim_key
      - page_asset_id
      - claim_kind
      - normalized_field_path
      - interface_or_harness_or_baseline_scope
    same_id_when: the same bounded claim is rerun over refreshed upstream packet refs and remains the same verification item.
    supersede_id_when: claim text, evidence authority, interface scope, harness connection, configuration baseline, or owner decision changes enough that later result packets would not be equivalent.
  missing_evidence_policy:
    missing_source_or_quantity: block_or_route_to_owner_followup
    missing_model_or_deck: keep_simulation_items_not_ready
    missing_configuration_baseline: block_test_and_trr_readiness
    source_conflict: block_as_blocked_source_conflict
    review_required_harness_claim: require_owner_review_or_prerequisite_analysis_before_execution_item
    blocked_harness_claim: preserve_blocker_and_do_not_create_assumptive_test_or_simulation_item
notes:
  - This workflow sits after trace, quantitative, simulation-source, interface-control, harness, and source-gap lanes as a verification planning and governance layer.
  - It writes planned verification items, method assignments, prerequisites, criteria seeds, readiness states, and follow-up routes; it does not execute or accept verification.
  - Inspection, analysis, simulation, test, demonstration, owner-review, and not-ready are distinct method states and must not be collapsed into a generic review status.
  - Missing evidence, review-needed decisions, source conflicts, unbaselined configuration, missing models, and blocked harness connections remain first-class blockers or owner follow-up rows.
  - Public workflow canon stores only portable orchestration rules, state semantics, boundary policy, and sanitized templates.
  - Public workflow files must not contain raw XML bodies, private project payloads, vendor document text, model payloads, test logs, simulation results, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: verification_plan_from_page_contracts_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_verification_plan_binding
    title: Prepare Verification Plan Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_verification_plan_binding_setup
      requires:
        - verification_plan_project_binding
        - verification_scope_refs
        - approved_verification_planning_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - verification_execution_allowed_is_false
        - verification_completion_claim_allowed_is_false
        - input_refs_are_read_only
        - approval_scope_is_recorded_for_each_ref
        - public_package_contains_no_payloads
        - no_runtime_absolute_paths_in_public_package
      creates:
        - verification_plan_output_root
        - verification_plan_run_log_root
    summary: Resolve the project-local output root and lock the run as planning-only before any method assignment is attempted.
    next:
      on_success: build_planning_input_set
      on_fail: stop
  - step_id: build_planning_input_set
    title: Build Planning Input Set
    actor_slot: input_packet_curator
    action:
      kind: read_only_verification_planning_input_inventory
      artifacts_in:
        - page_module_spec_refs
        - verification_seed_matrix_refs
        - trace_matrix_refs
        - evidence_authority_map_refs
        - trace_gap_register_refs
        - official_source_packet_refs
        - component_materials_packet_refs
        - layout_guide_packet_refs
        - quantitative_enrichment_packet_refs
        - simulation_source_packet_refs
        - interface_control_packet_refs
        - harness_composition_packet_refs
        - source_gap_followup_packet_refs
        - configuration_baseline_refs
        - owner_decision_refs
        - test_or_simulation_resource_policy_refs
      artifact_out: verification_planning_input_set
      records:
        - artifact_ref
        - artifact_kind
        - owning_workflow_id
        - checksum_sha256
        - approval_scope
        - page_asset_ids
        - harness_ids
        - baseline_refs
        - evidence_authority_hint
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - accepted_verification_result
        - previous_candidate_repair_packet
        - secret_or_session_state
        - raw_source_payload_text
        - unindexed_owner_file
        - unapproved_simulation_or_test_result
    summary: Inventory approved upstream packet refs and authority hints without treating filenames, private payloads, or accepted results as planning evidence.
    next:
      on_success: enumerate_verification_items
      on_fail: stop
  - step_id: enumerate_verification_items
    title: Enumerate Verification Items
    actor_slot: verification_item_builder
    action:
      kind: atomic_verification_item_enumeration
      artifacts_in:
        - verification_planning_input_set
      artifact_out: verification_items_draft
      preferred_input: verification_seed_matrix_refs
      fallback_policy:
        skeleton_mode_must_be_explicit: true
        provisional_rows_are_not_ready: true
        trace_rerun_request_required_for_missing_seed_matrix: true
      claim_kinds:
        - asset_identity
        - module_scope
        - function_claim
        - interface_group
        - interface_item
        - quantitative_constraint
        - source_packet_coverage
        - layout_readiness
        - pspice_readiness
        - harness_connection_claim
        - open_question
        - verification_need
      granularity_rule: one_atomic_claim_per_verification_item
      stable_id_policy:
        preserve_existing_verification_item_ids_when_same_claim_reruns: true
        split_mixed_evidence_claims: true
        supersede_materially_changed_claims: true
    summary: Convert trace seeds and bounded page or harness claims into small verification-planning items without accepting them as verified.
    next:
      on_success: assign_methods_and_evidence_needs
      on_fail: stop
  - step_id: assign_methods_and_evidence_needs
    title: Assign Methods And Evidence Needs
    actor_slot: method_planner
    action:
      kind: conservative_method_assignment_and_need_mapping
      artifacts_in:
        - verification_items_draft
        - verification_planning_input_set
      artifacts_out:
        - verification_items_with_methods
        - evidence_need_register
      method_values:
        - inspection
        - analysis
        - simulation
        - test
        - demonstration
        - owner_review
        - not_ready
      rules:
        - inspection_does_not_replace_analysis_simulation_or_test
        - simulation_requires_model_deck_policy_stimuli_measurements_and_criteria_or_stays_not_ready
        - test_requires_configuration_procedure_resources_measurements_and_criteria_or_stays_blocked
        - owner_review_resolves_authority_or_intent_not_engineering_evidence
        - pass_fail_criteria_seed_requires_approved_source_or_owner_decision_basis
        - missing_evidence_creates_gap_before_criteria
    summary: Assign one primary method and optional secondary methods while writing evidence needs before any criteria seed.
    next:
      on_success: route_gaps_and_owner_followup
      on_fail: stop
  - step_id: route_gaps_and_owner_followup
    title: Route Gaps And Owner Follow-Up
    actor_slot: gap_and_owner_router
    action:
      kind: verification_gap_and_owner_action_write
      artifacts_in:
        - verification_items_with_methods
        - evidence_need_register
        - verification_planning_input_set
      artifacts_out:
        - verification_gap_register
        - owner_followup_needed
      gap_types:
        - missing_source_ref
        - missing_quantitative_value
        - missing_layout_constraint
        - missing_simulation_model
        - missing_simulation_deck
        - missing_test_fixture
        - missing_tool_or_instrument
        - missing_configuration_baseline
        - missing_procedure
        - missing_owner_decision
        - source_conflict
        - version_or_checksum_conflict
        - harness_blocked
        - harness_review_required
        - private_boundary_unclear
      invariant: every_missing_conflict_or_review_required_prerequisite_has_gap_or_owner_route
    summary: Preserve missing evidence, source conflicts, blocked harness state, and owner decisions as explicit blockers or review-needed actions.
    next:
      on_success: write_matrix_and_method_map
      on_fail: stop
  - step_id: write_matrix_and_method_map
    title: Write Matrix And Method Map
    actor_slot: matrix_writer
    action:
      kind: verification_matrix_and_method_map_write
      artifacts_in:
        - verification_items_with_methods
        - evidence_need_register
        - verification_gap_register
        - owner_followup_needed
      artifacts_out:
        - verification_plan
        - verification_requirements_matrix
        - method_map
      readiness_states:
        - plan_ready
        - plan_ready_with_prerequisites
        - owner_review_required
        - blocked_missing_evidence
        - blocked_source_conflict
        - blocked_configuration
        - not_applicable_pending_owner
      not_claimed:
        - verification_execution
        - verification_passed
        - verification_failed
        - verification_accepted
    summary: Write the main plan, requirements matrix, and method map as planning artifacts only.
    next:
      on_success: assess_test_or_simulation_readiness
      on_fail: stop
  - step_id: assess_test_or_simulation_readiness
    title: Assess Test Or Simulation Readiness
    actor_slot: readiness_planner
    action:
      kind: execution_readiness_planning_only
      artifacts_in:
        - verification_requirements_matrix
        - method_map
        - evidence_need_register
        - verification_gap_register
        - owner_followup_needed
        - verification_planning_input_set
      artifact_out: test_or_simulation_readiness
      checks:
        - simulation_items_have_models_decks_policy_stimuli_measurements_and_criteria_or_blockers
        - test_items_have_configuration_procedure_resources_measurements_and_criteria_or_blockers
        - demonstration_items_have_observable_behavior_script_or_owner_review_route
        - no_simulation_or_test_results_are_created_or_accepted
    summary: Separate future execution readiness from actual execution so later workflows know what must be prepared first.
    next:
      on_success: build_review_and_audit_handoffs
      on_fail: stop
  - step_id: build_review_and_audit_handoffs
    title: Build Review And Audit Handoffs
    actor_slot: handoff_indexer
    action:
      kind: trr_and_fca_svr_planning_handoff_write
      artifacts_in:
        - verification_plan
        - verification_requirements_matrix
        - method_map
        - test_or_simulation_readiness
        - verification_gap_register
        - owner_followup_needed
      artifacts_out:
        - trr_readiness_handoff
        - fca_svr_handoff_index
      rules:
        - trr_handoff_lists_prerequisites_and_blockers_not_trr_pass
        - fca_svr_index_lists_expected_future_result_refs_not_accepted_evidence
        - waivers_or_not_applicable_states_require_scoped_owner_decision_refs
    summary: Give later review and audit workflows stable planned anchors without treating the plan as approval or verification evidence.
    next:
      on_success: write_plan_bundle_and_boundary_review
      on_fail: stop
  - step_id: write_plan_bundle_and_boundary_review
    title: Write Plan Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: verification_plan_bundle_boundary_and_overclaim_review
      artifacts_in:
        - verification_plan
        - verification_requirements_matrix
        - method_map
        - evidence_need_register
        - verification_gap_register
        - test_or_simulation_readiness
        - owner_followup_needed
        - trr_readiness_handoff
        - fca_svr_handoff_index
      artifacts_out:
        - verification_plan_provenance
        - verification_plan_summary
        - boundary_review_note
      checks:
        - every_item_has_stable_verification_item_id
        - every_item_links_to_trace_row_or_is_provisional_skeleton
        - every_method_assignment_has_rationale
        - every_missing_or_review_needed_state_has_gap_or_owner_route
        - source_conflicts_are_blocking
        - simulation_and_test_items_do_not_claim_execution_results
        - trr_and_fca_svr_handoffs_do_not_claim_approval_or_acceptance
        - no_upstream_artifact_mutation
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Finalize the plan bundle and report counts, blockers, owner follow-up, and the narrowest next pilot route.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "fixture_id": "synthetic_public_verification_plan_fixture_20260515_001",
  "workflow_id": "verification_plan_from_page_contracts_v0",
  "public_safe": true,
  "binding": {
    "project_code": "SYN_PUBLIC_CAL",
    "output_root": "synthetic_public_archive_only",
    "planning_only": true,
    "verification_execution_allowed": false
  },
  "approved_refs": [
    {"artifact_kind": "seed_matrix", "ref": "SYN-SEED-001", "checksum_sha256": "1111"},
    {"artifact_kind": "trace_matrix", "ref": "SYN-TRACE-001", "checksum_sha256": "2222"},
    {"artifact_kind": "evidence_authority_map", "ref": "SYN-AUTH-001", "checksum_sha256": "3333"},
    {"artifact_kind": "quantitative_packet", "ref": "SYN-QUANT-001", "checksum_sha256": "4444"},
    {"artifact_kind": "simulation_source_packet", "ref": "SYN-SIM-001", "checksum_sha256": "5555"},
    {"artifact_kind": "interface_control_packet", "ref": "SYN-IFC-001", "checksum_sha256": "6666"},
    {"artifact_kind": "harness_packet", "ref": "SYN-HAR-001", "checksum_sha256": "7777"},
    {"artifact_kind": "configuration_baseline_ref", "ref": "SYN-CFG-A", "checksum_sha256": "8888"},
    {"artifact_kind": "configuration_baseline_ref", "ref": "SYN-CFG-B", "checksum_sha256": "9999"}
  ],
  "trace_rows": [
    {
      "trace_id": "TR-SYN-001",
      "page_asset_id": "PWR-01",
      "scope_key": "REG-3V3",
      "claim_kind": "quantitative_constraint",
      "field_path": "rail.vout",
      "claim": "VOUT_3V3 nominal 3.3 V tolerance +/-5%",
      "authority": "approved_source SRC-PSU-DS-001 plus quantitative packet value",
      "conflict": false
    },
    {
      "trace_id": "TR-SYN-002",
      "page_asset_id": "PWR-01",
      "scope_key": "VIN-HARNESS",
      "claim_kind": "harness_connection_claim",
      "interface_scope": "J1.1_to_U1.VIN",
      "harness_status": "review_required",
      "missing": ["owner_decision", "test_fixture_procedure"]
    },
    {
      "trace_id": "TR-SYN-003",
      "page_asset_id": "PWR-01",
      "scope_key": "STARTUP-SIM",
      "claim_kind": "pspice_readiness",
      "claim": "startup transient should be simulated before execution",
      "missing": ["simulation_model", "simulation_deck", "stimuli", "measurement_criteria"],
      "resource_policy": "simulation allowed only after model/deck/stimuli/measurement criteria exist"
    },
    {
      "trace_id": "TR-SYN-004",
      "page_asset_id": "LED-02",
      "scope_key": "STATUS-LED",
      "claim_kind": "function_claim",
      "claim": "status LED indicates regulator enabled",
      "missing": ["official_source_ref", "owner_intent_decision"]
    },
    {
      "trace_id": "TR-SYN-005",
      "page_asset_id": "PWR-01",
      "scope_key": "CFG-BASELINE",
      "claim_kind": "configuration_baseline",
      "conflict": "trace says board rev A but configuration packet says rev B",
      "impact": "version conflict blocks affected test readiness"
    }
  ],
  "required_behavior": [
    "create stable verification item ids",
    "write explicit method assignment rationale",
    "write evidence needs before criteria seeds",
    "write gaps and followups for every missing, conflict, or review-required prerequisite",
    "write readiness and TRR/FCA-SVR handoff entries",
    "write provenance over approved refs",
    "write a planning-only boundary note"
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
