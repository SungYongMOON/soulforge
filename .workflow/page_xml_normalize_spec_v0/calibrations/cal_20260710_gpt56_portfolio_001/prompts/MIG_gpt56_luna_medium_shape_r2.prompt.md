You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=elf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: page_module_spec_sidecars, module_spec_manifest, module_spec_index, provenance_update, normalization_warnings, downstream_handoff.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: page_xml_normalize_spec_v0
kind: workflow
status: active
title: Page XML Normalize Spec v0
summary: Produce sidecar-first `page_module_spec_v0` metadata packages from read-only page XML assets emitted by `whole_xml_page_split_v0`, before XML-first asset registration.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - page_xml_assets
  - page_manifest
  - page_module_project_binding
  - page_module_spec_policy
optional_inputs:
  - page_index
  - source_provenance
  - page_role_hints
  - split_readiness
  - annotation_variant_policy
outputs:
  - page_module_spec_sidecars
  - module_spec_manifest
  - module_spec_index
  - provenance_update
  - normalization_warnings
  - downstream_handoff
optional_outputs:
  - annotated_page_xml_review_variants
  - annotation_variant_manifest
validation_level: pilot_executed_private_fixture
upstream_workflow:
  workflow_id: whole_xml_page_split_v0
  expected_outputs:
    - page_xml_assets
    - page_manifest
  optional_context_packets:
    - page_index
    - source_provenance
    - page_role_hints
    - split_readiness
downstream_workflow:
  workflow_id: capture_xml_intake_library_v0
  expected_inputs:
    - page_module_spec_sidecars
    - module_spec_manifest
  optional_context_packet: downstream_handoff
  handoff_role: xml_first_asset_registration_preparation
  handoff_note: Downstream registration may still read source XML through project binding; this workflow provides page-level metadata sidecars and review state, not a canonical replacement XML body.
spec_contract:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - system_contract
    - composition
    - evidence_review
  optional_blocks:
    - annotation_variant
  required_identity_fields:
    - registration_key
    - source_system_id
    - source_page_id
    - source_page_order
    - source_page_ref
    - source_sha256
  required_interface_containers:
    - inputs
    - outputs
    - bidirectional
    - passive_or_none
  optional_module_definition_fields:
    electrical_domains:
      claim_policy: review_hint
    module_scope:
      completeness_values:
        - standalone
        - companion_required
        - partial_slice
        - unknown
      default: unknown
      claim_policy: review_hint
    channelization:
      fields:
        - appears_channelized
        - channel_count_hint
        - channel_range_hint
        - repeated_block_kind
        - repeated_block_label_hint
        - evidence_refs
      claim_policy: review_hint
    classification_basis:
      fields:
        - page_label
        - visible_part_names
        - connector_like_labels
        - visible_regulator_identity
        - other_visible_evidence
      claim_policy: rationale_for_review_required_classification
  optional_interface_containers:
    - local_internal_candidates
    - interface_groups
  optional_interface_item_fields:
    - electrical_domain
    - interface_group
    - signal_family
    - nominal
    - field_status
  required_system_contract_sections:
    - electrical_domains
    - power_contract
    - signal_contract
    - readiness_contract
  review_state_policy:
    confirmed_requires_source_evidence: true
    name_or_title_inference_requires_review: true
    classification_basis_records_rationale_not_truth: true
    local_internal_candidates_do_not_imply_external_harness_boundary: true
    system_contract_slots_may_be_blank_or_missing_status: true
    unit_bearing_quantitative_values_require_status_and_evidence: true
    harness_ready_defaults_false_until_source_backed: true
    unsupported_quantitative_values_stay_blank: true
    source_xml_immutable: true
