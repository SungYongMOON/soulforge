```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  calibration_mode: public_safe_cli
  model: gpt-5.5
  reasoning_effort: medium
  species: elf
  class: auditor
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0

normalization_input_summary:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  root_element: Design
  page_boundary_node_family: Page
  source_page_count: 11
  stable_page_id_policy: page_001..page_011 from source order
  raw_xml_body_included: false
  source_xml_read_only: true
  titleblock_warning: reported page count 8 conflicts with 11 observed Page nodes
  page_number_warning: present values are non-contiguous and incomplete

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  interface_containers_required:
    - inputs
    - outputs
    - bidirectional
    - passive_or_none
  local_internal_candidates_policy: separate_from_external_interface_containers
  normalized_page_ref_policy: blank unless explicit optional derived review XML variant exists
  normalized_sha256_policy: blank unless explicit optional derived review XML variant exists
  annotation_variant:
    enabled: false
    output_is_derived_review_only: true
  semantic_status: all classification, scope, channelization, local/internal labels, and function hints are review_required rationale, not confirmed design truth

page_module_spec_sidecars:
  - identity:
      registration_key: page_001
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_001
      source_page_order: 1
      source_page_ref: project_page_xml_asset.page_001
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_rationale: "redacted power entry/control sheet signal; connector-like and regulator-control labels visible; review required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [SW, FB, PG] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 29892, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 856, off_page_connector_count: 156, material_property_signal_count: 0, pcb_footprint_signal_count: 211 } }

  - identity:
      registration_key: page_002
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_002
      source_page_order: 2
      source_page_ref: project_page_xml_asset.page_002
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_rationale: "visible evidence weak or generic; keep unknown/review_required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 29974, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 851, off_page_connector_count: 155, material_property_signal_count: 0, pcb_footprint_signal_count: 211 } }

  - identity:
      registration_key: page_003
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_003
      source_page_order: 3
      source_page_ref: project_page_xml_asset.page_003
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_rationale: "dense repeated blocks visible; possible channelization review required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [FB, SET, VIOC] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 57198, part_inst_count: 464, net_scalar_count: 260, wire_scalar_count: 1689, off_page_connector_count: 36, material_property_signal_count: 0, pcb_footprint_signal_count: 464 } }

  - identity: { registration_key: page_004, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_rationale: "visible evidence weak or generic; keep unknown/review_required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 3210, part_inst_count: 11, net_scalar_count: 58, wire_scalar_count: 99, off_page_connector_count: 81, material_property_signal_count: 0, pcb_footprint_signal_count: 11 } }

  - identity: { registration_key: page_005, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_rationale: "visible evidence weak or generic; keep unknown/review_required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 4190, part_inst_count: 24, net_scalar_count: 51, wire_scalar_count: 132, off_page_connector_count: 45, material_property_signal_count: 0, pcb_footprint_signal_count: 24 } }

  - identity: { registration_key: page_006, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_rationale: "material-context structural hints present; do not collect materials here" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 1434, part_inst_count: 11, net_scalar_count: 10, wire_scalar_count: 50, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 11 } }

  - identity: { registration_key: page_007, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_rationale: "visible evidence weak or generic; keep unknown/review_required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 1536, part_inst_count: 12, net_scalar_count: 10, wire_scalar_count: 56, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 12 } }

  - identity: { registration_key: page_008, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_rationale: "hardware/material context and PCB footprint signals present; review required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [PG] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 4404, part_inst_count: 39, net_scalar_count: 19, wire_scalar_count: 123, off_page_connector_count: 0, material_property_signal_count: 39, pcb_footprint_signal_count: 39 } }

  - identity: { registration_key: page_009, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_rationale: "visible evidence weak or generic; keep unknown/review_required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 7200, part_inst_count: 58, net_scalar_count: 39, wire_scalar_count: 220, off_page_connector_count: 23, material_property_signal_count: 0, pcb_footprint_signal_count: 58 } }

  - identity: { registration_key: page_010, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_rationale: "visible evidence weak or generic; keep unknown/review_required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 5808, part_inst_count: 10, net_scalar_count: 102, wire_scalar_count: 237, off_page_connector_count: 42, material_property_signal_count: 0, pcb_footprint_signal_count: 10 } }

  - identity: { registration_key: page_011, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_rationale: "visible evidence weak or generic; keep unknown/review_required" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
    performance: { quantitative_values: {} }
    composition: { source_order_preserved: true, page_xml_mutated: false }
    evidence_review: { review_required: true, structural_counts: { element_count: 2096, part_inst_count: 16, net_scalar_count: 12, wire_scalar_count: 65, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 16 } }

module_spec_manifest:
  schema_version: page_module_spec_v0
  page_count: 11
  source_order_preserved: true
  entries:
    - { page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, sidecar: page_001/page_module_spec_v0.yaml }
    - { page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, sidecar: page_002/page_module_spec_v0.yaml }
    - { page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, sidecar: page_003/page_module_spec_v0.yaml }
    - { page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, sidecar: page_004/page_module_spec_v0.yaml }
    - { page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, sidecar: page_005/page_module_spec_v0.yaml }
    - { page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, sidecar: page_006/page_module_spec_v0.yaml }
    - { page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, sidecar: page_007/page_module_spec_v0.yaml }
    - { page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, sidecar: page_008/page_module_spec_v0.yaml }
    - { page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, sidecar: page_009/page_module_spec_v0.yaml }
    - { page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, sidecar: page_010/page_module_spec_v0.yaml }
    - { page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, sidecar: page_011/page_module_spec_v0.yaml }

module_spec_index:
  by_source_order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  pages_with_offpage_connector_context: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
  pages_with_hardware_or_material_context: [page_006, page_007, page_008, page_011]
  pages_with_local_internal_candidates: [page_001, page_003, page_008]
  pages_requiring_classification_review: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]

provenance_update:
  derived_from_upstream_split_manifest: true
  source_page_xml_assets_immutable: true
  source_sha256_bound: true
  optional_annotation_variants_created: false
  final_library_asset_registration_done: false
  public_safe_fixture_only: true

normalization_warnings:
  - Titleblock page count reports 8 while upstream split observed 11 Page nodes.
  - Page number signals are incomplete, missing on five pages, and non-contiguous.
  - Stable page ids must remain source-order ids page_001 through page_011.
  - Source page XML must not be rewritten, renamed, normalized, or saved over.
  - External interface classification is not confirmed from this structural fixture.
  - Material-related structural hints must not trigger material collection in this workflow.

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  compact_packet_contents:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    page_count: 11
    stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
    review_required: true
    source_xml_mutated: false
    final_registration_claimed: false

boundary_review:
  raw_xml_included: false
  runtime_absolute_paths_included: false
  credentials_or_secrets_included: false
  generated_project_output_payloads_included: false
  workflow_package_output_location_allowed: false
  project_local_derived_artifacts_only: true
  material_collection_performed: false
  mdd_attachment_performed: false
  harness_composition_performed: false
  connectivity_inference_performed: false

open_questions:
  - What project-local path convention should the runner use for the derived sidecar directory?
  - Will a later explicit project policy enable annotation variants, or should they remain disabled for this source?
  - What review authority confirms module classification, channelization, and external interface labels before library intake?
```