You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=elf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: interface_control_and_harness_readiness_v0
kind: workflow
status: active
title: Interface Control And Harness Readiness v0
summary: Evaluate page-module interface candidates and optional harness candidates before harness strengthening, producing explicit readiness ceilings and blocker outputs without mutating upstream assets or replacing harness composition.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - interface_control_project_binding
  - page_module_sidecar_refs
  - page_asset_manifest_refs
  - approved_interface_control_policy
optional_inputs:
  - capture_intake_packet_refs
  - official_source_packet_refs
  - component_materials_packet_refs
  - layout_guide_packet_refs
  - quantitative_enrichment_packet_refs
  - trace_matrix_packet_refs
  - harness_composition_packet_refs
  - owner_decision_refs
outputs:
  - interface_control_ledger
  - harness_readiness_matrix
  - blocked_interface_items
  - review_required_interface_items
  - candidate_safe_possible_items
  - source_supported_possible_items
  - owner_followup_needed
  - interface_open_questions
  - compatibility_gap_report
  - source_gap_rerun_triggers
  - harness_input_delta
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
workflow_modes:
  - pre_harness_readiness
  - harness_review
readiness_status_values:
  - blocked
  - review_required
  - candidate_safe_possible
  - source_supported_possible
upstream_workflows:
  - workflow_id: page_xml_normalize_spec_v0
    expected_outputs:
      - page_module_spec_v0_sidecars
      - module_spec_manifest
      - provenance_update
      - downstream_handoff
  - workflow_id: capture_xml_intake_library_v0
    expected_outputs:
      - asset_identity
      - connectors
      - power_summary
      - open_questions
      - provenance
      - downstream_handoff
  - workflow_id: official_source_packet_collect_v0
    expected_outputs:
      - source_packet_manifest
      - source_inventory
      - source_gap_report
      - owner_followup_needed
      - downstream_ready_refs
  - workflow_id: exp_xml_component_materials
    expected_outputs:
      - component_inventory
      - source_discovery_packet
      - download_manifest
      - circuit_design_review_queue
  - workflow_id: component_pcb_layout_guide_extraction
    expected_outputs:
      - layout_guide_markdown
      - source_map
      - extraction_manifest
      - layout_guide_source_gap_packet
    status: optional_when_layout_behavior_matters
  - workflow_id: page_quantitative_enrichment_v0
    expected_outputs:
      - quantitative_claims
      - source_gap_report
      - owner_followup_needed
      - harness_readiness_delta
      - enrichment_provenance
    status: optional_but_required_for_quantitative_strengthening
  - workflow_id: page_module_trace_matrix_v0
    expected_outputs:
      - trace_matrix
      - evidence_authority_map
      - trace_gap_register
      - harness_trace_delta
      - verification_seed_matrix
    status: optional_trace_governance_input
  - workflow_id: xml_harness_composition_v0
    expected_outputs:
      - connection_candidates
      - blocked_connections
      - review_required_connections
      - candidate_safe_connections
      - source_supported_connections
      - owner_followup_needed
      - harness_open_questions
    status: optional_harness_review_input
downstream_workflows:
  - workflow_id: xml_harness_composition_v0
    expected_input: harness_input_delta_with_readiness_ceilings
    rule: harness_may_weaken_but_not_strengthen_beyond_interface_control_ceiling
  - workflow_id: source_gap_followup_packet_v0
    expected_input: compatibility_gap_report_and_owner_followup_needed
  - workflow_id: page_module_trace_matrix_v0
    expected_input: interface_control_ledger_and_harness_readiness_matrix_for_trace_refresh
    status: optional_backlink_refresh
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: source_supported_possible_or_candidate_safe_possible_readiness_rows
    status: planned
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: boundary_review_note_and_readiness_summary
    status: planned