scope:
  primary_work:
    - page_module_spec_v0_sidecar_generation
    - deterministic_sidecar_file_naming
    - module_spec_manifest_and_index_generation
    - stable_page_identity_metadata
    - internal_registration_key_generation
    - checksum_and_provenance_field_normalization
    - interface_container_initialization
    - interface_group_initialization
    - optional_structural_scope_hint_recording
    - optional_channelization_hint_recording
    - optional_classification_basis_recording
    - optional_local_internal_candidate_recording
    - optional_system_contract_slot_initialization
    - optional_quantitative_contract_slot_initialization
    - optional_source_gap_and_followup_slot_initialization
    - optional_function_and_performance_hint_recording
    - warning_and_review_required_field_normalization
  optional_derived_work:
    - annotated_xml_review_variant_generation
    - annotation_variant_manifest_generation
  preserved_from_source:
    - source_page_order
    - source_page_id
    - source_page_label
    - source_page_asset_identity
    - source_page_checksum
    - read_only_source_page_payload
    - non_authoritative_role_hints
  forbidden_operations:
    - source_page_xml_mutation
    - source_page_xml_body_rewrite_as_default_output
    - canonical_normalized_xml_body_claim
    - source_net_or_connectivity_semantics_inference
    - unsupported_module_semantics_confirmation
    - component_material_collection
    - mdd_attachment_or_pairing_claim
    - harness_composition
    - final_library_asset_registration_claim
