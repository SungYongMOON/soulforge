workflow_id: whole_xml_page_split_v0
calibration_id: synthetic-calibration-20260514-171147
deliverable_type: public_safe_workflow_candidate
status: fixture_derived_not_runtime_verified

binding:
  source_identity: synthetic.whole_xml_source.sample_exp_capture_big_xml
  source_revision_identity: synthetic.source-revision-74195c6c62bdcf3f
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  source_mutation_allowed: false
  output_root: project_local://synthetic-project/page-split
  workflow_package_output_forbidden: true

boundary_summary:
  parser_mode: streaming_elementtree_boundary_probe
  root_element: Design
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  page_boundary_node_family: Page
  page_count_candidate: 11
  max_depth: 8
  total_element_count: 186608
  schematic_count: 1
  parser_warnings:
    - titleblock_page_count_signal_reports_8_but_11_page_nodes_are_present
    - page_number_signals_are_missing_or_ambiguous_for_5_pages
    - page_number_signals_are_non_contiguous
  raw_xml_included: false

split_plan:
  preserve_source_page_order: true
  preserve_page_xml_without_normalization: true
  stable_page_id_policy: derive_from_source_order
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
  single_page_fallback_allowed: false
  pages:
    - {stable_id: page_001, source_ordinal: 1}
    - {stable_id: page_002, source_ordinal: 2}
    - {stable_id: page_003, source_ordinal: 3}
    - {stable_id: page_004, source_ordinal: 4}
    - {stable_id: page_005, source_ordinal: 5}
    - {stable_id: page_006, source_ordinal: 6}
    - {stable_id: page_007, source_ordinal: 7}
    - {stable_id: page_008, source_ordinal: 8}
    - {stable_id: page_009, source_ordinal: 9}
    - {stable_id: page_010, source_ordinal: 10}
    - {stable_id: page_011, source_ordinal: 11}

page_assets:
  location: project_local://synthetic-project/page-split/pages/
  naming_pattern: page_{stable_id}.xml
  payload_policy: preserve_page_local_xml_without_normalization
  checksums: pending_runtime_generation

manifest:
  file: project_local://synthetic-project/page-split/page_manifest.yaml
  include_page_asset_refs: true
  include_page_order_and_ids: true
  include_raw_page_xml_body: false
  warnings:
    - titleblock_page_count_is_not_used_as_complete_page_identity
    - page_number_metadata_is_incomplete_or_non_contiguous
    - page_role_hints_are_non_authoritative

page_index:
  file: project_local://synthetic-project/page-split/page_index.yaml
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

source_provenance:
  file: project_local://synthetic-project/page-split/source_provenance.yaml
  source_file_identity: synthetic.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_revision_identity: synthetic.source-revision-74195c6c62bdcf3f
  parser_mode: streaming_elementtree_boundary_probe
  split_method: ordered_Page_boundary_split
  page_count: 11
  page_order: source_ordinal
  page_id_map: source_ordinal_to_page_001_through_page_011
  created_at: pending_runtime_generation
  tool_version_or_script_identity: pending_runtime_generation
  source_mutation_check: pending_runtime_generation

page_role_hints:
  authority: non_authoritative_routing_only
  deep_material_analysis: not_performed
  pcb_or_mdd_pairing_claim: not_made
  hints:
    - page_ids: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
      categories: [schematic, possible_pcb_or_mdd_context]
      confidence: low_to_medium
      basis: schematic_content_and_footprint_signals
    - page_ids: [page_006, page_007, page_008, page_011]
      categories: [schematic, hardware_or_material_context, possible_pcb_or_mdd_context]
      confidence: low_to_medium
      basis: material_property_and_footprint_signals
    - page_ids: [page_001, page_002, page_003, page_004, page_005, page_009, page_010, page_006, page_007, page_008, page_011]
      categories: [offpage_connector_context]
      confidence: low_to_medium
      basis: off_page_connector_signals_where_present

split_readiness:
  state: conditional_pending_runtime_boundary_review
  ready_for: page_xml_normalize_spec_v0
  required_runtime_checks:
    - source_xml_unchanged
    - page_assets_are_project_local
    - no_page_assets_under_workflow_package
    - page_order_and_stable_ids_recorded
    - no_normalization_performed
    - no_materials_collection_performed
    - no_pcb_mdd_pairing_overclaim
  stop_conditions:
    - source_missing
    - source_not_read_only
    - output_root_not_project_local
    - output_root_inside_workflow_package
    - page_boundary_detection_failure
    - overwrite_without_explicit_binding_or_empty_output_root
    - page_split_plan_not_deterministic
    - source_mutation_detected
    - required_manifest_or_provenance_write_failure

non_claims:
  - raw_xml_body_not_reproduced
  - project_local_page_payloads_not_archived_in_public_canon
  - runtime_execution_not_attested
  - page_checksums_not_attested
  - material_identification_not_performed
  - connectivity_inference_not_performed
  - schema_normalization_not_performed
  - PCB_or_MDD_pairing_not established
