```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  profile:
    model: gpt-5.5
    reasoning_effort: high
    species: dwarf
    class: archivist
  execution_mode: public_safe_fixture_only
  artifact_scope: project_local_derived

page_boundary_summary:
  authoritative_boundary_family: Page
  authoritative_page_node_count: 11
  root_element: Design
  schematic_count: 1
  parser_mode: streaming_elementtree_boundary_probe
  source_size_bytes: 12670307
  source_sha256_prefix: 74195c6c62bdcf3f
  manifest_warnings:
    - titleblock Page Count reports 8, but authoritative Page node count is 11
    - page-number signals are missing or non-contiguous; do not use them as split identity
    - 5 page nodes have missing or non-public page-number signals

page_split_plan:
  stable_id_policy: derive page_001 through page_011 from source order
  split_count: 11
  preserve_source_page_order: true
  preserve_page_xml_without_normalization: true
  normalize_xml: false
  normalize_refdes_nets_connectivity_materials_pcb_mdd_or_library_identity: false
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
  single_page_fallback_allowed: false
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    archive_page_payloads_in_public_canon: false

page_manifest:
  - { id: page_001, ordinal: 1, elements: 29892, parts: 211, nets: 296, wires: 856, offpage: 156, page_numbers: ["1"], page_count_signals: ["8"], title: present_redacted }
  - { id: page_002, ordinal: 2, elements: 29974, parts: 211, nets: 296, wires: 851, offpage: 155, page_numbers: ["2"], page_count_signals: ["8"], title: present_redacted }
  - { id: page_003, ordinal: 3, elements: 57198, parts: 464, nets: 260, wires: 1689, offpage: 36, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"], title: present_redacted }
  - { id: page_004, ordinal: 4, elements: 3210, parts: 11, nets: 58, wires: 99, offpage: 81, page_numbers: ["5"], page_count_signals: ["8"], title: present_redacted }
  - { id: page_005, ordinal: 5, elements: 4190, parts: 24, nets: 51, wires: 132, offpage: 45, page_numbers: ["6"], page_count_signals: ["8"], title: present_redacted }
  - { id: page_006, ordinal: 6, elements: 1434, parts: 11, nets: 10, wires: 50, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"], title: missing_or_not_public }
  - { id: page_007, ordinal: 7, elements: 1536, parts: 12, nets: 10, wires: 56, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"], title: missing_or_not_public }
  - { id: page_008, ordinal: 8, elements: 4404, parts: 39, nets: 19, wires: 123, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"], title: missing_or_not_public }
  - { id: page_009, ordinal: 9, elements: 7200, parts: 58, nets: 39, wires: 220, offpage: 23, page_numbers: ["7"], page_count_signals: ["8"], title: present_redacted }
  - { id: page_010, ordinal: 10, elements: 5808, parts: 10, nets: 102, wires: 237, offpage: 42, page_numbers: ["8"], page_count_signals: ["8"], title: present_redacted }
  - { id: page_011, ordinal: 11, elements: 2096, parts: 16, nets: 12, wires: 65, offpage: 0, page_numbers: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"], title: missing_or_not_public }

page_index:
  page_001: { source_ordinal: 1, logical_asset_ref: project_local_page_xml_asset.page_001 }
  page_002: { source_ordinal: 2, logical_asset_ref: project_local_page_xml_asset.page_002 }
  page_003: { source_ordinal: 3, logical_asset_ref: project_local_page_xml_asset.page_003 }
  page_004: { source_ordinal: 4, logical_asset_ref: project_local_page_xml_asset.page_004 }
  page_005: { source_ordinal: 5, logical_asset_ref: project_local_page_xml_asset.page_005 }
  page_006: { source_ordinal: 6, logical_asset_ref: project_local_page_xml_asset.page_006 }
  page_007: { source_ordinal: 7, logical_asset_ref: project_local_page_xml_asset.page_007 }
  page_008: { source_ordinal: 8, logical_asset_ref: project_local_page_xml_asset.page_008 }
  page_009: { source_ordinal: 9, logical_asset_ref: project_local_page_xml_asset.page_009 }
  page_010: { source_ordinal: 10, logical_asset_ref: project_local_page_xml_asset.page_010 }
  page_011: { source_ordinal: 11, logical_asset_ref: project_local_page_xml_asset.page_011 }

source_provenance:
  fixture_type: public_safe_real_sample_derived_structural_metadata
  real_sample_used: true
  real_sample_path_archived: false
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  raw_xml_body_included: false
  runtime_absolute_path_included: false

page_role_hints:
  schematic_content: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  offpage_connector_context: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
  hardware_or_material_context: [page_006, page_007, page_008, page_011]
  possible_pcb_context: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  authority: non_authoritative_routing_hints_only

split_readiness:
  status: ready_for_project_local_split
  blocking_issues: []
  warnings:
    - titleblock count conflict must remain visible in manifest
    - page-number labels are incomplete and non-contiguous
    - per-page checksums are not present in fixture and should be computed by the project-local runner after asset emission

downstream_handoff:
  next_workflow: page_xml_normalize_spec_v0
  handoff_inputs:
    - project-local page XML assets, preserved without normalization
    - page manifest with stable ids and source ordinals
    - source provenance and structural warnings
  handoff_constraints:
    - no raw XML bodies in public or reusable calibration artifacts
    - no page XML assets under .workflow/
    - downstream normalization must treat split output as source-preserved page payloads

open_questions:
  - Are titleblock Page Count and Page Number fields expected to be repaired downstream or only reported?
  - Should project-local runner compute and store per-page sha256 values in the private manifest?
  - Should missing page-number labels receive derived display labels, or should only stable ids be used?
```