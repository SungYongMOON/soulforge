You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: page_quantitative_enrichment_v0
kind: workflow
status: active
title: Page Quantitative Enrichment v0
summary: Add a source-backed quantitative enrichment overlay to normalized page module specs so later harness composition can see confirmed values, derived values, missing values, review gates, and readiness deltas without replacing upstream source authority.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - quantitative_enrichment_binding
  - page_module_spec_sidecar
  - module_spec_manifest
  - provenance_update
  - downstream_handoff
optional_inputs:
  - capture_intake_packets
  - official_source_packet_manifest
  - official_source_inventory
  - component_materials_packets
  - layout_guide_packets
  - owner_recorded_constraints
  - previous_harness_blocker_packet
outputs:
  - quantitative_claims
  - enriched_sidecar_overlay
  - source_gap_report
  - owner_followup_needed
  - harness_readiness_delta
  - enrichment_provenance
  - quantitative_enrichment_summary
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: page_xml_normalize_spec_v0
    expected_output: page_module_spec_v0_sidecars
  - workflow_id: capture_xml_intake_library_v0
    expected_output: optional_page_level_intake_packets
  - workflow_id: official_source_packet_collect_v0
    expected_output: optional_official_or_owner_approved_source_packets
  - workflow_id: exp_xml_component_materials
    expected_output: optional_component_materials_packets
  - workflow_id: component_pcb_layout_guide_extraction
    expected_output: optional_layout_constraint_packets
downstream_workflows:
  - workflow_id: xml_harness_composition_v0
    expected_input: quantitative_claims_source_gaps_and_harness_readiness_delta
enrichment_contract:
  overlay_not_replacement: true
  target_schema_owner: page_xml_normalize_spec_v0
  target_schema_version: page_module_spec_v0
  source_authority_preserved:
    - source_page_xml
    - page_module_spec_sidecar
    - capture_intake_packets
    - official_source_packets
    - component_materials_packets
    - layout_guide_packets
  allowed_target_slot_families:
    - interfaces
    - performance
    - system_contract
    - composition
    - evidence_review
  required_output_shapes:
    quantitative_claims:
      claim_status_values:
        - filled
        - strengthened
        - unchanged_missing
        - blocked_missing_source
        - review_required
        - conflict
      field_status_values:
        - source_confirmed
        - derived
        - review_required
        - missing
      missing_values_are_first_class: true
    enriched_sidecar_overlay:
      overlay_kind: patch_like_overlay_against_page_module_spec_v0
      may_replace_original_sidecar: false
      may_write_raw_source_payload: false
    source_gap_report:
      required_for_every_unfilled_required_quantity: true
      gap_records_are_machine_readable: true
    owner_followup_needed:
      required_when_owner_or_source_action_can_unblock: true
    harness_readiness_delta:
      delta_only: true
      final_harness_approval_owner: xml_harness_composition_v0
source_support_policy:
  source_confirmed_requires:
    - approved_evidence_ref
    - source_location_or_packet_ref
    - target_slot
    - unit_when_unit_bearing
    - condition_or_scope_when_present
  derived_requires:
    - source_confirmed_operands
    - formula
    - operand_refs
    - derived_field_status
  review_required_when:
    - evidence_is_plausible_but_not_sufficient
    - source_identity_or_page_scope_is_ambiguous
    - source_conflict_exists
    - only_harness_pressure_or_label_hint_exists
  missing_when:
    - no_approved_evidence_supports_the_quantity
    - source_packet_records_missing_or_blocked
    - required_mating_context_is_absent
anti_guessing_policy:
  forbidden_bases:
    - net_name_or_label_only
    - component_family_reputation
    - common_default_rail_or_signal_assumption
    - downstream_harness_desire
    - unapproved_web_snippet_or_memory
    - copied_table_without_provenance
    - package_type_without_thermal_source
    - connector_label_similarity_only
    - one_side_of_a_connection_only
  required_response: leave_value_missing_or_review_required_and_write_gap
