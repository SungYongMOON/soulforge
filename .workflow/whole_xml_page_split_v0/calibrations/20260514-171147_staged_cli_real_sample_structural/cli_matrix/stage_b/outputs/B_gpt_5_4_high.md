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
  authoritative_boundary_node_family: Page
  authoritative_page_count: 11
  stable_id_policy: page_001..page_011 from source order
  preserve_source_page_order: true
  preserve_page_xml_without_normalization: true
  titleblock_page_count_warning:
    reported_page_count_values: ["8"]
    conflicts_with_authoritative_page_nodes: true
    note: "Manifest must treat titleblock Page Count as non-authoritative."
  page_number_signal_warning:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true
    note: "Page-number signals are incomplete and must not drive identity."

page_split_plan:
  split_unit: one output XML asset per Page node
  extraction_order: source_ordinal_ascending
  output_identity:
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
  invariants:
    - preserve page-local XML payload exactly as extracted
    - do not normalize XML, refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity
    - record duplicate/missing label conditions as manifest warnings only
    - do not use single-page fallback
    - keep page XML assets project-local only and never under .workflow/

page_manifest:
  source_root_element: Design
  schema_family_marker: "Cadence/OrCAD Capture Design EXP-like XML; host path redacted"
  parser_mode: streaming_elementtree_boundary_probe
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  schematic_count: 1
  global_tag_counts:
    Package: 107
    PartInst: 1067
    NetScalar: 1153
    WireScalar: 4378
    OffPageConnector: 538
    PartInstUserProp: 7644
    IsNoConnect: 3494
  warnings:
    - "Titleblock Page Count reports 8 but authoritative Page node count is 11."
    - "Page-number signals are missing/non-contiguous; stable ids are ordinal only."
    - "Five page nodes have missing or non-public page-number/count signals."
    - "This packet is metadata-only; raw XML bodies are intentionally excluded."

page_index:
  - stable_id: page_001
    source_ordinal: 1
    signal_page_number: ["1"]
    signal_page_count: ["8"]
    asset_ref: "page_xml_asset::page_001"
  - stable_id: page_002
    source_ordinal: 2
    signal_page_number: ["2"]
    signal_page_count: ["8"]
    asset_ref: "page_xml_asset::page_002"
  - stable_id: page_003
    source_ordinal: 3
    signal_page_number: ["missing_or_not_public"]
    signal_page_count: ["missing_or_not_public"]
    asset_ref: "page_xml_asset::page_003"
  - stable_id: page_004
    source_ordinal: 4
    signal_page_number: ["5"]
    signal_page_count: ["8"]
    asset_ref: "page_xml_asset::page_004"
  - stable_id: page_005
    source_ordinal: 5
    signal_page_number: ["6"]
    signal_page_count: ["8"]
    asset_ref: "page_xml_asset::page_005"
  - stable_id: page_006
    source_ordinal: 6
    signal_page_number: ["missing_or_not_public"]
    signal_page_count: ["missing_or_not_public"]
    asset_ref: "page_xml_asset::page_006"
  - stable_id: page_007
    source_ordinal: 7
    signal_page_number: ["missing_or_not_public"]
    signal_page_count: ["missing_or_not_public"]
    asset_ref: "page_xml_asset::page_007"
  - stable_id: page_008
    source_ordinal: 8
    signal_page_number: ["missing_or_not_public"]
    signal_page_count: ["missing_or_not_public"]
    asset_ref: "page_xml_asset::page_008"
  - stable_id: page_009
    source_ordinal: 9
    signal_page_number: ["7"]
    signal_page_count: ["8"]
    asset_ref: "page_xml_asset::page_009"
  - stable_id: page_010
    source_ordinal: 10
    signal_page_number: ["8"]
    signal_page_count: ["8"]
    asset_ref: "page_xml_asset::page_010"
  - stable_id: page_011
    source_ordinal: 11
    signal_page_number: ["missing_or_not_public"]
    signal_page_count: ["missing_or_not_public"]
    asset_ref: "page_xml_asset::page_011"

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  provenance_class: real-sample-derived structural metadata
  source_real_path_archived: false
  public_safe_constraints:
    - no raw XML bodies
    - no runtime absolute paths
    - no credentials or host-specific material
  derivation_basis:
    root_element: Design
    page_boundary_node_family: Page
    total_element_count: 186608
    max_depth: 8

page_role_hints:
  non_authoritative: true
  hints:
    - stable_id: page_001
      role_hint: "schematic page with strong off-page routing and PCB footprint presence"
    - stable_id: page_002
      role_hint: "schematic page with strong off-page routing and PCB footprint presence"
    - stable_id: page_003
      role_hint: "dense schematic hub page; highest component/property volume"
    - stable_id: page_004
      role_hint: "small schematic/interconnect page with high off-page connector density"
    - stable_id: page_005
      role_hint: "small-to-mid schematic/interconnect page"
    - stable_id: page_006
      role_hint: "hardware/material-context page with low net density"
    - stable_id: page_007
      role_hint: "hardware/material-context page with low net density"
    - stable_id: page_008
      role_hint: "hardware/material-context page with elevated material-property density"
    - stable_id: page_009
      role_hint: "mid-size schematic/interconnect page"
    - stable_id: page_010
      role_hint: "routing-heavy page with sparse part count"
    - stable_id: page_011
      role_hint: "small hardware/material-context page"

split_readiness:
  status: ready_with_manifest_warnings
  ready_for_page_asset_extraction: true
  blockers: []
  warnings:
    - "Do not derive split cardinality from titleblock Page Count."
    - "Do not derive stable identity from page-number signals."
    - "Per-page checksums should be generated only from extracted page XML assets in project-local execution."

downstream_handoff:
  next_workflow_id: page_xml_normalize_spec_v0
  handoff_inputs:
    - project-local page XML assets for page_001..page_011
    - this manifest/index/provenance packet
  handoff_constraints:
    - preserve stable ids and source order
    - carry forward manifest warnings
    - normalization must not rewrite source split identity or infer missing page numbers as canonical truth

open_questions:
  - "Should downstream manifest include per-page SHA-256 after extraction, in addition to the source SHA-256 prefix?"
  - "Should missing/non-public title signals be represented as nulls or explicit redacted markers in project-local manifests?"
  - "Do material-property-heavy pages (page_006, page_007, page_008, page_011) require a distinct normalization branch or only role tagging?"
```