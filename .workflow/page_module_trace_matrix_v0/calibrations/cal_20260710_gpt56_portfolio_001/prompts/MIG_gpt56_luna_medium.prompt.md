You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=elf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: page_module_trace_matrix_v0
kind: workflow
status: active
title: Page Module Trace Matrix v0
summary: Build a row-level governance matrix over page-module, source, materials, layout, quantitative, and harness packets so later harness, verification, and review workflows can consume explicit evidence authority, gaps, and trace links without replacing upstream artifact owners.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - trace_matrix_project_binding
  - page_module_spec_refs
  - page_asset_manifest_refs
  - approved_trace_intake_policy
optional_inputs:
  - capture_intake_packet_refs
  - official_source_packet_refs
  - component_materials_packet_refs
  - layout_guide_packet_refs
  - quantitative_enrichment_packet_refs
  - interface_control_packet_refs
  - pspice_or_simulation_packet_refs
  - harness_composition_packet_refs
  - source_gap_followup_packet_refs
  - owner_decision_refs
outputs:
  - trace_matrix
  - evidence_authority_map
  - trace_gap_register
  - harness_trace_delta
  - verification_seed_matrix
  - review_gate_evidence_index
  - trace_provenance
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: page_xml_normalize_spec_v0
    expected_outputs:
      - page_module_spec_sidecars
      - module_spec_manifest
      - provenance_update
      - downstream_handoff
  - workflow_id: capture_xml_intake_library_v0
    expected_outputs:
      - asset_identity
      - block_summary
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
  - workflow_id: page_quantitative_enrichment_v0
    expected_outputs:
      - quantitative_claims
      - source_gap_report
      - owner_followup_needed
      - harness_readiness_delta
      - enrichment_provenance
  - workflow_id: interface_control_and_harness_readiness_v0
    expected_outputs:
      - interface_control_ledger
      - harness_readiness_matrix
      - blocked_interface_items
      - review_required_interface_items
      - candidate_safe_possible_items
      - source_supported_possible_items
      - owner_followup_needed
      - compatibility_gap_report
      - harness_input_delta
      - boundary_review_note
  - workflow_id: xml_harness_composition_v0
    expected_outputs:
      - harness_identity
      - connection_candidates
      - blocked_connections
      - review_required_connections
      - candidate_safe_connections
      - source_supported_connections
      - owner_followup_needed
      - harness_open_questions
      - composition_readiness
downstream_workflows:
  - workflow_id: xml_harness_composition_v0
    expected_input: harness_trace_delta_for_narrow_rerun_or_claim_ceiling_review
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: verification_seed_matrix
    status: planned
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: review_gate_evidence_index
    status: planned
  - workflow_id: source_gap_followup_packet_v0
    expected_input: trace_gap_register_for_owner_action_batching
    status: optional_followup
trace_matrix_contract:
  owns:
    - trace_row_identity
    - artifact_crosswalks
    - evidence_authority_classification
    - gap_orphan_conflict_registers
    - harness_claim_strength_ceiling
    - verification_seed_links
    - review_gate_row_index
  does_not_own:
    - source_xml_mutation
    - page_module_spec_schema_design
    - component_material_truth
    - official_source_acquisition
    - layout_guidance_extraction
    - quantitative_value_truth
    - final_harness_connection_promotion
    - verification_result_acceptance
    - review_gate_decision_authority
  row_families:
    - asset_identity
    - module_scope
    - function_claim
    - interface_group
    - interface_item
    - quantitative_constraint
    - interface_readiness_ceiling
    - source_packet_coverage
    - layout_readiness
    - pspice_readiness
    - harness_connection_claim
    - open_question
    - verification_need
  evidence_status_values:
    - source_confirmed
    - derived
    - review_required
    - missing
  authority_boundary:
    trace_matrix_is_source_authority: false
    evidence_authority_map_replaces_upstream_provenance: false
    harness_trace_delta_is_final_harness_verdict: false
    verification_seed_matrix_is_completed_verification: false
    review_gate_index_is_review_decision: false
    source_confirmed_requires_allowed_evidence_ref: true
    derived_requires_derivation_rule_and_inputs: true
    review_required_conflicts_cannot_be_auto_resolved: true
    missing_claims_must_remain_first_class_rows: true
    upstream_artifacts_are_read_only: true
  stable_trace_row_id_rule:
    stable_id_basis:
      - trace_scope_key
      - page_asset_id
      - claim_kind
      - normalized_field_path
      - component_or_interface_or_connection_scope
    same_id_when: the same bounded claim is rerun over refreshed upstream packet refs.
    split_id_when: different page assets, interface groups, quantities, components, harness connections, evidence authority, or owner decisions would require separate review or closure.
  required_output_shapes:
    trace_matrix: templates/trace_matrix.template.yaml
    evidence_authority_map: templates/evidence_authority_map.template.yaml
    trace_gap_register: templates/trace_gap_register.template.yaml
    harness_trace_delta: templates/harness_trace_delta.template.yaml
    verification_seed_matrix: templates/verification_seed_matrix.template.yaml
    review_gate_evidence_index: templates/review_gate_evidence_index.template.yaml
    trace_provenance: templates/trace_provenance.template.yaml