harness_delta_policy:
  may_close_blocker_only_when:
    - relevant_quantity_has_source_confirmed_or_valid_derived_claim
    - evidence_ref_is_present
    - no_conflict_or_owner_followup_remains_for_that_target
  may_mark_candidate_safe_possible_for: evidence_complete_and_non_conflicting_interface_scope
  may_mark_source_supported_possible_for: cited_source_evidence_complete_for_values_and_interface_semantics
  must_not_claim:
    - final_harness_connection_validity
    - final_circuit_synthesis
    - automatic_source_supported_join_promotion
    - global_page_readiness_from_partial_interface_evidence
notes:
  - This workflow sits after normalized page-module contract creation and optional source/material/layout evidence collection, then before harness composition promotion decisions.
  - It writes a project-local enrichment packet and overlay; it does not mutate source XML, normalized sidecars, intake packets, source packets, materials packets, layout guides, vendor collateral, or owner-provided source material.
  - Quantitative values are either `source_confirmed`, transparently `derived`, `review_required`, or `missing`; missing values and source gaps remain visible to downstream workflows.
  - Previous harness blockers may identify which quantities matter, but they are not evidence for the values themselves.
  - Public workflow canon stores only portable orchestration rules, claim-state semantics, and output-shape templates.
  - Public workflow files must not contain raw XML bodies, private project payloads, vendor document text, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: page_quantitative_enrichment_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_enrichment_binding
    title: Prepare Enrichment Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_enrichment_binding_setup
      requires:
        - quantitative_enrichment_binding
        - page_module_spec_sidecar
        - module_spec_manifest
        - provenance_update
        - downstream_handoff
      validates:
        - output_root_is_project_local_or_private_workmeta
        - public_package_contains_no_payloads
        - no_runtime_absolute_paths_in_public_package
        - enrichment_policy_declares_overlay_not_replacement
      creates:
        - enrichment_output_root
        - enrichment_run_log_root
    summary: Resolve project-local output and evidence bindings before reading optional evidence packets or writing any claim.
    next:
      on_success: load_normalized_page_contract
      on_fail: stop
  - step_id: load_normalized_page_contract
    title: Load Normalized Page Contract
    actor_slot: contract_loader
    action:
      kind: page_module_spec_contract_load
      artifacts_in:
        - page_module_spec_sidecar
        - module_spec_manifest
        - provenance_update
        - downstream_handoff
      artifacts_out:
        - normalized_contract_inventory
      validates:
        - page_identity_matches_manifest
        - source_checksum_matches_provenance
        - system_contract_slots_are_present_or_gap_recordable
        - sidecar_is_read_only_input
      forbidden_operations:
        - source_page_xml_mutation
        - normalized_sidecar_rewrite
        - schema_replacement
    summary: Inventory the existing module, interface, performance, system-contract, composition, and evidence-review slots without treating the sidecar as mutable truth.
    next:
      on_success: gather_evidence_packets
      on_fail: stop
  - step_id: gather_evidence_packets
    title: Gather Evidence Packets
    actor_slot: evidence_packet_reviewer
    action:
      kind: optional_evidence_packet_partition
      artifacts_in:
        - capture_intake_packets
        - official_source_packet_manifest
        - official_source_inventory
        - component_materials_packets
        - layout_guide_packets
        - owner_recorded_constraints
        - previous_harness_blocker_packet
      artifact_out: evidence_input_partition
      classifies:
        - source_confirmed_candidate
        - owner_approved_local_candidate
        - derived_operand_candidate
        - review_only_context
        - missing_or_blocked_source
        - conflict_or_identity_gap
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - previous_candidate_repair_packet
        - unapproved_web_snippet
        - secret_or_session_state
        - harness_pressure_as_value_evidence
    summary: Separate approved value evidence from review-only context, source gaps, conflicts, and blocker packets.
    next:
      on_success: inventory_quantitative_slots
      on_fail: stop
  - step_id: inventory_quantitative_slots
    title: Inventory Quantitative Slots
    actor_slot: quantitative_claim_extractor
    action:
      kind: target_slot_inventory
      artifacts_in:
        - normalized_contract_inventory
        - evidence_input_partition
      artifact_out: quantitative_slot_inventory
      target_slot_families:
        - interfaces
        - performance
        - system_contract
        - composition
        - evidence_review
      records:
        - target_slot
        - quantity_kind
        - scope
        - applies_to
        - existing_status
        - required_for_harness
        - evidence_candidates
        - missing_or_conflict_reason
    summary: Create one auditable row for every known, missing, review-required, or harness-relevant quantitative slot before extraction.
    next:
      on_success: extract_source_backed_claims
      on_fail: stop
  - step_id: extract_source_backed_claims
    title: Extract Source-Backed Claims
    actor_slot: quantitative_claim_extractor
    action:
      kind: source_backed_quantitative_claim_write
      artifacts_in:
        - quantitative_slot_inventory
        - evidence_input_partition
      artifact_out: quantitative_claims
      allowed_field_status:
        - source_confirmed
        - derived
        - review_required
        - missing
      direct_claim_requires:
        - approved_evidence_ref
        - source_location_or_packet_ref
        - unit_for_unit_bearing_values
        - condition_or_scope_when_present
      derived_claim_requires:
        - source_confirmed_operands
        - formula
        - operand_refs
        - derived_status
      missing_claim_requires:
        - explicit_gap_reason
        - searched_or_available_inputs
        - downstream_impact
      forbidden_fill_basis:
        - label_only
        - default_assumption
        - memory_or_general_knowledge
        - downstream_harness_desire
        - one_sided_connection_evidence
    summary: Write quantitative claims only when evidence supports them; otherwise keep the value missing or review-required with an explicit gap record.
    next:
      on_success: write_enriched_sidecar_overlay
      on_fail: stop
  - step_id: write_enriched_sidecar_overlay
    title: Write Enriched Sidecar Overlay
    actor_slot: overlay_writer
    action:
      kind: page_module_spec_overlay_write
      artifacts_in:
        - normalized_contract_inventory
        - quantitative_claims
      artifact_out: enriched_sidecar_overlay
      overlay_policy:
        target_schema: page_module_spec_v0
        patch_like_overlay_only: true
        do_not_replace_original_sidecar: true
        do_not_invent_new_authoritative_schema: true
        preserve_missing_and_review_required_status: true
      writes:
        - target_slot_refs
        - proposed_status_updates
        - evidence_refs
        - source_gap_refs
        - derivation_refs
    summary: Materialize a patch-like overlay that targets existing normalized sidecar slots while preserving the original sidecar as the owner-owned input.
    next:
      on_success: write_gap_and_followup_packets
      on_fail: stop
  - step_id: write_gap_and_followup_packets
    title: Write Gap And Follow-Up Packets
    actor_slot: source_gap_followup_writer
    action:
      kind: source_gap_and_owner_followup_write
      artifacts_in:
        - quantitative_slot_inventory
        - quantitative_claims
        - evidence_input_partition
      artifacts_out:
        - source_gap_report
        - owner_followup_needed
      gap_types:
        - missing_source_value
        - missing_component_identity
        - missing_page_scope
        - missing_connector_context
        - missing_layout_constraint
        - missing_load_condition
        - missing_operating_condition
        - source_conflict
        - unapproved_source
        - owner_decision_required
      blocking_levels:
        - blocks_harness
        - review_required
        - informational
    summary: Make unresolved quantities, conflicts, owner actions, and rerun triggers machine-readable instead of hiding them in prose.
    next:
      on_success: compute_harness_readiness_delta
      on_fail: stop
  - step_id: compute_harness_readiness_delta
    title: Compute Harness Readiness Delta
    actor_slot: harness_readiness_reviewer
    action:
      kind: harness_readiness_delta_partition
      artifacts_in:
        - normalized_contract_inventory
        - quantitative_claims
        - enriched_sidecar_overlay
        - source_gap_report
        - owner_followup_needed
        - previous_harness_blocker_packet
      artifact_out: harness_readiness_delta
      delta_policy:
        delta_only: true
        do_not_mutate_harness_connection_statuses: true
        do_not_claim_final_join_validity: true
        preserve_one_sided_evidence_as_blocker_or_review_required: true
      records:
        - before
        - after
        - closed_blockers
        - remaining_blockers
        - newly_discovered_blockers
        - candidate_safe_possible_for
        - source_supported_possible_for
        - not_claimed
    summary: Translate evidence changes into harness-readiness deltas that a later harness workflow may consume, without approving connections here.
    next:
      on_success: write_provenance_and_boundary_review
      on_fail: stop
  - step_id: write_provenance_and_boundary_review
    title: Write Provenance And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: enrichment_boundary_and_overclaim_review
      artifacts_in:
        - quantitative_claims
        - enriched_sidecar_overlay
        - source_gap_report
        - owner_followup_needed
        - harness_readiness_delta
      artifacts_out:
        - enrichment_provenance
        - quantitative_enrichment_summary
      checks:
        - all_filled_values_have_source_refs_or_derivation_refs
        - missing_and_review_required_values_remain_visible
        - overlay_does_not_replace_sidecar
        - harness_readiness_is_delta_only
        - no_final_composition_approval_claim
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Confirm the enrichment packet is public-contract-safe and ready for a project-local harness pilot or stop with exact follow-up.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "page_quantitative_enrichment_v0",
  "fixture_id": "public_synthetic_values_gaps_conflict_overlay",
  "public_safe": true,
  "request": "Produce a dry-run quantitative enrichment overlay and harness-readiness delta for the synthetic normalized page contract. Do not mutate the sidecar or approve final harness connections.",
  "inputs": {
    "quantitative_enrichment_binding": "fixture://enrichment/page-demo",
    "page_module_spec_sidecar": "fixture://sidecars/page-demo-v0",
    "module_spec_manifest": {
      "page_id": "PAGE-DEMO",
      "schema": "page_module_spec_v0",
      "source_checksum": "sha256:fixture-page"
    },
    "provenance_update": {
      "page_id": "PAGE-DEMO",
      "source_checksum": "sha256:fixture-page"
    },
    "downstream_handoff": "fixture://handoff/harness-demo",
    "official_source_inventory": [
      {
        "evidence_ref": "fixture://sources/power-guide",
        "state": "official_present",
        "location": "page 4",
        "supports": {
          "target_slot": "interfaces.power.input_voltage",
          "value": 5,
          "unit": "V",
          "condition": "nominal"
        }
      },
      {
        "evidence_ref": "fixture://sources/load-guide",
        "state": "official_present",
        "location": "page 8",
        "supports": {
          "target_slot": "performance.max_current",
          "value": 2,
          "unit": "A",
          "condition": "ambient <= 40 C"
        }
      },
      {
        "evidence_ref": "fixture://sources/conflict-guide",
        "state": "official_present",
        "location": "page 3",
        "supports": {
          "target_slot": "performance.max_current",
          "value": 1.5,
          "unit": "A",
          "condition": "condition unclear"
        }
      }
    ],
    "owner_recorded_constraints": [
      {
        "target_slot": "interfaces.aux.input_voltage",
        "label_hint": "12V AUX",
        "approved_value_evidence": false
      }
    ],
    "previous_harness_blocker_packet": [
      {
        "target_slot": "interfaces.aux.input_voltage",
        "blocker": "missing approved voltage evidence"
      }
    ]
  },
  "normalized_slots": [
    {
      "target_slot": "interfaces.power.input_voltage",
      "existing_status": "missing",
      "required_for_harness": true
    },
    {
      "target_slot": "performance.max_current",
      "existing_status": "review_required",
      "required_for_harness": true
    },
    {
      "target_slot": "performance.max_power",
      "existing_status": "missing",
      "required_for_harness": true
    },
    {
      "target_slot": "interfaces.aux.input_voltage",
      "existing_status": "missing",
      "required_for_harness": true
    }
  ],
  "derivation_request": {
    "target_slot": "performance.max_power",
    "formula": "input_voltage * max_current",
    "operand_slots": [
      "interfaces.power.input_voltage",
      "performance.max_current"
    ]
  },
  "requested_deliverable": [
    "quantitative slot inventory",
    "claims using source_confirmed/derived/review_required/missing",
    "patch-like overlay against existing slots",
    "machine-readable gaps and owner follow-up",
    "delta-only harness readiness with before/after and remaining blockers",
    "provenance and boundary summary"
  ],
  "prohibitions": [
    "no 12V fill from label, no derived max power while current evidence conflicts, no sidecar/schema/source mutation, no final connection or global readiness approval"
  ],
  "boundary_attestation": "All source refs, values, slots, checksums, and constraints are synthetic."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
