```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  execution_profile:
    model: gpt-5.4
    reasoning_effort: xhigh
    species: dwarf
    class: archivist
  fixture_type: public_safe_real_sample_derived_structural_metadata
  public_safe: true
  real_sample_used: true
  raw_xml_body_included: false
  runtime_absolute_path_included: false

page_boundary_summary:
  authoritative_boundary_family: Page
  authoritative_page_node_count: 11
  stable_page_id_policy: "source-order derived ids: page_001..page_011"
  source_order_preserved: true
  page_number_signal_status:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true
    identity_policy: "do not use page-number/titleblock signals as canonical page identity"
  manifest_warnings:
    - "Titleblock Page Count reports 8 on observed nodes, but authoritative Page-node count is 11."
    - "Page-number signals are incomplete/non-contiguous; stable ids must remain ordinal."
    - "Duplicate-or-missing human labels, if emitted downstream, should use ordinal suffix and manifest warning."

page_split_plan:
  split_unit: one XML payload per Page node
  split_count: 11
  output_asset_policy:
    project_local_only: true
    never_under_workflow_package: true
    archive_page_payloads_in_public_canon: false
  preservation_rules:
    - preserve source page order
    - preserve page-local XML payloads byte-faithfully where runner permits
    - do not normalize XML, refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity
    - do not collapse to a single-page fallback
  asset_naming_plan:
    stable_ids:
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

page_manifest:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  root_element: Design
  schema_family_marker: "Cadence/OrCAD Capture Design EXP-like XML; host path redacted"
  parser_mode: streaming_elementtree_boundary_probe
  page_count_candidate: 11
  titleblock_page_count_signal:
    reported_count_values: ["8"]
    observed_on_page_nodes: 6
    conflicts_with_actual_page_nodes: true
  pages:
    - stable_id: page_001
      source_ordinal: 1
      page_number_signals: ["1"]
      page_count_signals: ["8"]
      title_signal: present_redacted
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_002
      source_ordinal: 2
      page_number_signals: ["2"]
      page_count_signals: ["8"]
      title_signal: present_redacted
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_003
      source_ordinal: 3
      page_number_signals: ["missing_or_not_public"]
      page_count_signals: ["missing_or_not_public"]
      title_signal: present_redacted
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_004
      source_ordinal: 4
      page_number_signals: ["5"]
      page_count_signals: ["8"]
      title_signal: present_redacted
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_005
      source_ordinal: 5
      page_number_signals: ["6"]
      page_count_signals: ["8"]
      title_signal: present_redacted
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_006
      source_ordinal: 6
      page_number_signals: ["missing_or_not_public"]
      page_count_signals: ["missing_or_not_public"]
      title_signal: missing_or_not_public
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_007
      source_ordinal: 7
      page_number_signals: ["missing_or_not_public"]
      page_count_signals: ["missing_or_not_public"]
      title_signal: missing_or_not_public
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_008
      source_ordinal: 8
      page_number_signals: ["missing_or_not_public"]
      page_count_signals: ["missing_or_not_public"]
      title_signal: missing_or_not_public
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_009
      source_ordinal: 9
      page_number_signals: ["7"]
      page_count_signals: ["8"]
      title_signal: present_redacted
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_010
      source_ordinal: 10
      page_number_signals: ["8"]
      page_count_signals: ["8"]
      title_signal: present_redacted
      structural_counts:
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
        datasheet_link_signal_count: 0
    - stable_id: page_011
      source_ordinal: 11
      page_number_signals: ["missing_or_not_public"]
      page_count_signals: ["missing_or_not_public"]
      title_signal: missing_or_not_public
      structural_counts:
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
        datasheet_link_signal_count: 0

page_index:
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
  page_number_signal_map:
    page_001: ["1"]
    page_002: ["2"]
    page_003: ["missing_or_not_public"]
    page_004: ["5"]
    page_005: ["6"]
    page_006: ["missing_or_not_public"]
    page_007: ["missing_or_not_public"]
    page_008: ["missing_or_not_public"]
    page_009: ["7"]
    page_010: ["8"]
    page_011: ["missing_or_not_public"]
  routing_buckets:
    offpage_connector_present:
      - page_001
      - page_002
      - page_003
      - page_004
      - page_005
      - page_009
      - page_010
    material_property_present:
      - page_006
      - page_007
      - page_008
      - page_011

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  root_element: Design
  schematic_count: 1
  page_boundary_node_family: Page
  parser_mode: streaming_elementtree_boundary_probe
  max_depth: 8
  total_element_count: 186608
  global_tag_counts:
    Package: 107
    PartInst: 1067
    NetScalar: 1153
    WireScalar: 4378
    OffPageConnector: 538
    PartInstUserProp: 7644
    IsNoConnect: 3494
  provenance_notes:
    - "This packet is derived from structural metadata only."
    - "Raw XML bodies and host-specific paths are intentionally excluded."
    - "Page payload checksums are not available in this calibration fixture."

page_role_hints:
  policy: non_authoritative_routing_hints_only
  hints:
    - stable_id: page_001
      hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_002
      hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_003
      hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_004
      hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_005
      hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_006
      hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]
    - stable_id: page_007
      hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]
    - stable_id: page_008
      hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]
    - stable_id: page_009
      hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_010
      hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"]
    - stable_id: page_011
      hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]

split_readiness:
  ready_for_split: true
  readiness_basis:
    - authoritative Page-node boundaries are present for all 11 pages
    - stable ordinal ids are fully derivable without trusting titleblock numbering
    - preservation policy is explicit and compatible with downstream normalization
  blocking_issues: []
  non_blocking_warnings:
    - "Titleblock Page Count signal is unreliable for split cardinality."
    - "Five pages lack public page-number/count signals; ordinal ids must remain canonical."
    - "Human-readable labels/titles are incomplete/redacted and should not drive identity."

downstream_handoff:
  next_workflow_id: page_xml_normalize_spec_v0
  handoff_contract:
    deliver:
      - page XML assets for page_001..page_011
      - this manifest/provenance packet
      - any runner-generated per-page checksums or relative asset refs
    do_not_deliver:
      - raw host absolute paths
      - credentials, cookies, or secret-bearing context
      - rewritten or normalized XML in this split stage
  downstream_expectations:
    - consume stable ordinal page ids as canonical identity
    - use source order as authoritative ordering
    - preserve linkage between page asset, manifest metadata, and source provenance
    - carry forward manifest warning that titleblock page count 8 conflicts with actual page-node count 11

open_questions:
  - "Should the project-local runner emit per-page checksum fields after extracting the 11 page XML assets?"
  - "Should downstream normalization preserve public-redacted title presence as metadata, or ignore title signals entirely?"
  - "If duplicate human labels appear after private extraction, should ordinal_suffix_and_manifest_warning be recorded in a separate alias map?"
```