page_xml_assets:
  status: not_materialized
  asset_count_planned: 11
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    public_canon_payload_archival: false
  content_policy:
    preserve_page_xml_without_normalization: true
    source_xml_mutation_allowed: false
  assets:
    - stable_id: page_001
      source_ordinal: 1
      asset_ref: project_binding.page_xml_assets.page_001
    - stable_id: page_002
      source_ordinal: 2
      asset_ref: project_binding.page_xml_assets.page_002
    - stable_id: page_003
      source_ordinal: 3
      asset_ref: project_binding.page_xml_assets.page_003
    - stable_id: page_004
      source_ordinal: 4
      asset_ref: project_binding.page_xml_assets.page_004
    - stable_id: page_005
      source_ordinal: 5
      asset_ref: project_binding.page_xml_assets.page_005
    - stable_id: page_006
      source_ordinal: 6
      asset_ref: project_binding.page_xml_assets.page_006
    - stable_id: page_007
      source_ordinal: 7
      asset_ref: project_binding.page_xml_assets.page_007
    - stable_id: page_008
      source_ordinal: 8
      asset_ref: project_binding.page_xml_assets.page_008
    - stable_id: page_009
      source_ordinal: 9
      asset_ref: project_binding.page_xml_assets.page_009
    - stable_id: page_010
      source_ordinal: 10
      asset_ref: project_binding.page_xml_assets.page_010
    - stable_id: page_011
      source_ordinal: 11
      asset_ref: project_binding.page_xml_assets.page_011
  non_claims:
    - No page XML payload is included.
    - Asset creation, serialization, checksums, and project-local placement are not established by the fixture.

page_manifest:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  manifest_status: structural_plan_only
  page_count_candidate: 11
  page_order_basis: source_ordinal
  stable_page_id_policy: derive_page_001_through_page_011_from_source_order
  pages:
    - stable_id: page_001
      source_ordinal: 1
      element_count: 29892
      page_number_signal: "1"
      page_count_signal: "8"
      identity_warning: false
    - stable_id: page_002
      source_ordinal: 2
      element_count: 29974
      page_number_signal: "2"
      page_count_signal: "8"
      identity_warning: false
    - stable_id: page_003
      source_ordinal: 3
      element_count: 57198
      page_number_signal: missing_or_not_public
      page_count_signal: missing_or_not_public
      identity_warning: true
    - stable_id: page_004
      source_ordinal: 4
      element_count: 3210
      page_number_signal: "5"
      page_count_signal: "8"
      identity_warning: true
    - stable_id: page_005
      source_ordinal: 5
      element_count: 4190
      page_number_signal: "6"
      page_count_signal: "8"
      identity_warning: true
    - stable_id: page_006
      source_ordinal: 6
      element_count: 1434
      page_number_signal: missing_or_not_public
      page_count_signal: missing_or_not_public
      identity_warning: true
    - stable_id: page_007
      source_ordinal: 7
      element_count: 1536
      page_number_signal: missing_or_not_public
      page_count_signal: missing_or_not_public
      identity_warning: true
    - stable_id: page_008
      source_ordinal: 8
      element_count: 4404
      page_number_signal: missing_or_not_public
      page_count_signal: missing_or_not_public
      identity_warning: true
    - stable_id: page_009
      source_ordinal: 9
      element_count: 7200
      page_number_signal: "7"
      page_count_signal: "8"
      identity_warning: true
    - stable_id: page_010
      source_ordinal: 10
      element_count: 5808
      page_number_signal: "8"
      page_count_signal: "8"
      identity_warning: true
    - stable_id: page_011
      source_ordinal: 11
      element_count: 2096
      page_number_signal: missing_or_not_public
      page_count_signal: missing_or_not_public
      identity_warning: true
  warnings:
    - Titleblock page-count value 8 conflicts with 11 observed Page-node candidates.
    - Page-number signals are incomplete and non-contiguous.
    - Titleblock signals are not authoritative page identities.
    - Stable identifiers therefore use source order.
    - Raw page XML bodies and runtime paths are excluded.

