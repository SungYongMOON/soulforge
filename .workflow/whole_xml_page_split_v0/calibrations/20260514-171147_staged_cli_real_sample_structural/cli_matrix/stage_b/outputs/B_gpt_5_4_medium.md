```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  fixture_type: public_safe_real_sample_derived_structural_metadata
  execution_mode: public_safe_cli_calibration
  assigned_profile:
    model: gpt-5.4
    reasoning_effort: medium
    species: dwarf
    class: archivist
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  root_element: Design
  parser_mode: streaming_elementtree_boundary_probe
  boundary_authority: Page nodes
  stable_page_id_policy: source-order-derived page_001..page_011

page_boundary_summary:
  authoritative_page_node_family: Page
  authoritative_page_count: 11
  schematic_count: 1
  page_number_signal_status:
    non_contiguous: true
    missing_or_ambiguous_page_nodes: 5
    observed_values: ["1", "2", "5", "6", "7", "8"]
  manifest_warnings:
    - titleblock Page Count reports 8 on observed nodes but actual Page-node count is 11
    - page-number signals are incomplete and non-contiguous; source order is the only stable split key
    - some pages have redacted or missing title/count/number signals; payload preservation must not depend on those fields

page_split_plan:
  split_unit: one output page XML asset per authoritative Page node
  split_count: 11
  output_ids:
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
  preservation_rules:
    - preserve source page order exactly
    - preserve each page-local XML payload byte-faithfully or element-faithfully without normalization
    - do not normalize refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity
    - if downstream labels are duplicate or missing, retain ordinal ids and emit manifest warnings
    - do not collapse to a single-page fallback

page_manifest:
  source_document:
    schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML
    total_element_count: 186608
    global_tag_counts:
      Package: 107
      PartInst: 1067
      NetScalar: 1153
      WireScalar: 4378
      OffPageConnector: 538
      PartInstUserProp: 7644
      IsNoConnect: 3494
  page_assets_expected: 11
  warnings:
    - code `titleblock_page_count_conflict`: reported Page Count 8 conflicts with 11 authoritative Page nodes
    - code `page_number_non_contiguous`: public-safe page-number signals cannot be used as complete identity
    - code `redacted_title_signals_present`: titles exist for some pages but are intentionally not carried in public-safe packet
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    archive_page_payloads_in_public_canon: false

page_index:
  - stable_id: page_001
    source_ordinal: 1
    page_number_signals: ["1"]
    page_count_signals: ["8"]
    element_count: 29892
    structural_fingerprint:
      part_inst_count: 211
      net_scalar_count: 296
      wire_scalar_count: 856
      off_page_connector_count: 156
      port_inst_scalar_count: 621
      no_connect_marker_count: 621
      part_user_prop_count: 1460
      material_property_signal_count: 0
      pcb_footprint_signal_count: 211
  - stable_id: page_002
    source_ordinal: 2
    page_number_signals: ["2"]
    page_count_signals: ["8"]
    element_count: 29974
    structural_fingerprint:
      part_inst_count: 211
      net_scalar_count: 296
      wire_scalar_count: 851
      off_page_connector_count: 155
      port_inst_scalar_count: 621
      no_connect_marker_count: 621
      part_user_prop_count: 1460
      material_property_signal_count: 0
      pcb_footprint_signal_count: 211
  - stable_id: page_003
    source_ordinal: 3
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
    element_count: 57198
    structural_fingerprint:
      part_inst_count: 464
      net_scalar_count: 260
      wire_scalar_count: 1689
      off_page_connector_count: 36
      port_inst_scalar_count: 1120
      no_connect_marker_count: 1120
      part_user_prop_count: 3360
      material_property_signal_count: 0
      pcb_footprint_signal_count: 464
  - stable_id: page_004
    source_ordinal: 4
    page_number_signals: ["5"]
    page_count_signals: ["8"]
    element_count: 3210
    structural_fingerprint:
      part_inst_count: 11
      net_scalar_count: 58
      wire_scalar_count: 99
      off_page_connector_count: 81
      port_inst_scalar_count: 11
      no_connect_marker_count: 11
      part_user_prop_count: 33
      material_property_signal_count: 0
      pcb_footprint_signal_count: 11
  - stable_id: page_005
    source_ordinal: 5
    page_number_signals: ["6"]
    page_count_signals: ["8"]
    element_count: 4190
    structural_fingerprint:
      part_inst_count: 24
      net_scalar_count: 51
      wire_scalar_count: 132
      off_page_connector_count: 45
      port_inst_scalar_count: 64
      no_connect_marker_count: 64
      part_user_prop_count: 132
      material_property_signal_count: 0
      pcb_footprint_signal_count: 24
  - stable_id: page_006
    source_ordinal: 6
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
    element_count: 1434
    structural_fingerprint:
      part_inst_count: 11
      net_scalar_count: 10
      wire_scalar_count: 50
      off_page_connector_count: 0
      port_inst_scalar_count: 33
      no_connect_marker_count: 33
      part_user_prop_count: 63
      material_property_signal_count: 3
      pcb_footprint_signal_count: 11
  - stable_id: page_007
    source_ordinal: 7
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
    element_count: 1536
    structural_fingerprint:
      part_inst_count: 12
      net_scalar_count: 10
      wire_scalar_count: 56
      off_page_connector_count: 0
      port_inst_scalar_count: 35
      no_connect_marker_count: 35
      part_user_prop_count: 69
      material_property_signal_count: 3
      pcb_footprint_signal_count: 12
  - stable_id: page_008
    source_ordinal: 8
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
    element_count: 4404
    structural_fingerprint:
      part_inst_count: 39
      net_scalar_count: 19
      wire_scalar_count: 123
      off_page_connector_count: 0
      port_inst_scalar_count: 96
      no_connect_marker_count: 96
      part_user_prop_count: 540
      material_property_signal_count: 39
      pcb_footprint_signal_count: 39
  - stable_id: page_009
    source_ordinal: 9
    page_number_signals: ["7"]
    page_count_signals: ["8"]
    element_count: 7200
    structural_fingerprint:
      part_inst_count: 58
      net_scalar_count: 39
      wire_scalar_count: 220
      off_page_connector_count: 23
      port_inst_scalar_count: 138
      no_connect_marker_count: 138
      part_user_prop_count: 358
      material_property_signal_count: 0
      pcb_footprint_signal_count: 58
  - stable_id: page_010
    source_ordinal: 10
    page_number_signals: ["8"]
    page_count_signals: ["8"]
    element_count: 5808
    structural_fingerprint:
      part_inst_count: 10
      net_scalar_count: 102
      wire_scalar_count: 237
      off_page_connector_count: 42
      port_inst_scalar_count: 154
      no_connect_marker_count: 154
      part_user_prop_count: 52
      material_property_signal_count: 0
      pcb_footprint_signal_count: 10
  - stable_id: page_011
    source_ordinal: 11
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
    element_count: 2096
    structural_fingerprint:
      part_inst_count: 16
      net_scalar_count: 12
      wire_scalar_count: 65
      off_page_connector_count: 0
      port_inst_scalar_count: 43
      no_connect_marker_count: 43
      part_user_prop_count: 117
      material_property_signal_count: 3
      pcb_footprint_signal_count: 16

source_provenance:
  provenance_class: project_local_derived_from_real_sample_structural_metadata
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  real_sample_used: true
  real_sample_path_archived: false
  binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  integrity_reference:
    source_sha256_prefix: 74195c6c62bdcf3f
    source_size_bytes: 12670307
  parser_observation_scope:
    root_element: Design
    max_depth: 8
    page_boundary_node_family: Page

page_role_hints:
  non_authoritative_notice: true
  routing_hints:
    likely_schematic_with_offpage_context:
      - page_001
      - page_002
      - page_003
      - page_004
      - page_005
      - page_009
      - page_010
    likely_hardware_or_material_context:
      - page_006
      - page_007
      - page_008
      - page_011
    possible_pcb_context:
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

split_readiness:
  status: ready_for_project_local_split
  readiness_checks:
    authoritative_page_nodes_present: true
    stable_ids_assigned: true
    source_order_preserved: true
    single_page_fallback_disallowed: true
    manifest_warning_recorded_for_titleblock_conflict: true
  blocking_issues: []
  cautions:
    - downstream consumers must use stable_id, not page-number/titleblock count, as primary identity
    - page-local XML must be handed off intact without public-canon storage

downstream_handoff:
  next_workflow_id: page_xml_normalize_spec_v0
  handoff_artifacts:
    - project-local page XML assets for page_001..page_011
    - split manifest with stable ids and source ordinals
    - source provenance block with source hash prefix and size
    - manifest warnings about titleblock count conflict and numbering gaps
  handoff_contract:
    - downstream may normalize only after split stage
    - downstream must retain stable_id to source_ordinal mapping
    - downstream must not infer missing page identity from titleblock Page Count
    - public/reusable outputs may keep metadata, checksums, warnings, and refs only

open_questions:
  - Should the project-local runner emit per-page checksums after extraction for stronger payload traceability?
  - Should pages with material_property_signal_count > 0 be flagged with an explicit material-review hint in addition to current routing hints?
  - Is there a preferred public-safe manifest field for duplicate-or-missing label warnings beyond the current generic warning set?
```