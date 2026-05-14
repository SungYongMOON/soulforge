```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  fixture_type: public_safe_real_sample_derived_structural_metadata
  assigned_profile:
    model: gpt-5.4
    reasoning_effort: low
    species: dwarf
    class: archivist
  parser_mode: streaming_elementtree_boundary_probe
  root_element: Design
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  project_local_only: true
  public_safe_constraints:
    raw_xml_body_included: false
    runtime_absolute_path_included: false

page_boundary_summary:
  authoritative_boundary_family: Page
  page_node_count: 11
  split_count_decision: 11
  stable_id_policy: derive page_001..page_011 from source order
  page_number_signal_status:
    non_contiguous: true
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
  manifest_warnings:
    - titleblock Page Count reports 8 on observed nodes and conflicts with the 11 authoritative Page nodes
    - page-number signals are incomplete and non-contiguous; ordinal source order is the only stable public-safe split key

page_split_plan:
  split_mode: one output page XML asset per authoritative Page node
  output_count: 11
  ordering_rule: preserve source page order exactly
  per_page_identity: stable_id plus source_ordinal
  preservation_rules:
    - preserve page-local XML payload verbatim
    - do not normalize XML, refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity
    - do not merge, collapse, or synthesize pages
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
  single_page_fallback_allowed: false
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    archive_page_payloads_in_public_canon: false

page_manifest:
  source_summary:
    schematic_count: 1
    total_element_count: 186608
    global_tag_counts:
      Package: 107
      PartInst: 1067
      NetScalar: 1153
      WireScalar: 4378
      OffPageConnector: 538
      PartInstUserProp: 7644
      IsNoConnect: 3494
  warnings:
    - code: TITLEBLOCK_PAGE_COUNT_MISMATCH
      detail: reported Page Count value 8 must not be used as split cardinality
    - code: PAGE_NUMBER_SIGNAL_INCOMPLETE
      detail: page-number/title signals are missing or ambiguous on 5 pages
    - code: PUBLIC_SAFE_DERIVATION_ONLY
      detail: packet contains structural metadata only; page XML bodies remain project-local assets

page_index:
  - stable_id: page_001
    source_ordinal: 1
    page_number_signals: ["1"]
    page_count_signals: ["8"]
    title_signal: present_redacted
    counts:
      element_count: 29892
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
    title_signal: present_redacted
    counts:
      element_count: 29974
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
    title_signal: present_redacted
    counts:
      element_count: 57198
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
    title_signal: present_redacted
    counts:
      element_count: 3210
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
    title_signal: present_redacted
    counts:
      element_count: 4190
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
    title_signal: missing_or_not_public
    counts:
      element_count: 1434
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
    title_signal: missing_or_not_public
    counts:
      element_count: 1536
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
    title_signal: missing_or_not_public
    counts:
      element_count: 4404
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
    title_signal: present_redacted
    counts:
      element_count: 7200
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
    title_signal: present_redacted
    counts:
      element_count: 5808
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
    title_signal: missing_or_not_public
    counts:
      element_count: 2096
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
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  fixture_type: public_safe_real_sample_derived_structural_metadata
  real_sample_used: true
  real_sample_path_archived: false
  derivation_basis:
    - authoritative Page node boundaries
    - source-order ordinal assignment
    - structural counts and redacted page-level signals only
  excluded_from_packet:
    - raw XML bodies
    - runtime absolute paths
    - raw page payloads
    - credentials/cookies/private project data

page_role_hints:
  non_authoritative: true
  hints:
    - stable_id: page_001
      role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_002
      role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_003
      role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_004
      role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_005
      role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_006
      role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]
    - stable_id: page_007
      role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]
    - stable_id: page_008
      role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]
    - stable_id: page_009
      role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_010
      role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_011
      role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]

split_readiness:
  ready_for_split: true
  readiness_basis:
    - 11 authoritative Page nodes identified
    - stable ordinal ids defined for every page
    - split policy forbids single-page fallback and trusts source order
    - public-safe manifest warnings capture conflicting titleblock metadata
  cautions:
    - downstream consumers must not reinterpret Page Count value 8 as authoritative
    - missing/non-contiguous page-number signals should remain annotations only

downstream_handoff:
  next_workflow_id: page_xml_normalize_spec_v0
  handoff_assets:
    - 11 project-local page XML assets, one per stable_id
    - manifest with stable_id to source_ordinal mapping
    - source provenance context including source_sha256_prefix and split warnings
  downstream_requirements:
    - consume page assets in manifest order
    - preserve stable_id identity assigned by this split
    - treat role hints as routing hints only
    - do not assume titleblock numbering is complete or correct

open_questions:
  - Should downstream retain redacted title/page-number signals as annotations even when missing or conflicting?
  - Is a public-safe per-page checksum policy desired for manifest hardening, or should only source-level checksum lineage be carried?
  - Should pages with material-property signals be tagged with a stronger downstream review hint, or remain under the current non-authoritative role-hint policy?
```