page_index:
  index_status: structural_plan_only
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
  source_ordinal_map:
    page_001: 1
    page_002: 2
    page_003: 3
    page_004: 4
    page_005: 5
    page_006: 6
    page_007: 7
    page_008: 8
    page_009: 9
    page_010: 10
    page_011: 11
  ordering_claim:
    basis: supplied_fixture_source_order
    confidence: fixture_asserted
  excluded_identity_sources:
    - incomplete_page_number_signals
    - conflicting_titleblock_page_count

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_identity_scope: synthetic_public_safe_binding
  source_sha256:
    value: unknown
    supplied_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  source_revision_identity: unknown
  root_element: Design
  schema_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  parser_mode: streaming_elementtree_boundary_probe
  split_method: ordered_Page_node_boundary_plan
  page_boundary_node_family: Page
  page_count_candidate: 11
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  created_at: unknown
  tool_version_or_script_identity: unknown
  source_mutation_check:
    status: not_established
    required_for_completion: true
  provenance_limits:
    - The fixture supplies structural metadata rather than page payloads.
    - The SHA-256 value is only a prefix and cannot support a full checksum claim.
    - Source revision, creation time, writer identity, and post-split mutation status remain unknown.

page_role_hints:
  authority: non_authoritative_routing_hints_only
  pages:
    page_001:
      categories:
        - schematic
        - possible_pcb_or_mdd_context
      review_required: true
    page_002:
      categories:
        - schematic
        - possible_pcb_or_mdd_context
      review_required: true
    page_003:
      categories:
        - schematic
        - possible_pcb_or_mdd_context
      review_required: true
    page_004:
      categories:
        - schematic
        - possible_pcb_or_mdd_context
      review_required: true
    page_005:
      categories:
        - schematic
        - possible_pcb_or_mdd_context
      review_required: true
    page_006:
      categories:
        - schematic
        - hardware_or_material_context
        - possible_pcb_or_mdd_context
      review_required: true
    page_007:
      categories:
        - schematic
        - hardware_or_material_context
        - possible_pcb_or_mdd_context
      review_required: true
    page_008:
      categories:
        - schematic
        - hardware_or_material_context
        - possible_pcb_or_mdd_context
      review_required: true
    page_009:
      categories:
        - schematic
        - possible_pcb_or_mdd_context
      review_required: true
    page_010:
      categories:
        - schematic
        - possible_pcb_or_mdd_context
      review_required: true
    page_011:
      categories:
        - schematic
        - hardware_or_material_context
        - possible_pcb_or_mdd_context
      review_required: true
  boundaries:
    - PCB-footprint signals do not establish PCB or MDD pairing.
    - Material-property signals do not establish collected or validated materials.
    - No connectivity, component identity, datasheet, or design-intent conclusions are made.

split_readiness:
  status: blocked_pending_materialization_and_boundary_review
  structurally_plannable: true
  ready_for_page_xml_normalize_spec_v0: false
  established_from_fixture:
    page_boundary_family_identified: true
    candidate_page_count_identified: true
    deterministic_page_order_defined: true
    stable_page_ids_defined: true
    titleblock_identity_conflict_recorded: true
    normalization_out_of_scope: true
    materials_collection_out_of_scope: true
    pcb_mdd_pairing_not_claimed: true
  unresolved_required_checks:
    - whole_xml_source_exists
    - whole_xml_source_is_read_only_input
    - page_split_output_root_is_project_local
    - page_split_output_root_is_not_workflow_package
    - page_assets_materialized
    - page_assets_preserve_page_local_xml
    - page_asset_checksums_recorded
    - source_xml_unchanged
    - manifest_index_and_provenance_written
    - no_normalization_performed
    - no_materials_collection_performed
    - final_boundary_and_handoff_review_completed
  stop_conditions:
    - Stop if Page boundaries cannot be reproduced from the bound source.
    - Stop if the output root is absent, non-project-local, under a workflow package, non-empty without explicit overwrite binding, or otherwise ambiguous.
    - Stop if source mutation would be required.
    - Stop if ordered page extraction does not yield exactly 11 Page assets for this source revision.
    - Stop if stable page identifiers or source order cannot be preserved.
    - Stop if page-local XML cannot be preserved without normalization or semantic rewriting.
    - Stop before downstream normalization until materialized assets, complete provenance, and boundary checks are available.
