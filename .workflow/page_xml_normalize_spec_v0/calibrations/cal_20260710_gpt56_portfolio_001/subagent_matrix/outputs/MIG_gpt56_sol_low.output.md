bundle_schema: page_xml_normalize_spec_deliverable_v0
workflow_id: page_xml_normalize_spec_v0
fixture_type: public_safe_synthetic
normalization_status: blocked_missing_required_source_metadata
review_required: true

stop_conditions:
  - code: source_page_checksums_incomplete
    detail: Only a source-level SHA-256 prefix is supplied; no complete per-page source_sha256 values are available.
  - code: source_page_asset_refs_unconfirmed
    detail: Synthetic source_page_ref values may be planned, but actual project-bound asset references are not supplied.
  - code: split_readiness_not_supplied
    detail: Normalization readiness cannot be established from the fixture.
  - code: sidecar_checksums_unavailable
    detail: page_module_spec_sha256 values require serialized project-local sidecars.
  - code: boundary_review_not_executable_from_fixture
    detail: Source immutability, output location, and runtime asset existence remain unverified.

page_module_spec_plan:
  schema_version: page_module_spec_v0
  source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_identity_sha256_prefix: 74195c6c62bdcf3f
  page_count: 11
  stable_page_id_policy: derive_from_source_order
  registration_key_pattern: project_binding.whole_xml_source.sample_exp_capture_big_xml::{source_page_id}
  sidecar_ref_pattern: modules/{source_page_id}/page_module_spec_v0.yaml
  source_page_ref_pattern: split_pages/{source_page_id}.xml
  source_page_ref_status: planned_unconfirmed
  source_sha256_status: missing
  annotation_variants_enabled: false
  source_xml_immutable: true

page_module_spec_sidecars:
  - &page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_001
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_001
      source_page_order: 1
      source_page_ref: split_pages/page_001.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
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
      unsupported_quantitative_values: []
      field_status: missing_source_evidence
    system_contract:
      electrical_domains:
        values: []
        field_status: unknown
      power_contract:
        values: []
        field_status: missing_source_evidence
      signal_contract:
        values: []
        field_status: missing_source_evidence
      readiness_contract:
        harness_ready: false
        basis: no_source_backed_support_supplied
        field_status: review_required
    composition:
      companion_modules: []
      external_harness_interfaces_confirmed: false
      harness_composition_performed: false
      final_library_registration_claimed: false
    evidence_review:
      evidence_refs: []
      role_hints: []
      source_gaps:
        - complete_per_page_source_sha256_missing
        - actual_source_page_ref_unconfirmed
        - page_content_evidence_not_supplied
        - split_readiness_not_supplied
      owner_followup:
        - Supply complete per-page checksums from the upstream manifest.
        - Supply project-bound source page asset references.
        - Supply split readiness and any non-authoritative page role hints.
      review_required: true
      confirmed_semantic_claims: []
      non_claims:
        - no_connectivity_inference
        - no_module_semantics_confirmation
        - no_external_harness_boundary_confirmation
        - no_harness_composition
        - no_final_library_registration
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_002
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_002
      source_page_order: 2
      source_page_ref: split_pages/page_002.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_003
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_003
      source_page_order: 3
      source_page_ref: split_pages/page_003.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_004
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_004
      source_page_order: 4
      source_page_ref: split_pages/page_004.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_005
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_005
      source_page_order: 5
      source_page_ref: split_pages/page_005.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_006
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_006
      source_page_order: 6
      source_page_ref: split_pages/page_006.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_007
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_007
      source_page_order: 7
      source_page_ref: split_pages/page_007.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_008
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_008
      source_page_order: 8
      source_page_ref: split_pages/page_008.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_009
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_009
      source_page_order: 9
      source_page_ref: split_pages/page_009.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_010
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_010
      source_page_order: 10
      source_page_ref: split_pages/page_010.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null
  - <<: *page_spec
    identity:
      registration_key: project_binding.whole_xml_source.sample_exp_capture_big_xml::page_011
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_011
      source_page_order: 11
      source_page_ref: split_pages/page_011.xml
      source_page_ref_status: planned_unconfirmed
      source_sha256: null
      source_sha256_status: missing
      normalized_page_ref: null
      normalized_sha256: null

