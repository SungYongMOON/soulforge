page_module_spec_sidecars:
  schema_version: page_module_spec_v0
  source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_assets_read_only: true
  raw_xml_body_included: false
  annotation_variants:
    enabled: false
    refs: []
  sidecars:
    - &page_spec
      sidecar_ref: page_001/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_001
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_001
        source_page_order: 1
        source_page_ref: page_001/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
      module_definition:
        circuit_type: null
        function: null
        electrical_domains: []
        module_scope:
          completeness: unknown
          field_status: review_required
        channelization:
          appears_channelized: unknown
          channel_count_hint: null
          channel_range_hint: null
          repeated_block_kind: null
          repeated_block_label_hint: null
          evidence_refs: []
          field_status: review_required
        classification_basis:
          page_label: null
          visible_part_names: []
          connector_like_labels: []
          visible_regulator_identity: null
          other_visible_evidence: []
          field_status: missing_source_evidence
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
        interface_groups: []
      performance:
        quantitative_contracts: []
        unsupported_values_left_blank: true
      system_contract:
        electrical_domains:
          values: []
          field_status: missing_source_evidence
        power_contract:
          requirements: []
          provisions: []
          field_status: missing_source_evidence
        signal_contract:
          requirements: []
          provisions: []
          field_status: missing_source_evidence
        readiness_contract:
          harness_ready: false
          harness_readiness_basis: no_source_backed_support_supplied
          field_status: review_required
      composition:
        companion_modules: []
        harness_membership: null
        harness_composition_performed: false
      evidence_review:
        review_required: true
        normalization_status: structurally_initialized
        source_gap_present: true
        evidence_refs: []
        source_gaps:
          - exact_source_page_checksum_not_supplied
          - page_content_evidence_not_supplied
          - module_semantics_not_established
          - interface_semantics_not_established
        owner_followup:
          - supply_or_resolve_the_exact_per_page_source_sha256
          - review_source_page_content_before_confirming_classification_or_interfaces
    - <<: *page_spec
      sidecar_ref: page_002/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_002
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_002
        source_page_order: 2
        source_page_ref: page_002/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_003/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_003
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_003
        source_page_order: 3
        source_page_ref: page_003/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_004/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_004
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_004
        source_page_order: 4
        source_page_ref: page_004/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_005/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_005
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_005
        source_page_order: 5
        source_page_ref: page_005/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_006/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_006
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_006
        source_page_order: 6
        source_page_ref: page_006/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_007/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_007
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_007
        source_page_order: 7
        source_page_ref: page_007/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_008/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_008
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_008
        source_page_order: 8
        source_page_ref: page_008/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_009/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_009
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_009
        source_page_order: 9
        source_page_ref: page_009/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_010/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_010
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_010
        source_page_order: 10
        source_page_ref: page_010/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null
    - <<: *page_spec
      sidecar_ref: page_011/page_module_spec_v0.yaml
      identity:
        registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_011
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_011
        source_page_order: 11
        source_page_ref: page_011/source_page.xml
        source_sha256: null
        normalized_page_ref: null
        normalized_sha256: null

module_spec_manifest:
  schema_version: page_module_spec_v0
  page_count: 11
  final_library_registration_claimed: false
  entries:
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_001, source_page_id: page_001, source_page_order: 1, source_page_ref: page_001/source_page.xml, source_sha256: null, page_module_spec_ref: page_001/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_002, source_page_id: page_002, source_page_order: 2, source_page_ref: page_002/source_page.xml, source_sha256: null, page_module_spec_ref: page_002/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_003, source_page_id: page_003, source_page_order: 3, source_page_ref: page_003/source_page.xml, source_sha256: null, page_module_spec_ref: page_003/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_004, source_page_id: page_004, source_page_order: 4, source_page_ref: page_004/source_page.xml, source_sha256: null, page_module_spec_ref: page_004/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_005, source_page_id: page_005, source_page_order: 5, source_page_ref: page_005/source_page.xml, source_sha256: null, page_module_spec_ref: page_005/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_006, source_page_id: page_006, source_page_order: 6, source_page_ref: page_006/source_page.xml, source_sha256: null, page_module_spec_ref: page_006/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_007, source_page_id: page_007, source_page_order: 7, source_page_ref: page_007/source_page.xml, source_sha256: null, page_module_spec_ref: page_007/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_008, source_page_id: page_008, source_page_order: 8, source_page_ref: page_008/source_page.xml, source_sha256: null, page_module_spec_ref: page_008/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_009, source_page_id: page_009, source_page_order: 9, source_page_ref: page_009/source_page.xml, source_sha256: null, page_module_spec_ref: page_009/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_010, source_page_id: page_010, source_page_order: 10, source_page_ref: page_010/source_page.xml, source_sha256: null, page_module_spec_ref: page_010/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}
    - {registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_011, source_page_id: page_011, source_page_order: 11, source_page_ref: page_011/source_page.xml, source_sha256: null, page_module_spec_ref: page_011/page_module_spec_v0.yaml, page_module_spec_sha256: null, optional_annotation_variant_ref: null, optional_annotation_variant_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: structurally_initialized, review_required: true}

