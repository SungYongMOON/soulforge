workflow_id: whole_xml_page_split_v0
calibration_id: 20260514-171147_staged_cli_real_sample_structural
deliverable_kind: public_safe_split_handoff_bundle
status: structurally_planned_not_runtime_verified

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_file_identity: synthetic_redacted_source
  source_file_sha256:
    value: unknown
    known_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  source_revision_identity: synthetic_fixture_revision
  parser_mode: streaming_elementtree_boundary_probe
  root_element: Design
  schema_marker: Cadence/OrCAD Capture Design EXP-like XML
  split_method: ordered_Page_element_boundary_split
  page_boundary_node_family: Page
  page_count: 11
  created_at: unknown
  tool_version_or_script_identity: unknown
  source_mutation_check: not_performed
  raw_xml_body_included: false
  runtime_absolute_path_included: false

page_boundary_summary:
  max_depth: 8
  total_element_count: 186608
  schematic_count: 1
  page_count_candidate: 11
  parser_warnings:
    - titleblock_page_count_signal_reports_8_but_11_Page_nodes_are_present
    - page_number_signals_are_non_contiguous
    - five_page_nodes_have_missing_or_non_public_page_number_signals
    - titleblock_signals_are_not_sufficient_for_complete_page_identity
  identity_decision:
    policy: derive_stable_ids_from_source_order
    stable_ids: page_001_through_page_011
    titleblock_page_numbers_used_as_identity: false
    source_order_preserved: true
    rationale: Page-node order is complete within the fixture; titleblock count and number signals are incomplete or conflicting.

page_manifest:
  asset_root: project_binding.page_split_output_root
  asset_directory: project_binding.page_xml_asset_dir
  location_requirements:
    project_local_only: true
    under_workflow_package: false
    public_canon_payload_archive: false
  overwrite_requirement: explicit_binding_or_empty_output_root
  raw_page_xml_bodies_in_manifest: false
  page_count: 11
  page_order:
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
  warnings:
    - titleblock_page_count_conflicts_with_Page_node_count
    - page_number_metadata_is_incomplete_and_non_contiguous
    - ordinal_ids_are_revision-local_and_must_be_regenerated_if_source_page_order_changes
  pages:
    - stable_id: page_001
      source_ordinal: 1
      asset_ref: page_xml_asset_dir/page_001.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 29892
      page_number_signals: ["1"]
      page_count_signals: ["8"]
    - stable_id: page_002
      source_ordinal: 2
      asset_ref: page_xml_asset_dir/page_002.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 29974
      page_number_signals: ["2"]
      page_count_signals: ["8"]
    - stable_id: page_003
      source_ordinal: 3
      asset_ref: page_xml_asset_dir/page_003.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 57198
      page_number_signals: [missing_or_not_public]
      page_count_signals: [missing_or_not_public]
    - stable_id: page_004
      source_ordinal: 4
      asset_ref: page_xml_asset_dir/page_004.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 3210
      page_number_signals: ["5"]
      page_count_signals: ["8"]
    - stable_id: page_005
      source_ordinal: 5
      asset_ref: page_xml_asset_dir/page_005.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 4190
      page_number_signals: ["6"]
      page_count_signals: ["8"]
    - stable_id: page_006
      source_ordinal: 6
      asset_ref: page_xml_asset_dir/page_006.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 1434
      page_number_signals: [missing_or_not_public]
      page_count_signals: [missing_or_not_public]
    - stable_id: page_007
      source_ordinal: 7
      asset_ref: page_xml_asset_dir/page_007.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 1536
      page_number_signals: [missing_or_not_public]
      page_count_signals: [missing_or_not_public]
    - stable_id: page_008
      source_ordinal: 8
      asset_ref: page_xml_asset_dir/page_008.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 4404
      page_number_signals: [missing_or_not_public]
      page_count_signals: [missing_or_not_public]
    - stable_id: page_009
      source_ordinal: 9
      asset_ref: page_xml_asset_dir/page_009.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 7200
      page_number_signals: ["7"]
      page_count_signals: ["8"]
    - stable_id: page_010
      source_ordinal: 10
      asset_ref: page_xml_asset_dir/page_010.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 5808
      page_number_signals: ["8"]
      page_count_signals: ["8"]
    - stable_id: page_011
      source_ordinal: 11
      asset_ref: page_xml_asset_dir/page_011.xml
      asset_state: expected_not_materialized_by_this_deliverable
      asset_sha256: unknown
      element_count: 2096
      page_number_signals: [missing_or_not_public]
      page_count_signals: [missing_or_not_public]

