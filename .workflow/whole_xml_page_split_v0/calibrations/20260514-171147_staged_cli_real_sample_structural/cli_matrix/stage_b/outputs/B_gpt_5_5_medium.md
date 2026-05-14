```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  fixture_type: public_safe_real_sample_derived_structural_metadata
  assigned_profile:
    model: gpt-5.5
    reasoning_effort: medium
    species: dwarf
    class: archivist
  output_scope: project_local_derived_packet
  raw_xml_body_included: false
  runtime_absolute_path_included: false

page_boundary_summary:
  root_element: Design
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  parser_mode: streaming_elementtree_boundary_probe
  page_boundary_node_family: Page
  authoritative_page_node_count: 11
  schematic_count: 1
  max_depth: 8
  total_element_count: 186608
  warning:
    - titleblock Page Count reports 8 on 6 page nodes, but actual Page boundary nodes are 11
    - page number signals are missing or non-contiguous; they are not stable identity

page_split_plan:
  stable_id_policy: derive page_001 through page_011 from source order
  preserve_source_page_order: true
  preserve_page_xml_without_normalization: true
  single_page_fallback_allowed: false
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
  prohibited_changes:
    - do not normalize XML
    - do not normalize refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity
    - do not place page XML assets under .workflow/

page_manifest:
  page_count: 11
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  global_tag_counts:
    Package: 107
    PartInst: 1067
    NetScalar: 1153
    WireScalar: 4378
    OffPageConnector: 538
    PartInstUserProp: 7644
    IsNoConnect: 3494
  manifest_warnings:
    - titleblock_page_count_signal=8 conflicts with 11 Page nodes
    - page_number_values_present=[1,2,5,6,7,8]; 5 page nodes missing or ambiguous

page_index:
  - { id: page_001, ordinal: 1, elements: 29892, parts: 211, nets: 296, wires: 856, offpage: 156, page_numbers: ["1"], page_count_signals: ["8"] }
  - { id: page_002, ordinal: 2, elements: 29974, parts: 211, nets: 296, wires: 851, offpage: 155, page_numbers: ["2"], page_count_signals: ["8"] }
  - { id: page_003, ordinal: 3, elements: 57198, parts: 464, nets: 260, wires: 1689, offpage: 36, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
  - { id: page_004, ordinal: 4, elements: 3210, parts: 11, nets: 58, wires: 99, offpage: 81, page_numbers: ["5"], page_count_signals: ["8"] }
  - { id: page_005, ordinal: 5, elements: 4190, parts: 24, nets: 51, wires: 132, offpage: 45, page_numbers: ["6"], page_count_signals: ["8"] }
  - { id: page_006, ordinal: 6, elements: 1434, parts: 11, nets: 10, wires: 50, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
  - { id: page_007, ordinal: 7, elements: 1536, parts: 12, nets: 10, wires: 56, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
  - { id: page_008, ordinal: 8, elements: 4404, parts: 39, nets: 19, wires: 123, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }
  - { id: page_009, ordinal: 9, elements: 7200, parts: 58, nets: 39, wires: 220, offpage: 23, page_numbers: ["7"], page_count_signals: ["8"] }
  - { id: page_010, ordinal: 10, elements: 5808, parts: 10, nets: 102, wires: 237, offpage: 42, page_numbers: ["8"], page_count_signals: ["8"] }
  - { id: page_011, ordinal: 11, elements: 2096, parts: 16, nets: 12, wires: 65, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"] }

source_provenance:
  real_sample_used: true
  real_sample_path_archived: false
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  raw_xml_body_included: false
  host_specific_path_included: false
  public_safe_metadata_only: true

page_role_hints:
  non_authoritative: true
  routing_basis: compact structural counts and redacted role hint signals only
  hints:
    schematic_offpage_pcb_context: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
    schematic_hardware_material_pcb_context: [page_006, page_007, page_008, page_011]

split_readiness:
  ready_for_project_local_split: true
  readiness_basis:
    - 11 authoritative Page boundary candidates are present
    - stable ordinal ids can be assigned without relying on titleblock page count or page number labels
    - split policy requires payload preservation without normalization
  blockers: []
  warnings:
    - titleblock count conflict must remain visible in manifest
    - missing/non-contiguous page numbers require ordinal identity

downstream_handoff:
  next_workflow: page_xml_normalize_spec_v0
  handoff_payload:
    - project-local page XML assets, preserved exactly per Page boundary
    - page manifest with stable ids, ordinals, counts, warnings, and provenance
    - source provenance context with redacted binding identity and checksum prefix
  placement_policy:
    page_xml_assets: project_local_only
    workflow_package: metadata/spec only; no raw page XML bodies

open_questions:
  - Should downstream normalization retain the original titleblock Page Count signal as-is or add a derived correction annotation outside the XML payload?
  - What project-local retention policy should apply to the split page XML assets after downstream normalization succeeds?
```