interface_control_contract:
  owns:
    - controlled_interface_row_identity
    - interface_exposure_classification
    - local_internal_non_external_default
    - readiness_ceiling_assignment
    - interface_and_join_blocker_records
    - owner_followup_and_open_question_routing
    - harness_input_delta_for_downstream_ceiling_review
  does_not_own:
    - source_xml_mutation
    - page_module_spec_schema_design
    - upstream_sidecar_or_packet_patch
    - official_source_acquisition
    - quantitative_value_truth
    - final_harness_connection_promotion
    - final_circuit_synthesis
    - schematic_or_netlist_generation
    - verification_result_acceptance
    - review_gate_decision_authority
  required_output_shapes:
    interface_control_packet: templates/interface_control_packet.template.yaml
    interface_control_ledger: templates/interface_control_ledger.template.yaml
    harness_readiness_matrix: templates/harness_readiness_matrix.template.yaml
    blocked_interface_items: templates/blocked_interface_items.template.yaml
    review_required_interface_items: templates/review_required_interface_items.template.yaml
    candidate_safe_possible_items: templates/candidate_safe_possible_items.template.yaml
    source_supported_possible_items: templates/source_supported_possible_items.template.yaml
    compatibility_gap_report: templates/compatibility_gap_report.template.yaml
    owner_followup_needed: templates/owner_followup_needed.template.yaml
    interface_open_questions: templates/interface_open_questions.template.yaml
    harness_input_delta: templates/harness_input_delta.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
  authority_boundary:
    readiness_ceiling_is_final_harness_claim: false
    source_supported_possible_is_source_supported_harness_status: false
    candidate_safe_possible_is_final_design_approval: false
    local_internal_candidates_external_by_default: false
    owner_decision_replaces_source_fact: false
    upstream_artifacts_are_read_only: true
  local_internal_policy:
    upstream_container: local_internal_candidates
    default_interface_exposure: local_internal
    external_harness_eligible_by_default: false
    blocked_reason_when_used_as_external: local_internal_misuse
    reclassification_requires:
      - scoped_owner_decision_or_source_backed_reclassification_request
      - interface_exposure_role_direction_and_constraints_recorded
      - upstream_owner_or_later_update_workflow_keeps_source_sidecar_authority
    source_supported_possible_requires_source_evidence: true
  readiness_ceiling_logic:
    blocked:
      use_when:
        - identity_checksum_lineage_or_approval_scope_conflict
        - missing_required_page_module_sidecar_or_asset_identity
        - local_internal_candidate_used_as_external_without_reclassification
        - no_connect_local_only_test_only_or_non_composition_scope
        - missing_blocked_conflicting_or_unapproved_source_required_for_claim
        - missing_or_conflicting_required_quantitative_constraint
        - incompatible_direction_role_domain_or_connection_kind
        - companion_context_or_owner_decision_required
        - secret_private_account_or_hidden_reference_would_be_needed
    review_required:
      use_when:
        - plausible_interface_but_not_controlled_enough
        - role_direction_or_domain_inferred_from_label_or_topology_only
        - owner_hint_exists_without_complete_source_or_quantity_support
        - source_supports_one_side_but_not_mating_side
        - trace_or_source_gap_caps_promotion_without_hard_block
    candidate_safe_possible:
      minimum_conditions:
        - endpoints_are_external_eligible_or_valid_passive_references
        - page_identity_checksum_and_source_refs_are_consistent
        - direction_role_domain_and_connection_kind_are_compatible
        - required_quantitative_fields_are_present_derived_or_not_applicable_for_scope
        - no_local_internal_endpoint_is_misused
        - no_unresolved_owner_decision_changes_interpretation
        - status_has_evidence_refs_not_name_similarity_alone
    source_supported_possible:
      minimum_conditions:
        - all_candidate_safe_possible_conditions_hold
        - exposure_role_direction_domain_and_connection_kind_are_source_confirmed_or_scoped_owner_baselined
        - required_quantitative_constraints_are_source_confirmed_or_derived_from_source_confirmed_operands
        - required_source_status_is_official_present_or_scoped_owner_approved_local
        - no_candidate_official_third_party_unapproved_missing_blocked_conflicting_or_license_unclear_source_is_required
        - affected_source_gaps_are_closed_by_owning_workflow_output_or_scoped_not_applicable_decision
