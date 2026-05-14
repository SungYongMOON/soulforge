```yaml
profile_metadata:
  workflow_id: whole_xml_page_split_v0
  calibration_id: 20260514-171147_staged_cli_real_sample_structural
  profile:
    model: gpt-5.5
    reasoning_effort: medium
    species: dwarf
    class: archivist
  fixture_type: public_safe_real_sample_derived_structural_metadata
  execution_mode: public_safe_cli_calibration_no_file_io
  raw_xml_body_included: false
  runtime_absolute_path_included: false

page_boundary_summary:
  authoritative_boundary_family: Page
  authoritative_page_node_count: 11
  root_element: Design
  schematic_count: 1
  parser_mode: streaming_elementtree_boundary_probe
  total_element_count: 186608
  max_depth: 8
  warnings:
    - titleblock Page Count reported 8 on 6 page nodes, but authoritative Page node count is 11
    - page-number signals are missing or ambiguous on 5 page nodes
    - page-number signals are non-contiguous and must not be used as stable page identity

page_split_plan:
  stable_id_policy: derive page_001 through page_011 from source order
  split_count: 11
  preserve_source_page_order: true
  preserve_page_xml_without_normalization: true
  preserve_page_local_payloads: true
  forbidden_normalization:
    - XML bodies
    - refdes
    - nets
    - connectivity
    - materials
    - PCB/MDD pairing
    - library identity
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
  single_page_fallback_allowed: false
  output_location_policy:
    project_local_only: true
    never_under_workflow_package: true
    archive_page_payloads_in_public_canon: false

page_manifest:
  manifest_warnings:
    - titleblock_page_count_signal_conflicts_with_actual_page_nodes
    - page_number_signal_missing_or_non_contiguous
  pages:
    - { stable_id: page_001, source_ordinal: 1, element_count: 29892, page_number_signals: ["1"], page_count_signals: ["8"], title_signal: present_redacted }
    - { stable_id: page_002, source_ordinal: 2, element_count: 29974, page_number_signals: ["2"], page_count_signals: ["8"], title_signal: present_redacted }
    - { stable_id: page_003, source_ordinal: 3, element_count: 57198, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], title_signal: present_redacted }
    - { stable_id: page_004, source_ordinal: 4, element_count: 3210, page_number_signals: ["5"], page_count_signals: ["8"], title_signal: present_redacted }
    - { stable_id: page_005, source_ordinal: 5, element_count: 4190, page_number_signals: ["6"], page_count_signals: ["8"], title_signal: present_redacted }
    - { stable_id: page_006, source_ordinal: 6, element_count: 1434, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], title_signal: missing_or_not_public }
    - { stable_id: page_007, source_ordinal: 7, element_count: 1536, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], title_signal: missing_or_not_public }
    - { stable_id: page_008, source_ordinal: 8, element_count: 4404, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], title_signal: missing_or_not_public }
    - { stable_id: page_009, source_ordinal: 9, element_count: 7200, page_number_signals: ["7"], page_count_signals: ["8"], title_signal: present_redacted }
    - { stable_id: page_010, source_ordinal: 10, element_count: 5808, page_number_signals: ["8"], page_count_signals: ["8"], title_signal: present_redacted }
    - { stable_id: page_011, source_ordinal: 11, element_count: 2096, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], title_signal: missing_or_not_public }

page_index:
  aggregate_counts:
    Package: 107
    PartInst: 1067
    NetScalar: 1153
    WireScalar: 4378
    OffPageConnector: 538
    PartInstUserProp: 7644
    IsNoConnect: 3494
  per_page_counts:
    - { stable_id: page_001, parts: 211, nets: 296, wires: 856, offpage: 156, ports: 621, no_connect: 621, part_user_props: 1460, pcb_footprints: 211, material_props: 0 }
    - { stable_id: page_002, parts: 211, nets: 296, wires: 851, offpage: 155, ports: 621, no_connect: 621, part_user_props: 1460, pcb_footprints: 211, material_props: 0 }
    - { stable_id: page_003, parts: 464, nets: 260, wires: 1689, offpage: 36, ports: 1120, no_connect: 1120, part_user_props: 3360, pcb_footprints: 464, material_props: 0 }
    - { stable_id: page_004, parts: 11, nets: 58, wires: 99, offpage: 81, ports: 11, no_connect: 11, part_user_props: 33, pcb_footprints: 11, material_props: 0 }
    - { stable_id: page_005, parts: 24, nets: 51, wires: 132, offpage: 45, ports: 64, no_connect: 64, part_user_props: 132, pcb_footprints: 24, material_props: 0 }
    - { stable_id: page_006, parts: 11, nets: 10, wires: 50, offpage: 0, ports: 33, no_connect: 33, part_user_props: 63, pcb_footprints: 11, material_props: 3 }
    - { stable_id: page_007, parts: 12, nets: 10, wires: 56, offpage: 0, ports: 35, no_connect: 35, part_user_props: 69, pcb_footprints: 12, material_props: 3 }
    - { stable_id: page_008, parts: 39, nets: 19, wires: 123, offpage: 0, ports: 96, no_connect: 96, part_user_props: 540, pcb_footprints: 39, material_props: 39 }
    - { stable_id: page_009, parts: 58, nets: 39, wires: 220, offpage: 23, ports: 138, no_connect: 138, part_user_props: 358, pcb_footprints: 58, material_props: 0 }
    - { stable_id: page_010, parts: 10, nets: 102, wires: 237, offpage: 42, ports: 154, no_connect: 154, part_user_props: 52, pcb_footprints: 10, material_props: 0 }
    - { stable_id: page_011, parts: 16, nets: 12, wires: 65, offpage: 0, ports: 43, no_connect: 43, part_user_props: 117, pcb_footprints: 16, material_props: 3 }

source_provenance:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_size_bytes: 12670307
  schema_family_marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted
  real_sample_used: true
  real_sample_path_archived: false
  public_safe_limitations:
    - source path redacted
    - raw XML body omitted
    - page payloads omitted
    - no credentials or host-specific paths included

page_role_hints:
  authority: non_authoritative_routing_hints_only
  hints:
    - { stable_id: page_001, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context] }
    - { stable_id: page_002, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context] }
    - { stable_id: page_003, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context] }
    - { stable_id: page_004, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context] }
    - { stable_id: page_005, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context] }
    - { stable_id: page_006, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context] }
    - { stable_id: page_007, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context] }
    - { stable_id: page_008, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context] }
    - { stable_id: page_009, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context] }
    - { stable_id: page_010, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context] }
    - { stable_id: page_011, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context] }

split_readiness:
  ready_for_project_local_split: true
  readiness_basis:
    - authoritative Page boundary candidates are present
    - expected stable page ids can be derived from source order
    - split policy forbids semantic normalization during page extraction
    - manifest warnings capture unreliable titleblock and page-number signals
  blockers: []
  constraints:
    - page XML assets must remain project-local
    - public artifacts must contain only compact metadata, ids, checksums, warnings, and references

downstream_handoff:
  next_workflow: page_xml_normalize_spec_v0
  handoff_assets:
    - project-local page XML assets for page_001 through page_011
    - page manifest
    - page index
    - source provenance
    - manifest warnings
  handoff_requirements:
    - preserve page ids from this split packet
    - use manifest warnings when interpreting page labels
    - do not infer schematic truth from role hints alone
    - do not place raw page XML under .workflow/

open_questions:
  - Should downstream normalization emit per-page payload checksums after project-local page assets are written?
  - Should the titleblock Page Count conflict be promoted to a reusable workflow warning code?
  - Should missing/non-contiguous page-number signals trigger a stricter downstream review gate?
```