```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  fixture_type: public_safe_real_sample_derived_structural_metadata
  assigned_profile:
    model: gpt-5.5
    reasoning_effort: low
    species: dwarf
    class: archivist
  output_scope: public_safe_project_local_runner_packet
  raw_xml_body_included: false
  runtime_absolute_path_included: false

page_boundary_summary:
  root_element: Design
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  parser_mode: streaming_elementtree_boundary_probe
  schematic_count: 1
  page_boundary_node_family: Page
  authoritative_page_node_count: 11
  max_depth: 8
  total_element_count: 186608
  boundary_policy:
    treat_page_nodes_as_authoritative: true
    preserve_source_page_order: true
    single_page_fallback_allowed: false

page_split_plan:
  stable_id_policy: derive page_001..page_011 from source order
  split_count: 11
  preserve_page_xml_without_normalization: true
  preserve_page_local_payloads: true
  do_not_normalize:
    - XML structure
    - refdes
    - nets
    - connectivity
    - materials
    - PCB/MDD pairing
    - library identity
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    archive_page_payloads_in_public_canon: false

page_manifest:
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  real_sample_used: true
  real_sample_path_archived: false
  manifest_warnings:
    - titleblock Page Count reported 8 on 6 page nodes, but actual Page boundary nodes are 11
    - page number signals are missing or ambiguous for 5 page nodes
    - page number signals are non-contiguous; stable ids must come from source order
  aggregate_counts:
    Package: 107
    PartInst: 1067
    NetScalar: 1153
    WireScalar: 4378
    OffPageConnector: 538
    PartInstUserProp: 7644
    IsNoConnect: 3494

page_index:
  - id: page_001
    ordinal: 1
    elements: 29892
    parts: 211
    nets: 296
    wires: 856
    offpage_connectors: 156
    page_number_signals: ["1"]
    page_count_signals: ["8"]
  - id: page_002
    ordinal: 2
    elements: 29974
    parts: 211
    nets: 296
    wires: 851
    offpage_connectors: 155
    page_number_signals: ["2"]
    page_count_signals: ["8"]
  - id: page_003
    ordinal: 3
    elements: 57198
    parts: 464
    nets: 260
    wires: 1689
    offpage_connectors: 36
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
  - id: page_004
    ordinal: 4
    elements: 3210
    parts: 11
    nets: 58
    wires: 99
    offpage_connectors: 81
    page_number_signals: ["5"]
    page_count_signals: ["8"]
  - id: page_005
    ordinal: 5
    elements: 4190
    parts: 24
    nets: 51
    wires: 132
    offpage_connectors: 45
    page_number_signals: ["6"]
    page_count_signals: ["8"]
  - id: page_006
    ordinal: 6
    elements: 1434
    parts: 11
    nets: 10
    wires: 50
    offpage_connectors: 0
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
  - id: page_007
    ordinal: 7
    elements: 1536
    parts: 12
    nets: 10
    wires: 56
    offpage_connectors: 0
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
  - id: page_008
    ordinal: 8
    elements: 4404
    parts: 39
    nets: 19
    wires: 123
    offpage_connectors: 0
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]
  - id: page_009
    ordinal: 9
    elements: 7200
    parts: 58
    nets: 39
    wires: 220
    offpage_connectors: 23
    page_number_signals: ["7"]
    page_count_signals: ["8"]
  - id: page_010
    ordinal: 10
    elements: 5808
    parts: 10
    nets: 102
    wires: 237
    offpage_connectors: 42
    page_number_signals: ["8"]
    page_count_signals: ["8"]
  - id: page_011
    ordinal: 11
    elements: 2096
    parts: 16
    nets: 12
    wires: 65
    offpage_connectors: 0
    page_number_signals: ["missing_or_not_public"]
    page_count_signals: ["missing_or_not_public"]

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  provenance_level: compact_structural_metadata_only

page_role_hints:
  non_authoritative: true
  routing_only: true
  pages:
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
  ready_for_project_local_split: true
  authoritative_boundaries_available: true
  stable_ids_available: true
  blocking_issues: []
  warnings:
    - titleblock page count is not authoritative
    - page number labels are incomplete and non-contiguous
    - output page XML assets must remain project-local and outside .workflow/

downstream_handoff:
  next_workflow: page_xml_normalize_spec_v0
  handoff_payload:
    - project-local page XML assets preserving source order and raw page-local XML payloads
    - page manifest with stable ids, ordinals, structural counts, and warnings
    - source provenance with compact checksum/source binding context
    - non-authoritative page role hints
  public_safe_handoff_constraints:
    - do not include raw XML bodies in reusable/public artifacts
    - do not include host-specific runtime paths
    - do not place page XML assets under .workflow/

open_questions:
  - Should downstream normalization retain missing/non-public page number signals as-is or attach project-local private labels?
  - Should page-level checksums be generated by the project-local runner after actual split materialization?
  - Should titleblock Page Count conflicts be promoted to a reusable validation warning class?
```