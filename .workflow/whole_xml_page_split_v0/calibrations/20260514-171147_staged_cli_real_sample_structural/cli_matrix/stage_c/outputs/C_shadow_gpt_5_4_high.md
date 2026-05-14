```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  execution_profile:
    model: gpt-5.4
    reasoning_effort: high
    species: dwarf
    class: archivist
  fixture_type: public_safe_real_sample_derived_structural_metadata
  public_safe: true
  real_sample_used: true
  raw_xml_body_included: false
  runtime_absolute_path_included: false

page_boundary_summary:
  root_element: Design
  schema_family_marker: "Cadence/OrCAD Capture Design EXP-like XML; host path redacted"
  parser_mode: streaming_elementtree_boundary_probe
  page_boundary_node_family: Page
  authoritative_page_node_count: 11
  schematic_count: 1
  stable_page_id_policy: "derive page_001..page_011 from source order"
  boundary_decision: "split on each Page node in source order"
  manifest_warnings:
    - "Titleblock Page Count reports 8 on observed nodes, but authoritative Page-node count is 11."
    - "Page-number signals are incomplete and non-contiguous; do not use them as primary identity."
    - "Five page nodes have missing or non-public page-number signals."

page_split_plan:
  output_scope: project_local_only
  workflow_package_storage: forbidden
  public_archive_of_page_payloads: forbidden
  extraction_unit: one_page_xml_asset_per_Page_node
  ordering_rule: preserve_source_page_order
  payload_rule: preserve_page-local_XML_without_normalization
  identity_rule: assign stable ids page_001 through page_011 by source ordinal
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
  single_page_fallback_allowed: false
  downstream_target: page_xml_normalize_spec_v0

page_manifest:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  total_element_count: 186608
  global_tag_counts:
    Package: 107
    PartInst: 1067
    NetScalar: 1153
    WireScalar: 4378
    OffPageConnector: 538
    PartInstUserProp: 7644
    IsNoConnect: 3494
  page_count_candidate: 11
  titleblock_page_count_signal:
    reported_count_values: ["8"]
    observed_on_page_nodes: 6
    conflicts_with_actual_page_nodes: true
  page_number_signal_summary:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true

page_index:
  - id: page_001
    source_ordinal: 1
    page_number_signals: ["1"]
    title_signal: present_redacted
    counts: {elements: 29892, parts: 211, nets: 296, wires: 856, offpage: 156}
  - id: page_002
    source_ordinal: 2
    page_number_signals: ["2"]
    title_signal: present_redacted
    counts: {elements: 29974, parts: 211, nets: 296, wires: 851, offpage: 155}
  - id: page_003
    source_ordinal: 3
    page_number_signals: ["missing_or_not_public"]
    title_signal: present_redacted
    counts: {elements: 57198, parts: 464, nets: 260, wires: 1689, offpage: 36}
  - id: page_004
    source_ordinal: 4
    page_number_signals: ["5"]
    title_signal: present_redacted
    counts: {elements: 3210, parts: 11, nets: 58, wires: 99, offpage: 81}
  - id: page_005
    source_ordinal: 5
    page_number_signals: ["6"]
    title_signal: present_redacted
    counts: {elements: 4190, parts: 24, nets: 51, wires: 132, offpage: 45}
  - id: page_006
    source_ordinal: 6
    page_number_signals: ["missing_or_not_public"]
    title_signal: missing_or_not_public
    counts: {elements: 1434, parts: 11, nets: 10, wires: 50, offpage: 0}
  - id: page_007
    source_ordinal: 7
    page_number_signals: ["missing_or_not_public"]
    title_signal: missing_or_not_public
    counts: {elements: 1536, parts: 12, nets: 10, wires: 56, offpage: 0}
  - id: page_008
    source_ordinal: 8
    page_number_signals: ["missing_or_not_public"]
    title_signal: missing_or_not_public
    counts: {elements: 4404, parts: 39, nets: 19, wires: 123, offpage: 0}
  - id: page_009
    source_ordinal: 9
    page_number_signals: ["7"]
    title_signal: present_redacted
    counts: {elements: 7200, parts: 58, nets: 39, wires: 220, offpage: 23}
  - id: page_010
    source_ordinal: 10
    page_number_signals: ["8"]
    title_signal: present_redacted
    counts: {elements: 5808, parts: 10, nets: 102, wires: 237, offpage: 42}
  - id: page_011
    source_ordinal: 11
    page_number_signals: ["missing_or_not_public"]
    title_signal: missing_or_not_public
    counts: {elements: 2096, parts: 16, nets: 12, wires: 65, offpage: 0}

source_provenance:
  provenance_class: public_safe_structural_derivative
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  real_sample_used: true
  archived_source_path_available_in_packet: false
  raw_xml_embedded: false
  host_specific_paths_embedded: false
  derivation_basis:
    - root element and schema-family marker
    - streaming Page-boundary probe metadata
    - source-order page sequence
    - structural per-page counts and signals
  integrity_reference:
    source_sha256_prefix: 74195c6c62bdcf3f

page_role_hints:
  authority: non_authoritative_routing_hints_only
  by_page:
    page_001: [schematic_content, offpage_connector_context, possible_pcb_context]
    page_002: [schematic_content, offpage_connector_context, possible_pcb_context]
    page_003: [schematic_content, offpage_connector_context, possible_pcb_context]
    page_004: [schematic_content, offpage_connector_context, possible_pcb_context]
    page_005: [schematic_content, offpage_connector_context, possible_pcb_context]
    page_006: [schematic_content, hardware_or_material_context, possible_pcb_context]
    page_007: [schematic_content, hardware_or_material_context, possible_pcb_context]
    page_008: [schematic_content, hardware_or_material_context, possible_pcb_context]
    page_009: [schematic_content, offpage_connector_context, possible_pcb_context]
    page_010: [schematic_content, offpage_connector_context, possible_pcb_context]
    page_011: [schematic_content, hardware_or_material_context, possible_pcb_context]

split_readiness:
  status: ready_with_warnings
  ready_for_split: true
  blocking_issues: []
  warnings:
    - "Manifest must record titleblock Page Count mismatch: reported 8 vs actual 11 Page nodes."
    - "Manifest must record incomplete/non-contiguous page-number signals."
    - "Per-page asset checksums are not present in this fixture and should be computed at extraction time if needed."
  preservation_requirements:
    - preserve source order
    - preserve page-local XML payloads exactly as extracted
    - do not normalize XML or alter refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity

downstream_handoff:
  next_workflow: page_xml_normalize_spec_v0
  required_inputs:
    - page XML assets for page_001 through page_011
    - page manifest with stable ids, source ordinals, warnings, and signal summaries
    - source provenance context with source_sha256_prefix and binding identity
  handoff_notes:
    - "Use stable page ids as the primary page identity."
    - "Do not infer missing pages from titleblock count."
    - "Do not reorder pages based on page-number signals."

open_questions:
  - "Should extraction stage emit per-page checksums in the project-local manifest, or defer checksum generation to normalize/spec stage?"
  - "Should missing/non-public title signals be represented as null, redacted, or omitted in the project-local page manifest schema?"
  - "If downstream sees duplicate human-readable labels after extraction, should ordinal suffixes be applied only in manifest labels while keeping raw page XML untouched?"
```