page_index:
  page_001: {source_ordinal: 1, asset_ref: page_xml_asset_dir/page_001.xml}
  page_002: {source_ordinal: 2, asset_ref: page_xml_asset_dir/page_002.xml}
  page_003: {source_ordinal: 3, asset_ref: page_xml_asset_dir/page_003.xml}
  page_004: {source_ordinal: 4, asset_ref: page_xml_asset_dir/page_004.xml}
  page_005: {source_ordinal: 5, asset_ref: page_xml_asset_dir/page_005.xml}
  page_006: {source_ordinal: 6, asset_ref: page_xml_asset_dir/page_006.xml}
  page_007: {source_ordinal: 7, asset_ref: page_xml_asset_dir/page_007.xml}
  page_008: {source_ordinal: 8, asset_ref: page_xml_asset_dir/page_008.xml}
  page_009: {source_ordinal: 9, asset_ref: page_xml_asset_dir/page_009.xml}
  page_010: {source_ordinal: 10, asset_ref: page_xml_asset_dir/page_010.xml}
  page_011: {source_ordinal: 11, asset_ref: page_xml_asset_dir/page_011.xml}

page_role_hints:
  authority: non_authoritative_routing_only
  review_required: true
  pages:
    page_001:
      hints: [schematic, possible_pcb_or_mdd_context]
      basis: [schematic_content, offpage_connector_context, pcb_footprint_signal]
      confidence: provisional
    page_002:
      hints: [schematic, possible_pcb_or_mdd_context]
      basis: [schematic_content, offpage_connector_context, pcb_footprint_signal]
      confidence: provisional
    page_003:
      hints: [schematic, possible_pcb_or_mdd_context]
      basis: [schematic_content, offpage_connector_context, pcb_footprint_signal]
      confidence: provisional
    page_004:
      hints: [schematic, possible_pcb_or_mdd_context]
      basis: [schematic_content, offpage_connector_context, pcb_footprint_signal]
      confidence: provisional
    page_005:
      hints: [schematic, possible_pcb_or_mdd_context]
      basis: [schematic_content, offpage_connector_context, pcb_footprint_signal]
      confidence: provisional
    page_006:
      hints: [mixed, hardware_or_material_context, possible_pcb_or_mdd_context]
      basis: [schematic_content, material_property_signal, pcb_footprint_signal]
      confidence: provisional
    page_007:
      hints: [mixed, hardware_or_material_context, possible_pcb_or_mdd_context]
      basis: [schematic_content, material_property_signal, pcb_footprint_signal]
      confidence: provisional
    page_008:
      hints: [mixed, hardware_or_material_context, possible_pcb_or_mdd_context]
      basis: [schematic_content, material_property_signal, pcb_footprint_signal]
      confidence: provisional
    page_009:
      hints: [schematic, possible_pcb_or_mdd_context]
      basis: [schematic_content, offpage_connector_context, pcb_footprint_signal]
      confidence: provisional
    page_010:
      hints: [schematic, possible_pcb_or_mdd_context]
      basis: [schematic_content, offpage_connector_context, pcb_footprint_signal]
      confidence: provisional
    page_011:
      hints: [mixed, hardware_or_material_context, possible_pcb_or_mdd_context]
      basis: [schematic_content, material_property_signal, pcb_footprint_signal]
      confidence: provisional
  non_claims:
    - pcb_or_mdd_pairing_is_not_established
    - material_identity_or_completeness_is_not_established
    - connectivity_is_not_inferred
    - datasheet_association_is_not_established

split_readiness:
  disposition: blocked_pending_materialization_and_boundary_review
  structural_plan_ready: true
  downstream_workflow: page_xml_normalize_spec_v0
  expected_downstream_input: page_xml_assets
  optional_context_packet: page_manifest
  checks:
    source_xml_unchanged: unknown
    page_assets_materialized: false
    page_assets_are_project_local: unknown
    no_page_assets_under_workflow_package: unknown
    page_order_and_stable_ids_recorded: true
    page_asset_checksums_recorded: false
    no_normalization_performed: true
    no_materials_collection_performed: true
    no_pcb_mdd_pairing_overclaim: true
    ready_for_page_xml_normalize_spec_v0: false
  stop_conditions:
    - stop_if_source_is_not_confirmed_read_only_input
    - stop_if_output_root_is_not_project_local
    - stop_if_output_root_is_inside_workflow_package
    - stop_if_output_root_is_nonempty_without_explicit_overwrite_binding
    - stop_if_Page_boundaries_cannot_be_reproduced_as_11_ordered_nodes
    - stop_if_page_local_XML_cannot_be_preserved_without_normalization
    - stop_if_source_mutation_check_cannot_be_completed
    - stop_if_any_page_asset_or_manifest_checksum_is_missing_at_handoff
  required_next_actions:
    - resolve a project-local output binding outside the workflow package
    - materialize page_001.xml through page_011.xml from ordered Page boundaries
    - preserve page-local XML without schema or semantic rewriting
    - record complete source and page-asset SHA-256 values
    - record creation time and tool or script identity
    - perform the source-mutation and boundary review
    - release to page_xml_normalize_spec_v0 only after all readiness checks pass