notes:
  - This workflow is a governance bridge before or alongside harness composition; it does not replace `xml_harness_composition_v0`.
  - It reads approved page-module sidecars and optional enrichment, trace, and harness packets, then writes readiness ceilings and blockers for later harness review.
  - "`candidate_safe_possible` and `source_supported_possible` are eligibility ceilings only; downstream harness composition must still perform connection-specific checks."
  - "`local_internal_candidates` remain non-external by default and must be blocked when used as external harness endpoints without approved reclassification."
  - Public workflow canon stores only portable orchestration rules, state semantics, boundary policy, and sanitized templates.
  - Public workflow files must not contain raw XML bodies, private project payloads, vendor document text, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: interface_control_and_harness_readiness_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_interface_control_binding
    title: Prepare Interface Control Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_interface_control_binding_setup
      requires:
        - interface_control_project_binding
        - page_module_sidecar_refs
        - page_asset_manifest_refs
        - approved_interface_control_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - input_refs_are_read_only
        - approval_scope_is_recorded_for_each_ref
        - public_package_contains_no_payloads
        - no_runtime_absolute_paths_in_public_package
        - workflow_does_not_replace_harness_composition
      creates:
        - interface_control_output_root
        - interface_control_run_log_root
    summary: Resolve the bounded output root and confirm the run is a governance/readiness layer over read-only upstream artifacts.
    next:
      on_success: collect_read_only_interface_inputs
      on_fail: stop
  - step_id: collect_read_only_interface_inputs
    title: Collect Read-Only Interface Inputs
    actor_slot: input_packet_curator
    action:
      kind: read_only_interface_input_inventory
      artifacts_in:
        - page_module_sidecar_refs
        - page_asset_manifest_refs
        - capture_intake_packet_refs
        - official_source_packet_refs
        - component_materials_packet_refs
        - layout_guide_packet_refs
        - quantitative_enrichment_packet_refs
        - trace_matrix_packet_refs
        - harness_composition_packet_refs
        - owner_decision_refs
      artifact_out: interface_input_inventory
      records:
        - artifact_ref
        - artifact_kind
        - owning_workflow_id
        - checksum_sha256
        - approval_scope
        - page_asset_ids
        - interface_refs
        - harness_connection_refs
        - source_state_refs
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - accepted_output
        - previous_candidate_repair_packet
        - secret_or_session_state
        - raw_source_payload_text
        - unindexed_owner_file
    summary: Inventory approved refs and authority hints without reading forbidden payloads or treating filenames as evidence.
    next:
      on_success: enumerate_controlled_interfaces
      on_fail: stop
  - step_id: enumerate_controlled_interfaces
    title: Enumerate Controlled Interfaces
    actor_slot: interface_ledger_builder
    action:
      kind: interface_control_row_enumeration
      artifact_in: interface_input_inventory
      artifact_out: interface_control_ledger_draft
      row_sources:
        - interface_groups
        - interfaces.inputs
        - interfaces.outputs
        - interfaces.bidirectional
        - interfaces.passive_or_none
        - interfaces.local_internal_candidates
        - no_connect_or_open_state_refs
        - harness_connection_endpoints_when_present
      required_fields:
        - interface_control_id
        - page_asset_id
        - upstream_interface_ref
        - upstream_container
        - original_label
        - source_ref
        - owner_scope_ref
      invariant: every_local_internal_candidate_has_a_ledger_row
    summary: Build one controlled row per interface item or proposed join endpoint while preserving upstream identity and container ownership.
    next:
      on_success: classify_externality_and_local_internal
      on_fail: stop
  - step_id: classify_externality_and_local_internal
    title: Classify Externality And Local/Internal
    actor_slot: externality_classifier
    action:
      kind: interface_exposure_and_external_harness_eligibility
      artifact_in: interface_control_ledger_draft
      artifact_out: interface_control_ledger_with_exposure
      interface_exposure_values:
        - external_candidate
        - external_confirmed
        - local_internal
        - passive_reference
        - no_connect
        - unknown
      local_internal_policy:
        default_external_harness_eligible: false
        promotion_from_local_internal_requires_reclassification_evidence: true
        block_harness_endpoint_misuse: true
      forbidden_basis:
        - name_similarity_only
        - common_control_status_label_only
        - previous_harness_candidate_status
        - owner_hint_without_scope
    summary: Keep local/internal candidates non-external by default and make any reclassification explicit and evidence-scoped.
    next:
      on_success: map_evidence_and_readiness_ceiling
      on_fail: stop
  - step_id: map_evidence_and_readiness_ceiling
    title: Map Evidence And Readiness Ceiling
    actor_slot: evidence_ceiling_mapper
    action:
      kind: readiness_ceiling_assignment
      artifacts_in:
        - interface_control_ledger_with_exposure
        - interface_input_inventory
      artifacts_out:
        - interface_control_ledger
        - harness_readiness_matrix_draft
        - compatibility_gap_report_draft
      readiness_ceiling_values:
        - blocked
        - review_required
        - candidate_safe_possible
        - source_supported_possible
      classification_rules:
        - blocked_for_identity_lineage_approval_scope_conflict
        - blocked_for_local_internal_misuse
        - blocked_for_required_source_or_quantity_gap
        - review_required_for_plausible_but_incomplete_control
        - candidate_safe_possible_requires_no_known_blocker_and_required_constraints
        - source_supported_possible_requires_source_supported_semantics_and_quantities
      invariant: every_readiness_ceiling_has_reason_and_refs_or_gap
    summary: Assign a conservative ceiling for each controlled interface or join and preserve source, quantitative, layout, owner, and trace gaps as structured blockers.
    next:
      on_success: review_harness_candidates_when_present
      on_fail: stop
  - step_id: review_harness_candidates_when_present
    title: Review Harness Candidates When Present
    actor_slot: harness_candidate_reviewer
    action:
      kind: harness_candidate_ceiling_review
      artifacts_in:
        - interface_control_ledger
        - harness_readiness_matrix_draft
        - harness_composition_packet_refs
      artifacts_out:
        - harness_readiness_matrix
        - harness_input_delta
      review_modes:
        - no_harness_packet_pre_harness_readiness
        - existing_harness_packet_ceiling_review
      rules:
        - harness_may_weaken_but_not_strengthen_beyond_ceiling
        - local_internal_misuse_remains_blocked
        - possible_states_are_not_final_harness_statuses
        - harness_packet_is_not_mutated
    summary: If a harness packet exists, map proposed joins to controlled interface ids and write a delta that caps later harness strengthening.
    next:
      on_success: route_blockers_and_followups
      on_fail: stop
  - step_id: route_blockers_and_followups
    title: Route Blockers And Follow-Ups
    actor_slot: owner_gap_router
    action:
      kind: readiness_blocker_and_owner_route_write
      artifacts_in:
        - interface_control_ledger
        - harness_readiness_matrix
        - compatibility_gap_report_draft
      artifacts_out:
        - blocked_interface_items
        - review_required_interface_items
        - candidate_safe_possible_items
        - source_supported_possible_items
        - compatibility_gap_report
        - owner_followup_needed
        - interface_open_questions
        - source_gap_rerun_triggers
      gap_effects:
        - blocks_harness
        - blocks_candidate_safe_possible
        - blocks_source_supported_possible
        - review_required
        - informational
      retry_policy:
        rerun_narrowest_owning_workflow: true
        do_not_patch_upstream_artifacts: true
    summary: Partition items into explicit readiness outputs and route missing evidence, owner decisions, and rerun triggers to the correct owner.
    next:
      on_success: write_packet_and_boundary_review
      on_fail: stop
  - step_id: write_packet_and_boundary_review
    title: Write Packet And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: interface_control_packet_boundary_and_overclaim_review
      artifacts_in:
        - interface_control_ledger
        - harness_readiness_matrix
        - blocked_interface_items
        - review_required_interface_items
        - candidate_safe_possible_items
        - source_supported_possible_items
        - compatibility_gap_report
        - owner_followup_needed
        - interface_open_questions
        - source_gap_rerun_triggers
        - harness_input_delta
      artifacts_out:
        - interface_control_packet
        - boundary_review_note
        - interface_control_summary
      checks:
        - every_local_internal_candidate_is_non_external_by_default
        - all_four_readiness_outputs_are_written_even_when_empty
        - every_blocked_or_review_required_item_has_reason_and_route
        - possible_states_are_reported_as_ceiling_only
        - source_supported_possible_has_allowed_source_refs
        - no_upstream_artifact_mutation
        - no_harness_packet_mutation
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Finalize the interface-control packet and report counts, blockers, owner actions, and the best narrow next pilot route.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "project_code": "PUBLIC_CAL",
  "run_id": "cal_interface_control_001",
  "workflow_mode": "harness_review",
  "approved_refs": [
    {"ref_id": "ref_page_mod_alpha_v1", "checksum": "sha256:aaa111"},
    {"ref_id": "ref_asset_manifest_alpha_v1", "checksum": "sha256:bbb222"},
    {"ref_id": "ref_source_alpha_v1", "status": "official_present_synthetic"},
    {"ref_id": "ref_quant_alpha_v1"},
    {"ref_id": "ref_harness_alpha_v1"}
  ],
  "interfaces": [
    {"ref": "interfaces.outputs.J1_PIN1", "page_asset_id": "PAGE_A", "label": "VBUS_OUT", "container": "outputs", "source_ref": "SRC_VBUS", "facts": ["external confirmed power output", "direction output", "domain power", "kind wire_to_wire", "5V", "500mA", "quantity source-confirmed"]},
    {"ref": "interfaces.inputs.J2_PIN3", "page_asset_id": "PAGE_A", "label": "GPIO_WAKE", "container": "inputs", "source_ref": "SRC_GPIO", "facts": ["external candidate digital input", "direction input", "domain digital", "kind signal_wire", "3.3V logic", "timing missing", "quantity partial"]},
    {"ref": "interfaces.local_internal_candidates.TP5", "page_asset_id": "PAGE_A", "label": "TP5_BOOT", "container": "local_internal_candidates", "source_ref": "SRC_TEST", "facts": ["local test/debug only", "bidirectional or unknown", "domain digital", "kind test_point"]},
    {"ref": "interfaces.passive_or_none.NC7", "page_asset_id": "PAGE_A", "label": "NC7", "container": "passive_or_none", "source_ref": "SRC_NC", "facts": ["no connect"]},
    {"ref": "interfaces.outputs.PWM_A", "page_asset_id": "PAGE_B", "label": "PWM_A", "container": "outputs", "source_ref": "SRC_PWM", "facts": ["role and direction inferred from label only", "no official source confirmation", "quantity missing"]}
  ],
  "harness_candidate_joins": [
    {"join_id": "JOIN_1", "endpoints": ["J1_PIN1", "external_load_vbus"], "previous_harness_status": "candidate_safe", "requires": ["5V", "500mA"]},
    {"join_id": "JOIN_2", "endpoints": ["TP5", "external_debug_header"], "previous_harness_status": "candidate_safe"},
    {"join_id": "JOIN_3", "endpoints": ["GPIO_WAKE", "wake_controller"], "previous_harness_status": "review_required", "requires": ["timing constraint"]},
    {"join_id": "JOIN_4", "endpoints": ["PWM_A", "motor_ctrl_pwm"], "previous_harness_status": "candidate_safe", "requires": ["source-confirmed PWM semantics"]}
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