module_spec_index:
  schema_version: page_module_spec_v0
  ordering_basis: source_page_order
  stable_page_id_policy: derive_page_001_through_page_011_from_source_order
  entries:
    page_001: {source_page_order: 1, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_001, page_module_spec_ref: page_001/page_module_spec_v0.yaml}
    page_002: {source_page_order: 2, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_002, page_module_spec_ref: page_002/page_module_spec_v0.yaml}
    page_003: {source_page_order: 3, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_003, page_module_spec_ref: page_003/page_module_spec_v0.yaml}
    page_004: {source_page_order: 4, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_004, page_module_spec_ref: page_004/page_module_spec_v0.yaml}
    page_005: {source_page_order: 5, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_005, page_module_spec_ref: page_005/page_module_spec_v0.yaml}
    page_006: {source_page_order: 6, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_006, page_module_spec_ref: page_006/page_module_spec_v0.yaml}
    page_007: {source_page_order: 7, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_007, page_module_spec_ref: page_007/page_module_spec_v0.yaml}
    page_008: {source_page_order: 8, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_008, page_module_spec_ref: page_008/page_module_spec_v0.yaml}
    page_009: {source_page_order: 9, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_009, page_module_spec_ref: page_009/page_module_spec_v0.yaml}
    page_010: {source_page_order: 10, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_010, page_module_spec_ref: page_010/page_module_spec_v0.yaml}
    page_011: {source_page_order: 11, registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml.page_011, page_module_spec_ref: page_011/page_module_spec_v0.yaml}

provenance_update:
  workflow_id: page_xml_normalize_spec_v0
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix_context: 74195c6c62bdcf3f
  source_sha256_prefix_is_not_per_page_checksum: true
  source_page_identity_basis: source_order
  source_page_count: 11
  source_xml_body_included: false
  source_xml_immutable_requirement: true
  generated_annotation_variants: false
  semantic_evidence_supplied: false
  provenance_limitations:
    - exact_per_page_source_checksums_not_supplied
    - sidecar_checksums_not_available_in_fixture
    - source_page_asset_refs_are_synthetic_relative_bindings
    - titleblock_page_count_and_number_signals_are_not_authoritative_identity

normalization_warnings:
  status: review_required
  items:
    - warning_id: titleblock_page_count_conflict
      scope: all_pages
      detail: reported_page_count_8_conflicts_with_11_page_nodes
      disposition: preserve_11_pages_by_source_order
    - warning_id: titleblock_page_number_incomplete
      scope: all_pages
      detail: five_page_nodes_have_missing_or_ambiguous_number_signals_and_present_values_are_non_contiguous
      disposition: use_stable_page_ids_page_001_through_page_011
    - warning_id: per_page_checksums_missing
      scope: all_pages
      detail: exact_source_sha256_values_were_not_supplied
      disposition: leave_source_sha256_blank_and_require_resolution_before_checksum_complete_handoff
    - warning_id: sidecar_checksums_unavailable
      scope: all_pages
      detail: page_module_spec_sha256_values_are_not established
      disposition: leave_blank_until_artifacts_exist_and_are_checksum-resolved
    - warning_id: semantic_evidence_missing
      scope: all_pages
      detail: no_page_content_or_authoritative_role_evidence_was supplied
      disposition: retain_unknown_classification_empty_interfaces_and_review_required
    - warning_id: annotation_variants_disabled
      scope: all_pages
      detail: no_explicit_annotation_variant_policy_was supplied
      disposition: do_not_emit_derived_xml_variants
  stop_conditions:
    - duplicate_registration_key_detected
    - manifest_page_missing_from_source_asset_binding
    - source_page_asset_reference_unresolvable
    - split_readiness_disallows_normalization
    - source_xml_mutation_required
    - output_binding_targets_workflow_package
    - confirmed_semantic_or_quantitative_claim_lacks_source_evidence
    - harness_ready_requested_true_without_source_backed_support

downstream_handoff:
  workflow_id: capture_xml_intake_library_v0
  handoff_role: xml_first_asset_registration_preparation
  readiness: blocked_pending_source_and_sidecar_checksum_resolution
  packet_refs:
    page_module_spec_sidecars: page_module_spec_sidecars
    module_spec_manifest: module_spec_manifest
    module_spec_index: module_spec_index
    provenance_update: provenance_update
    normalization_warnings: normalization_warnings
  page_count: 11
  source_xml_access:
    through_project_binding: project_binding.whole_xml_source.sample_exp_capture_big_xml
    raw_xml_embedded: false
    mutation_authorized: false
  review_requirements:
    - resolve_exact_per_page_source_sha256_values
    - resolve_page_module_spec_sha256_values_after_materialization
    - confirm_each_source_page_asset_reference
    - review_module_classification_and_interfaces_against_source_evidence
    - retain_harness_ready_false_until_source_backed
  non_claims:
    canonical_normalized_xml_body_created: false
    connectivity_inferred: false
    module_semantics_confirmed: false
    local_internal_candidates_promoted_to_external_interfaces: false
    component_materials_collected: false
    mdd_attached_or_paired: false
    harness_composed: false
    final_library_registration_completed: false
