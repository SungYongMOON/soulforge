```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  profile:
    model: gpt-5.5
    reasoning_effort: xhigh
    species: elf
    class: administrator
  fixture_type: public_safe_real_sample_derived_structural_metadata
  output_scope: project-local derived packet; public-safe structural metadata only

page_boundary_summary:
  root_element: Design
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  parser_mode: streaming_elementtree_boundary_probe
  schematic_count: 1
  authoritative_boundary_family: Page
  authoritative_page_node_count: 11
  max_depth: 8
  total_element_count: 186608
  warning: titleblock Page Count reported 8 on 6 page nodes, but actual Page node count is 11
  page_number_signal_warning: page numbers are missing/non-contiguous; observed public values are 1, 2, 5, 6, 7, 8

page_split_plan:
  stable_id_policy: derive page_001 through page_011 from source order
  boundary_policy: split only on authoritative Page nodes
  ordering_policy: preserve source Page order exactly
  payload_policy: preserve each page-local XML payload without normalization
  forbidden_transforms:
    - do not normalize XML
    - do not normalize refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity
    - do not use titleblock Page Count as split count
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    archive_page_payloads_in_public_canon: false
  fallback_policy:
    single_page_fallback_allowed: false

page_manifest:
  pages:
    - { id: page_001, ordinal: 1, elements: 29892, parts: 211, nets: 296, wires: 856, offpage: 156, title: present_redacted, page_number_signals: ["1"], page_count_signals: ["8"] }
    - { id: page_002, ordinal: 2, elements: 29974, parts: 211, nets: 296, wires: 851, offpage: 155, title: present_redacted, page_number_signals: ["2"], page_count_signals: ["8"] }
    - { id: page_003, ordinal: 3, elements: 57198, parts: 464, nets: 260, wires: 1689, offpage: 36, title: present_redacted, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
    - { id: page_004, ordinal: 4, elements: 3210, parts: 11, nets: 58, wires: 99, offpage: 81, title: present_redacted, page_number_signals: ["5"], page_count_signals: ["8"] }
    - { id: page_005, ordinal: 5, elements: 4190, parts: 24, nets: 51, wires: 132, offpage: 45, title: present_redacted, page_number_signals: ["6"], page_count_signals: ["8"] }
    - { id: page_006, ordinal: 6, elements: 1434, parts: 11, nets: 10, wires: 50, offpage: 0, title: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
    - { id: page_007, ordinal: 7, elements: 1536, parts: 12, nets: 10, wires: 56, offpage: 0, title: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
    - { id: page_008, ordinal: 8, elements: 4404, parts: 39, nets: 19, wires: 123, offpage: 0, title: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
    - { id: page_009, ordinal: 9, elements: 7200, parts: 58, nets: 39, wires: 220, offpage: 23, title: present_redacted, page_number_signals: ["7"], page_count_signals: ["8"] }
    - { id: page_010, ordinal: 10, elements: 5808, parts: 10, nets: 102, wires: 237, offpage: 42, title: present_redacted, page_number_signals: ["8"], page_count_signals: ["8"] }
    - { id: page_011, ordinal: 11, elements: 2096, parts: 16, nets: 12, wires: 65, offpage: 0, title: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
  manifest_warnings:
    - titleblock Page Count signal 8 conflicts with 11 Page nodes
    - page-number signals are incomplete and non-contiguous
    - several title/page count/page number values are unavailable in public-safe metadata

page_index:
  page_001: { source_ordinal: 1, role_hint_group: connector_rich_schematic }
  page_002: { source_ordinal: 2, role_hint_group: connector_rich_schematic }
  page_003: { source_ordinal: 3, role_hint_group: large_schematic_content }
  page_004: { source_ordinal: 4, role_hint_group: connector_context_schematic }
  page_005: { source_ordinal: 5, role_hint_group: connector_context_schematic }
  page_006: { source_ordinal: 6, role_hint_group: material_context_schematic }
  page_007: { source_ordinal: 7, role_hint_group: material_context_schematic }
  page_008: { source_ordinal: 8, role_hint_group: material_dense_schematic }
  page_009: { source_ordinal: 9, role_hint_group: connector_context_schematic }
  page_010: { source_ordinal: 10, role_hint_group: connector_context_schematic }
  page_011: { source_ordinal: 11, role_hint_group: material_context_schematic }

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  real_sample_used: true
  real_sample_path_archived: false
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  public_safe_note: source identity is represented by binding id, checksum prefix, size, and structural counts only

page_role_hints:
  non_authoritative: true
  common_hints:
    - schematic_content
    - possible_pcb_context
  offpage_connector_context_pages:
    - page_001
    - page_002
    - page_003
    - page_004
    - page_005
    - page_009
    - page_010
  hardware_or_material_context_pages:
    - page_006
    - page_007
    - page_008
    - page_011

split_readiness:
  status: ready_with_manifest_warnings
  required_page_count: 11
  boundary_confidence: high
  identity_confidence: source-order-derived
  blocking_issues: []
  warnings:
    - do not trust titleblock Page Count value of 8
    - page-number signals cannot be used as complete identity
    - output page XML assets must remain project-local

downstream_handoff:
  next_workflow: page_xml_normalize_spec_v0
  handoff_inputs:
    - page XML assets, project-local only
    - page manifest
    - page index
    - source provenance
    - manifest warnings
  handoff_constraints:
    - preserve source-order ids page_001 through page_011
    - carry warning that page labels are incomplete/non-contiguous
    - do not infer connectivity or normalize page payloads during split handoff

open_questions:
  - Should downstream normalization keep source-order ids as primary ids even if later page title metadata becomes available?
  - Should checksum material be generated per page asset by the project-local runner after actual split execution?
```