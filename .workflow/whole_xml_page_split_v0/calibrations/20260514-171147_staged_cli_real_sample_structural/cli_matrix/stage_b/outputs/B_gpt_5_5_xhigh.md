```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  model: gpt-5.5
  reasoning_effort: xhigh
  species: dwarf
  class: archivist
  fixture_type: public_safe_real_sample_derived_structural_metadata
  public_safe: true

page_boundary_summary:
  authoritative_boundary_family: Page
  authoritative_page_node_count: 11
  root_element: Design
  schematic_count: 1
  parser_mode: streaming_elementtree_boundary_probe
  warning:
    - titleblock Page Count reports 8 on 6 page nodes, but actual Page boundary candidates are 11
    - page number signals are missing or non-contiguous; they are not stable identity

page_split_plan:
  stable_id_policy: derive page_001..page_011 from source order
  preserve_source_page_order: true
  preserve_page_xml_without_normalization: true
  normalize_xml: false
  normalize_refdes_nets_connectivity_materials_pcb_or_library_identity: false
  single_page_fallback_allowed: false
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    public_canon_may_store: compact metadata, ids, checksums, warnings, refs
    public_canon_must_not_store: raw XML bodies, host-specific paths, page payloads

page_manifest:
  page_count: 11
  aggregate_source_size_bytes: 12670307
  aggregate_source_sha256_prefix: 74195c6c62bdcf3f
  pages:
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

page_index:
  ordered_ids:
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
  identity_basis: source_order
  manifest_warnings:
    - titleblock_count_8_conflicts_with_11_page_nodes
    - page_numbers_missing_or_non_contiguous

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  real_sample_used: true
  real_sample_path_archived: false

page_role_hints:
  non_authoritative: true
  schematic_with_offpage_context:
    - page_001
    - page_002
    - page_003
    - page_004
    - page_005
    - page_009
    - page_010
  schematic_with_hardware_or_material_context:
    - page_006
    - page_007
    - page_008
    - page_011
  possible_pcb_context: all_pages

split_readiness:
  status: ready_for_project_local_split
  blockers: []
  required_guards:
    - split exactly 11 Page nodes
    - preserve source order
    - emit page XML payloads only to project-local derived artifact storage
    - record manifest warning for conflicting titleblock count
    - do not infer missing page numbers

downstream_handoff:
  next_workflow: page_xml_normalize_spec_v0
  handoff_inputs:
    - project-local page XML assets for page_001 through page_011
    - this manifest
    - source provenance metadata
    - boundary and warning context
  handoff_constraints:
    - downstream may normalize only under its own contract
    - original split payloads remain preserved as extracted

open_questions:
  - Should downstream preserve titleblock Page Count as-is or add a derived correction note outside the XML?
  - Should missing/non-contiguous page-number signals be reconciled later from private source context, or remain ordinal-only?
```