notes:
  - This workflow is the sidecar-first page-module metadata bridge after `whole_xml_page_split_v0` and before XML-first asset registration.
  - The primary per-page output is `page_module_spec_v0.yaml`; source page XML remains immutable and is referenced by identity and checksum only.
  - "`normalized_page_ref` and `normalized_sha256` fields stay blank unless a policy-approved derived review variant exists."
  - Annotated XML variants are optional, derived, project-local, and review-only; they are never the canonical library source.
  - Page role hints may be carried forward as non-authoritative review context only.
  - Structural completeness, channelization, classification basis, and local/internal control-status candidates are optional review hints; absence or `unknown` is valid when visible evidence is weak.
  - Electrical-domain, interface-group, quantitative, readiness, and source-gap slots are part of the module contract shape for later harness composition, but this workflow still records them conservatively and does not promote unsupported values to confirmed truth.
  - Likely local/internal nodes such as switch, feedback, power-good, set, or regulator-control/status labels stay separate from external harness interface candidates unless later source-backed registration promotes them.
  - The workflow prepares module-spec sidecars and manifests, but does not claim final registered library assets.
  - A private 11-page split-fixture matrix has been executed to verify required sidecar blocks, downstream handoff emission, and source-page immutability; ambiguous page semantics remain review-required.
  - Public canon must not include raw XML bodies, generated page payloads, host-specific runtime paths, project-local output payloads, credentials, cookies, or secret material.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: page_xml_normalize_spec_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_page_module_binding
    title: Prepare Page Module Binding
    actor_slot: workflow_runner
    action:
      kind: local_workspace_setup
      requires:
        - page_xml_assets
        - page_manifest
        - page_module_output_root
        - page_module_spec_policy
      optional_accepts:
        - page_index
        - source_provenance
        - page_role_hints
        - split_readiness
        - annotation_variant_policy
      validates:
        - page_manifest_exists
        - page_xml_assets_exist
        - page_xml_assets_are_read_only_inputs
        - page_module_output_root_is_project_local
        - page_module_output_root_is_not_workflow_package
      creates:
        - page_module_output_root
        - page_module_spec_sidecar_dir
        - module_manifest_dir
        - run_log_root
    summary: Resolve project-local input and output bindings, confirm source page XML assets will not be modified, and create only project-local output folders for sidecars and manifests.
    next:
      on_success: reconcile_split_manifest
      on_fail: stop
  - step_id: reconcile_split_manifest
    title: Reconcile Split Manifest
    actor_slot: split_manifest_reconciler
    action:
      kind: split_manifest_reconciliation
      artifacts_in:
        - page_manifest
        - page_xml_assets
      optional_artifacts_in:
        - page_index
        - source_provenance
        - page_role_hints
        - split_readiness
      artifact_out: page_normalization_input_summary
      records:
        - page_count
        - page_order
        - stable_page_ids
        - source_page_asset_refs
        - source_page_checksums
        - source_labels
        - role_hints
        - split_warnings
      checks:
        - page_order_preserved
        - each_manifest_page_has_asset_ref
        - each_page_asset_ref_exists
        - page_id_uniqueness_preserved
        - split_readiness_allows_normalization
      source_policy:
        read_source_page_xml_as_input_only: true
        copy_raw_xml_to_public_package: false
        manifest_raw_xml_body: false
    summary: Build a compact input summary from split outputs, preserving page order and stable identity links before any module sidecar is written.
    next:
      on_success: plan_page_module_spec_shape
      on_fail: stop
  - step_id: plan_page_module_spec_shape
    title: Plan Page Module Spec Shape
    actor_slot: module_spec_planner
    action:
      kind: deterministic_sidecar_plan
      artifacts_in:
        - page_normalization_input_summary
        - page_module_spec_policy
      artifact_out: page_module_spec_plan
      planning_rules:
        preserve_source_page_order: true
        preserve_source_page_id: true
        derive_registration_key_from_source_identity_and_page_id: true
        sidecar_file_name_policy: page_module_spec_v0_yaml_under_stable_page_id
        duplicate_registration_key_policy: stop_and_record_warning
        missing_role_hint_policy: carry_unknown_with_review_required
        normalized_page_ref_policy: blank_unless_optional_derived_variant_exists
        structural_scope_policy: record_standalone_companion_required_partial_slice_or_unknown_as_review_hint
        channelization_policy: record_lightweight_repeated_block_hints_when_visible
        classification_basis_policy: record_visible_basis_for_circuit_type_or_function_hints_without_confirming_truth
        local_internal_candidate_policy: keep_likely_control_or_status_nodes_separate_from_external_interfaces
      sidecar_schema:
        schema_version: page_module_spec_v0
        required_blocks:
          - identity
          - module_definition
          - interfaces
          - performance
          - system_contract
          - composition
          - evidence_review
        optional_blocks:
          - annotation_variant
      allowed_normalization:
        - sidecar_file_naming
        - module_spec_metadata_shape
        - checksum_fields
        - provenance_fields
        - interface_container_fields
        - interface_group_fields
        - structural_scope_hint_fields
        - channelization_hint_fields
        - classification_basis_fields
        - local_internal_candidate_fields
        - system_contract_slot_fields
        - quantitative_contract_slot_fields
        - readiness_and_source_gap_slot_fields
        - review_warning_fields
        - internal_registration_key_fields
      not_allowed:
        - rewrite_source_page_assets
        - make_xml_body_rewrite_default_output
        - claim_derived_xml_as_canonical_source
        - infer_connectivity
        - confirm_module_semantics_without_evidence
        - collect_component_materials
        - attach_mdd
        - compose_harness
        - claim_final_library_registration
    summary: Produce a deterministic sidecar plan that standardizes page-module metadata without changing source XML or overclaiming design meaning.
    next:
      on_success: write_page_module_spec_sidecars
      on_fail: stop
  - step_id: write_page_module_spec_sidecars
    title: Write Page Module Spec Sidecars
    actor_slot: module_sidecar_writer
    action:
      kind: yaml_sidecar_write
      artifacts_in:
        - page_xml_assets
        - page_module_spec_plan
      artifacts_out:
        - page_module_spec_sidecars
        - sidecar_checksums
      per_page_output_file: page_module_spec_v0.yaml
      output_location_policy:
        project_local_only: true
        never_under_workflow_package: true
        overwrite_policy: require_explicit_binding_or_empty_output_root
      content_policy:
        write_yaml_metadata_sidecar: true
        source_page_xml_mutation_allowed: false
        source_page_xml_body_rewrite_allowed: false
        raw_xml_body_copy_allowed: false
        semantic_claims_require_evidence_or_review_required: true
      sidecar_blocks:
        - identity
        - module_definition
        - interfaces
        - performance
        - system_contract
        - composition
        - evidence_review
        - annotation_variant
      field_policy:
        source_refs_and_checksums_required: true
        interface_containers_required_even_when_empty: true
        interface_groups_optional_but_preferred_when_visible: true
        electrical_domains_may_be_derived_or_unknown: true
        structural_completeness_default_unknown: true
        channelization_hints_optional_and_review_required: true
        classification_basis_is_rationale_not_confirmation: true
        local_internal_candidates_not_external_harness_interfaces: true
        system_contract_slots_required_even_when_values_missing: true
        harness_ready_defaults_false_until_later_enrichment: true
        source_gap_and_owner_followup_slots_allowed: true
        optional_quantitative_fields_may_be_blank: true
        inferred_function_or_circuit_type_requires_review: true
        normalized_page_ref_blank_unless_optional_variant_exists: true
    summary: Materialize one `page_module_spec_v0.yaml` sidecar per source page as the primary normalization output while preserving source XML identity and uncertainty.
    next:
      on_success: maybe_write_annotated_xml_review_variants
      on_fail: stop
  - step_id: maybe_write_annotated_xml_review_variants
    title: Maybe Write Annotated XML Review Variants
    actor_slot: annotation_variant_writer
    action:
      kind: optional_derived_xml_variant_write
      artifacts_in:
        - page_xml_assets
        - page_module_spec_sidecars
        - annotation_variant_policy
      artifacts_out:
        - annotated_page_xml_review_variants
        - annotation_variant_manifest
      activation_policy:
        default_enabled: false
        requires_explicit_project_policy: true
        skip_is_success_when_not_enabled: true
      output_location_policy:
        project_local_only: true
        never_under_workflow_package: true
      content_policy:
        write_derived_annotated_xml_payload: true
        source_page_xml_mutation_allowed: false
        canonical_source_claim_allowed: false
        semantic_claim_authority: review_only
        allowed_annotation_scope:
          - page_summary
          - purpose_note
          - review_note
          - operator_memo
        forbidden_annotation_scope:
          - refdes_renaming
          - net_renaming
          - pin_or_function_reassignment
          - coordinate_edits
          - semantic_rewrite_that_changes_circuit_meaning
    summary: Optionally produce derived annotated XML review variants; when disabled, sidecars remain the complete primary output.
    next:
      on_success: write_module_manifests_and_handoff
      on_skip: write_module_manifests_and_handoff
      on_fail: stop
  - step_id: write_module_manifests_and_handoff
    title: Write Module Manifests And Handoff
    actor_slot: manifest_handoff_writer
    action:
      kind: manifest_write
      artifacts_in:
        - page_normalization_input_summary
        - page_module_spec_plan
        - page_module_spec_sidecars
        - sidecar_checksums
      optional_artifacts_in:
        - annotated_page_xml_review_variants
        - annotation_variant_manifest
      artifacts_out:
        - module_spec_manifest
        - module_spec_index
        - provenance_update
        - normalization_warnings
        - downstream_handoff
      output_files:
        module_spec_manifest: module_spec_manifest.yaml
        module_spec_index: module_spec_index.yaml
        provenance_update: provenance_update.yaml
        normalization_warnings: normalization_warnings.yaml
        downstream_handoff: downstream_handoff.yaml
      manifest_fields:
        - registration_key
        - source_page_id
        - source_page_order
        - source_page_ref
        - source_sha256
        - page_module_spec_ref
        - page_module_spec_sha256
        - optional_annotation_variant_ref
        - optional_annotation_variant_sha256
        - role_hints
        - primary_domain
        - harness_readiness_basis
        - source_gap_present
        - normalization_status
        - review_required
      manifest_policy:
        include_module_spec_sidecar_refs: true
        include_optional_annotation_refs_when_present: true
        include_page_order_and_ids: true
        include_internal_registration_keys: true
        include_raw_page_xml_body: false
        require_normalized_xml_body_refs: false
        final_library_registration_claim_allowed: false
    summary: Write compact project-local manifests and handoff refs centered on `page_module_spec_v0` sidecars for downstream XML-first registration.
    next:
      on_success: boundary_and_handoff_review
      on_fail: stop
  - step_id: boundary_and_handoff_review
    title: Boundary And Handoff Review
    actor_slot: boundary_reviewer
    action:
      kind: boundary_and_readiness_review
      artifacts_in:
        - page_module_spec_sidecars
        - module_spec_manifest
        - module_spec_index
        - provenance_update
        - normalization_warnings
        - downstream_handoff
      optional_artifacts_in:
        - annotated_page_xml_review_variants
        - annotation_variant_manifest
      artifact_out: normalization_readiness
      checks:
        - source_page_assets_unchanged
        - sidecar_outputs_are_project_local
        - no_generated_assets_under_workflow_package
        - page_order_and_stable_ids_preserved
        - registration_keys_are_deterministic
        - page_module_spec_v0_blocks_present
        - system_contract_block_present
        - optional_structural_scope_values_are_conservative
        - optional_channelization_hints_do_not_create_harness_claims
        - classification_basis_does_not_confirm_inferred_semantics
        - local_internal_candidates_are_not_promoted_to_required_or_provided_interfaces
        - harness_ready_not_true_without_source_backed_support
        - quantitative_slots_not_filled_without_status_and_evidence
        - sidecars_are_primary_outputs
        - annotated_xml_variants_are_optional_derived_review_only
        - warnings_and_review_required_items_recorded
        - no_source_xml_body_rewrite_required
        - no_materials_collection_performed
        - no_mdd_attachment_or_pairing_claim
        - no_harness_composition_performed
        - ready_for_xml_first_asset_registration
    summary: Confirm the sidecar packet is contained, source-safe, manifest-backed, and ready for later XML-first asset registration without overclaiming final registration.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "page_xml_normalize_spec_v0",
  "fixture_type": "public_safe_downstream_structural_metadata_from_prior_split_calibration_with_contract_refresh",
  "source_fixture_ref": "whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json",
  "raw_xml_body_included": false,
  "runtime_absolute_path_included": false,
  "credentials_or_secret_material_included": false,
  "generated_project_outputs_included": false,
  "upstream_workflow": "whole_xml_page_split_v0",
  "downstream_workflow": "capture_xml_intake_library_v0",
  "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
  "source_sha256_prefix": "74195c6c62bdcf3f",
  "split_summary": {
    "root_element": "Design",
    "page_boundary_node_family": "Page",
    "page_count": 11,
    "titleblock_page_count_signal": {
      "reported_count_values": [
        "8"
      ],
      "observed_on_page_nodes": 6,
      "conflicts_with_actual_page_nodes": true
    },
    "page_number_signal_summary": {
      "present_values": [
        "1",
        "2",
        "5",
        "6",
        "7",
        "8"
      ],
      "missing_or_ambiguous_page_nodes": 5,
      "non_contiguous": true
    },
    "stable_page_id_policy": "derive page_001..page_011 from source order; do not trust titleblock Page Count/Number as complete identity"
  },
  "page_module_spec_policy": {
    "schema_version": "page_module_spec_v0",
    "primary_per_page_file": "page_module_spec_v0.yaml",
    "required_blocks": [
      "identity",
      "module_definition",
      "interfaces",
      "performance",
      "system_contract",
      "composition",
      "evidence_review"
    ],
    "optional_blocks": [
      "annotation_variant"
    ],
    "required_identity_fields": [
      "registration_key",
      "source_system_id",
      "source_page_id",
      "source_page_order",
      "source_page_ref",
      "source_sha256"
    ],
    "required_interface_containers": [
      "inputs",
      "outputs",
      "bidirectional",
      "passive_or_none"
    ],
    "optional_interface_containers": [
      "local_internal_candidates",
      "interface_groups"
    ],
    "required_system_contract_sections": [
      "electrical_domains",
      "power_contract",
      "signal_contract",
      "readiness_contract"
    ],
    "harness_ready_defaults_false_until_source_backed": true,
    "semantic_claims_require_review": true,
    "local_internal_candidates_not_external_interfaces": true,
    "unsupported_quantitative_values_stay_blank": true,
    "final_asset_registration_done_here": false
  },
  "page_ids": [
    "page_001",
    "page_002",
    "page_003",
    "page_004",
    "page_005",
    "page_006",
    "page_007",
    "page_008",
    "page_009",
    "page_010",
    "page_011"
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