module_spec_manifest:
  schema_version: page_module_spec_manifest_v0
  entries:
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_001", source_page_id: page_001, source_page_order: 1, source_page_ref: split_pages/page_001.xml, source_sha256: null, page_module_spec_ref: modules/page_001/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_002", source_page_id: page_002, source_page_order: 2, source_page_ref: split_pages/page_002.xml, source_sha256: null, page_module_spec_ref: modules/page_002/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_003", source_page_id: page_003, source_page_order: 3, source_page_ref: split_pages/page_003.xml, source_sha256: null, page_module_spec_ref: modules/page_003/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_004", source_page_id: page_004, source_page_order: 4, source_page_ref: split_pages/page_004.xml, source_sha256: null, page_module_spec_ref: modules/page_004/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_005", source_page_id: page_005, source_page_order: 5, source_page_ref: split_pages/page_005.xml, source_sha256: null, page_module_spec_ref: modules/page_005/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_006", source_page_id: page_006, source_page_order: 6, source_page_ref: split_pages/page_006.xml, source_sha256: null, page_module_spec_ref: modules/page_006/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_007", source_page_id: page_007, source_page_order: 7, source_page_ref: split_pages/page_007.xml, source_sha256: null, page_module_spec_ref: modules/page_007/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_008", source_page_id: page_008, source_page_order: 8, source_page_ref: split_pages/page_008.xml, source_sha256: null, page_module_spec_ref: modules/page_008/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_009", source_page_id: page_009, source_page_order: 9, source_page_ref: split_pages/page_009.xml, source_sha256: null, page_module_spec_ref: modules/page_009/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_010", source_page_id: page_010, source_page_order: 10, source_page_ref: split_pages/page_010.xml, source_sha256: null, page_module_spec_ref: modules/page_010/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}
    - {registration_key: "project_binding.whole_xml_source.sample_exp_capture_big_xml::page_011", source_page_id: page_011, source_page_order: 11, source_page_ref: split_pages/page_011.xml, source_sha256: null, page_module_spec_ref: modules/page_011/page_module_spec_v0.yaml, page_module_spec_sha256: null, role_hints: [], primary_domain: unknown, harness_readiness_basis: no_source_backed_support_supplied, source_gap_present: true, normalization_status: blocked, review_required: true}

module_spec_index:
  schema_version: page_module_spec_index_v0
  ordered_page_ids:
    - page_001
    - page_002
    - page_003
    - page_004
    - page_005
    - page_006
    - page_007
    - page_008
    - page_009
    - page_010
    - page_011
  page_count: 11
  identity_basis: source_order
  titleblock_identity_authoritative: false

provenance_update:
  upstream_workflow: whole_xml_page_split_v0
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  raw_xml_body_included: false
  source_xml_mutation_authorized: false
  derived_annotation_variant_present: false
  provenance_completeness: partial
  missing:
    - complete_source_checksum
    - per_page_source_checksums
    - confirmed_source_page_asset_refs
    - split_readiness

normalization_warnings:
  - code: titleblock_page_count_conflict
    severity: warning
    detail: Reported titleblock count 8 conflicts with 11 observed page nodes.
  - code: page_number_signal_incomplete
    severity: warning
    detail: Page-number signals are non-contiguous, with five page nodes missing or ambiguous.
  - code: source_order_identity_required
    severity: notice
    detail: Stable page IDs page_001 through page_011 are based on source order.
  - code: per_page_checksums_missing
    severity: stop
    detail: Required source_sha256 values cannot be populated from a source-level prefix.
  - code: semantic_evidence_absent
    severity: review_required
    detail: No page-content evidence supports circuit, function, interface, domain, or quantitative claims.
  - code: runtime_boundary_facts_unknown
    severity: stop
    detail: Source immutability, project-local output placement, and asset existence remain unverified.

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_role: xml_first_asset_registration_preparation
  readiness: not_ready
  supplied_packet:
    - page_module_spec_plan
    - conservative_page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
    - provenance_update
    - normalization_warnings
  withheld_claims:
    - canonical_normalized_xml_body
    - confirmed_connectivity
    - confirmed_module_semantics
    - harness_ready
    - harness_composition
    - final_library_asset_registration
  unblock_requirements:
    - Complete upstream per-page source references and SHA-256 values.
    - Establish split readiness.
    - Serialize sidecars and populate their checksums.
    - Complete boundary and handoff review against project-bound artifacts.
