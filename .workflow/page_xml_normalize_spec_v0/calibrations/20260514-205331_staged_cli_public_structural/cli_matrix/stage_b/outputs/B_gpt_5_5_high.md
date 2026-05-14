```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  model: gpt-5.5
  reasoning_effort: high
  species: elf
  class: auditor
  calibration_mode: public_safe_structural_metadata_only
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json

normalization_input_summary:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  stable_page_id_policy: preserve upstream source order as page_001 through page_011
  source_page_xml_policy: read_only_immutable_inputs
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  generated_project_outputs_included: false

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  sidecar_count: 11
  sidecar_required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  interface_containers_required_on_every_sidecar:
    - inputs
    - outputs
    - bidirectional
    - passive_or_none
  local_internal_candidates_policy: separate_from_external_interface_containers
  normalized_page_ref_policy: blank_unless_optional_derived_review_variant_exists
  annotation_variant_policy: disabled_by_default_review_only_when_enabled
  semantic_claim_policy: classification_scope_channelization_and_function_hints_are_review_required_rationale_not_confirmed_truth

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_page_ref: project_page_xml_asset.page_001
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity:
      registration_key: page_001
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      normalized_page_ref: ""
      normalized_sha256: ""
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [SW, FB, PG]
    evidence_review:
      role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts: {element_count: 29892, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 856, off_page_connector_count: 156, material_property_signal_count: 0, pcb_footprint_signal_count: 211}
      classification_basis: connector-like and regulator-control labels visible; review required

  - source_page_id: page_002
    source_page_order: 2
    source_page_ref: project_page_xml_asset.page_002
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_002, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts: {element_count: 29974, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 851, off_page_connector_count: 155, material_property_signal_count: 0, pcb_footprint_signal_count: 211}
      classification_basis: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_003
    source_page_order: 3
    source_page_ref: project_page_xml_asset.page_003
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_003, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [FB, SET, VIOC]}
    evidence_review:
      role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts: {element_count: 57198, part_inst_count: 464, net_scalar_count: 260, wire_scalar_count: 1689, off_page_connector_count: 36, material_property_signal_count: 0, pcb_footprint_signal_count: 464}
      classification_basis: dense repeated blocks visible; possible channelization review required

  - source_page_id: page_004
    source_page_order: 4
    source_page_ref: project_page_xml_asset.page_004
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_004, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts: {element_count: 3210, part_inst_count: 11, net_scalar_count: 58, wire_scalar_count: 99, off_page_connector_count: 81, material_property_signal_count: 0, pcb_footprint_signal_count: 11}
      classification_basis: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_005
    source_page_order: 5
    source_page_ref: project_page_xml_asset.page_005
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_005, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts: {element_count: 4190, part_inst_count: 24, net_scalar_count: 51, wire_scalar_count: 132, off_page_connector_count: 45, material_property_signal_count: 0, pcb_footprint_signal_count: 24}
      classification_basis: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_006
    source_page_order: 6
    source_page_ref: project_page_xml_asset.page_006
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_006, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts: {element_count: 1434, part_inst_count: 11, net_scalar_count: 10, wire_scalar_count: 50, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 11}
      classification_basis: material-context structural hints present; do not collect materials here

  - source_page_id: page_007
    source_page_order: 7
    source_page_ref: project_page_xml_asset.page_007
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_007, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts: {element_count: 1536, part_inst_count: 12, net_scalar_count: 10, wire_scalar_count: 56, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 12}
      classification_basis: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_008
    source_page_order: 8
    source_page_ref: project_page_xml_asset.page_008
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_008, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [PG]}
    evidence_review:
      role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts: {element_count: 4404, part_inst_count: 39, net_scalar_count: 19, wire_scalar_count: 123, off_page_connector_count: 0, material_property_signal_count: 39, pcb_footprint_signal_count: 39}
      classification_basis: hardware/material context and PCB footprint signals present; review required

  - source_page_id: page_009
    source_page_order: 9
    source_page_ref: project_page_xml_asset.page_009
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_009, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts: {element_count: 7200, part_inst_count: 58, net_scalar_count: 39, wire_scalar_count: 220, off_page_connector_count: 23, material_property_signal_count: 0, pcb_footprint_signal_count: 58}
      classification_basis: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_010
    source_page_order: 10
    source_page_ref: project_page_xml_asset.page_010
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_010, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts: {element_count: 5808, part_inst_count: 10, net_scalar_count: 102, wire_scalar_count: 237, off_page_connector_count: 42, material_property_signal_count: 0, pcb_footprint_signal_count: 10}
      classification_basis: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_011
    source_page_order: 11
    source_page_ref: project_page_xml_asset.page_011
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    sidecar_file: page_module_spec_v0.yaml
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    identity: {registration_key: page_011, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, normalized_page_ref: "", normalized_sha256: ""}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    evidence_review:
      role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts: {element_count: 2096, part_inst_count: 16, net_scalar_count: 12, wire_scalar_count: 65, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 16}
      classification_basis: visible evidence weak or generic; keep unknown/review_required

module_spec_manifest:
  schema_version: page_module_spec_manifest_v0
  page_count: 11
  source_order_preserved: true
  entries:
    - {source_page_id: page_001, source_page_order: 1, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_002, source_page_order: 2, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_003, source_page_order: 3, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_004, source_page_order: 4, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_005, source_page_order: 5, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_006, source_page_order: 6, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_007, source_page_order: 7, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_008, source_page_order: 8, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_009, source_page_order: 9, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_010, source_page_order: 10, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_011, source_page_order: 11, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, sidecar_file: page_module_spec_v0.yaml}

module_spec_index:
  by_source_page_id:
    page_001: {order: 1, checksum_bound: true}
    page_002: {order: 2, checksum_bound: true}
    page_003: {order: 3, checksum_bound: true}
    page_004: {order: 4, checksum_bound: true}
    page_005: {order: 5, checksum_bound: true}
    page_006: {order: 6, checksum_bound: true}
    page_007: {order: 7, checksum_bound: true}
    page_008: {order: 8, checksum_bound: true}
    page_009: {order: 9, checksum_bound: true}
    page_010: {order: 10, checksum_bound: true}
    page_011: {order: 11, checksum_bound: true}

provenance_update:
  upstream_split_manifest_preserved: true
  source_page_xml_mutated: false
  normalized_review_variants_created: false
  annotation_variants_created: false
  final_library_asset_registration_claimed: false
  provenance_basis: public_safe_fixture_metadata_only

normalization_warnings:
  - titleblock_page_count_reports_8_but_actual_page_nodes_are_11
  - page_number_signals_are_missing_or_non_contiguous_for_multiple_pages
  - source_label_signals_are_redacted_or_missing_for_some_pages
  - classification_and_function_hints_require_human_review
  - material_context_signals_present_on_some_pages_but_material_collection_is_out_of_scope
  - external_connectivity_and_channelization_are_not_inferred

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  handoff_scope: project_local_derived_artifacts_only
  downstream_must_not_assume:
    - confirmed_module_classification
    - confirmed_interfaces
    - inferred_connectivity
    - collected_material_records
    - final_asset_registration
  downstream_review_focus:
    - validate page identity and checksum bindings
    - review local_internal_candidates separately from interfaces
    - decide whether optional review-only annotation variants are authorized
    - perform any library intake registration in downstream workflow only

boundary_review:
  public_safe: true
  raw_xml_included: false
  runtime_absolute_paths_included: false
  credentials_or_cookies_included: false
  project_private_material_included: false
  generated_payloads_under_workflow_package: false
  source_xml_rewrite_or_rename: false
  mdd_attachment: false
  harness_composition: false
  material_collection: false

open_questions:
  - Should a project policy authorize review-only annotation variants for any page?
  - What reviewer-owned taxonomy should classify schematic, material-context, and dense repeated-block pages?
  - Which downstream authority confirms external interfaces versus local/internal labels?
  - How should the 8-page titleblock signal be recorded against the 11 observed source Page nodes?
```