notes:
  - This workflow sits above the page/source/materials/layout/quantitative/interface-control/harness lane as a traceability and governance layer.
  - It reads approved packet refs and writes project-local trace outputs; it does not patch source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, or harness contracts.
  - "`source_confirmed`, `derived`, `review_required`, and `missing` are row-level evidence authority states and must not be collapsed into harness claim status."
  - Harness consumers receive a claim-strength ceiling and explicit blockers, not an automatic source-supported connection verdict.
  - Verification and review consumers receive seed/index rows, not completed verification evidence or review decisions.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.
  - Public workflow files must not contain raw XML bodies, private project payloads, vendor document text, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: page_module_trace_matrix_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_trace_binding
    title: Prepare Trace Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_trace_binding_setup
      requires:
        - trace_matrix_project_binding
        - page_module_spec_refs
        - page_asset_manifest_refs
        - approved_trace_intake_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - input_refs_are_read_only
        - approval_scope_is_recorded_for_each_ref
        - public_package_contains_no_payloads
        - no_runtime_absolute_paths_in_public_package
        - trace_matrix_does_not_claim_source_authority
      creates:
        - trace_matrix_output_root
        - trace_matrix_run_log_root
    summary: Resolve the bounded project-local output root and confirm the trace run is a governance/indexing layer over read-only upstream artifacts.
    next:
      on_success: build_input_artifact_set
      on_fail: stop
  - step_id: build_input_artifact_set
    title: Build Input Artifact Set
    actor_slot: artifact_set_curator
    action:
      kind: read_only_trace_input_inventory
      artifacts_in:
        - page_module_spec_refs
        - page_asset_manifest_refs
        - capture_intake_packet_refs
        - official_source_packet_refs
        - component_materials_packet_refs
        - layout_guide_packet_refs
        - quantitative_enrichment_packet_refs
        - interface_control_packet_refs
        - pspice_or_simulation_packet_refs
        - harness_composition_packet_refs
        - source_gap_followup_packet_refs
        - owner_decision_refs
      artifact_out: trace_input_artifact_set
      records:
        - artifact_ref
        - artifact_kind
        - owning_workflow_id
        - checksum_sha256
        - approval_scope
        - page_asset_ids
        - harness_ids
        - evidence_authority_hint
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - accepted_output
        - previous_candidate_repair_packet
        - secret_or_session_state
        - raw_source_payload_text
        - unindexed_owner_file
    summary: Inventory approved upstream packet refs and their authority hints without reading forbidden payloads or treating filenames as evidence.
    next:
      on_success: enumerate_trace_rows
      on_fail: stop
  - step_id: enumerate_trace_rows
    title: Enumerate Trace Rows
    actor_slot: trace_row_builder
    action:
      kind: atomic_trace_claim_enumeration
      artifact_in: trace_input_artifact_set
      artifact_out: trace_rows_draft
      row_families:
        - asset_identity
        - module_scope
        - function_claim
        - interface_group
        - interface_item
        - quantitative_constraint
        - interface_readiness_ceiling
        - source_packet_coverage
        - layout_readiness
        - pspice_readiness
        - harness_connection_claim
        - open_question
        - verification_need
      granularity_rule: one_atomic_claim_per_row
      stable_id_policy:
        preserve_existing_trace_row_ids_when_same_claim_reruns: true
        split_mixed_evidence_claims: true
        missing_expected_claims_get_rows: true
      creates:
        - trace_row_id
        - claim_kind
        - claim_text
        - scope
        - normalized_field_path
        - parent_trace_row_ids
        - child_trace_row_ids
    summary: Convert page/module/interface/source/layout/quantity/harness observations into small rows that later reviewers can accept, block, verify, or route independently.
    next:
      on_success: assign_evidence_authority
      on_fail: stop
  - step_id: assign_evidence_authority
    title: Assign Evidence Authority
    actor_slot: evidence_authority_mapper
    action:
      kind: evidence_status_and_authority_ceiling_mapping
      artifacts_in:
        - trace_rows_draft
        - trace_input_artifact_set
      artifacts_out:
        - trace_rows_with_evidence_status
        - evidence_authority_map
      evidence_status_values:
        - source_confirmed
        - derived
        - review_required
        - missing
      rules:
        - source_confirmed_requires_allowed_evidence_ref
        - derived_requires_derivation_rule_and_input_refs
        - review_required_when_conflict_or_ambiguity_exists
        - missing_when_required_claim_has_no_allowed_support
        - conflict_overrides_convenient_confirmation
      claim_strength_ceilings:
        missing: blocked
        review_required: review_required
        derived: candidate_safe
        source_confirmed: source_supported_possible
    summary: Assign row-level authority and evidence crosswalks while keeping source truth with the owning upstream artifacts.
    next:
      on_success: detect_gaps_orphans_conflicts
      on_fail: stop
  - step_id: detect_gaps_orphans_conflicts
    title: Detect Gaps Orphans Conflicts
    actor_slot: gap_orphan_detector
    action:
      kind: trace_gap_register_write
      artifacts_in:
        - trace_rows_with_evidence_status
        - evidence_authority_map
        - trace_input_artifact_set
      artifact_out: trace_gap_register
      gap_types:
        - missing_artifact
        - missing_source_ref
        - missing_component_identity
        - missing_interface_group
        - missing_quantitative_constraint
        - missing_layout_constraint
        - missing_pspice_model
        - missing_harness_context
        - missing_owner_decision
        - source_conflict
        - version_or_checksum_conflict
        - orphan_downstream_claim
        - unapproved_source
        - private_boundary_unclear
      invariant: every_missing_review_required_or_orphan_claim_has_gap_or_action_route
    summary: Write machine-readable gaps for absent, orphaned, conflicting, or unsafe claims instead of hiding them in prose.
    next:
      on_success: map_harness_trace_delta
      on_fail: stop
  - step_id: map_harness_trace_delta
    title: Map Harness Trace Delta
    actor_slot: harness_delta_mapper
    action:
      kind: harness_claim_ceiling_delta_write
      artifacts_in:
        - trace_rows_with_evidence_status
        - trace_gap_register
        - harness_composition_packet_refs
      artifact_out: harness_trace_delta
      connection_views:
        - blocked
        - review_required
        - candidate_safe_possible
        - source_supported_possible
      not_claimed:
        - final_connection_validity
        - final_circuit_synthesis
        - automatic_source_supported_promotion
        - harness_contract_mutation
    summary: Give harness workflows explicit row-backed blockers and strengthening ceilings without issuing a final harness verdict.
    next:
      on_success: seed_verification_matrix
      on_fail: stop
  - step_id: seed_verification_matrix
    title: Seed Verification Matrix
    actor_slot: verification_seed_planner
    action:
      kind: verification_seed_matrix_write
      artifacts_in:
        - trace_rows_with_evidence_status
        - trace_gap_register
      artifact_out: verification_seed_matrix
      method_seeds:
        - inspection
        - analysis
        - simulation
        - test
        - demonstration
        - owner_review
        - not_ready
      rule: missing_rows_create_verification_gaps_not_placeholder_tests
    summary: Translate trace rows into verification-planning seeds and prerequisites without claiming verification has been performed.
    next:
      on_success: build_review_gate_index
      on_fail: stop
  - step_id: build_review_gate_index
    title: Build Review Gate Index
    actor_slot: review_index_builder
    action:
      kind: review_gate_evidence_index_write
      artifacts_in:
        - trace_rows_with_evidence_status
        - evidence_authority_map
        - trace_gap_register
        - verification_seed_matrix
      artifact_out: review_gate_evidence_index
      review_families:
        - SRR_SFR_like
        - PDR_like
        - CDR_like
        - TRR_like
        - FCA_SVR_like
        - PCA_like
      rule: review_packets_consume_trace_row_ids_not_raw_payloads
    summary: Group row ids for later review evidence packs while preserving review decision authority outside this workflow.
    next:
      on_success: write_trace_bundle_and_boundary_review
      on_fail: stop
  - step_id: write_trace_bundle_and_boundary_review
    title: Write Trace Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: trace_bundle_boundary_and_overclaim_review
      artifacts_in:
        - trace_rows_with_evidence_status
        - evidence_authority_map
        - trace_gap_register
        - harness_trace_delta
        - verification_seed_matrix
        - review_gate_evidence_index
      artifacts_out:
        - trace_matrix
        - trace_provenance
        - boundary_review_note
        - trace_matrix_summary
      checks:
        - every_row_has_trace_row_id
        - every_non_missing_row_has_evidence_or_derivation
        - every_missing_or_review_required_row_has_gap_or_downstream_impact
        - harness_delta_contains_claim_strength_ceiling_only
        - verification_seed_matrix_does_not_claim_completed_verification
        - review_index_does_not_claim_review_decision
        - no_upstream_artifact_mutation
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Finalize the trace bundle and report row counts, blocker counts, and best narrow downstream rerun route.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "page_module_trace_matrix_v0",
  "fixture_id": "PUBLIC_SYNTH_PAGE_MODULE_TRACE_MATRIX_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Page Module Trace Matrix v0",
  "workflow_summary": "Build a row-level governance matrix over page-module, source, materials, layout, quantitative, and harness packets so later harness, verification, and review workflows can consume explicit evidence authority, gaps, and trace links without replacing upstream artifact owners.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "trace_matrix_project_binding",
    "page_module_spec_refs",
    "page_asset_manifest_refs",
    "approved_trace_intake_policy"
  ],
  "expected_output_groups": [
    "trace_matrix",
    "evidence_authority_map",
    "trace_gap_register",
    "harness_trace_delta",
    "verification_seed_matrix",
    "review_gate_evidence_index",
    "trace_provenance",
    "boundary_review_note"
  ],
  "must_preserve": [
    "evidence authority",
    "trace",
    "boundary",
    "no mutation",
    "verification seed"
  ],
  "scenario_facts": [
    "one source-supported row",
    "one review-required row",
    "one missing-evidence row",
    "one harness delta must stay below source authority"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
