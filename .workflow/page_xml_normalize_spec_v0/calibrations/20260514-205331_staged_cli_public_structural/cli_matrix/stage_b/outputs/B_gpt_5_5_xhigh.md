```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  model: gpt-5.5
  reasoning_effort: xhigh
  species: elf
  class: auditor
  calibration_mode: public_safe_structural_metadata_only

normalization_input_summary:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  stable_page_id_policy: page_001_through_page_011_from_source_order
  source_xml_policy: read_only_immutable
  raw_xml_body_included: false

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  source_page_xml_mutation_allowed: false
  annotation_variants_enabled: false
  normalized_page_ref_policy: blank_unless_explicit_optional_review_variant_exists
  semantic_status: review_required_rationale_only
  required_sidecar_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  required_interface_containers:
    - inputs
    - outputs
    - bidirectional
    - passive_or_none
  local_internal_candidates_policy: separate_from_external_interfaces

page_module_spec_sidecars:
  - identity: {source_page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_basis: "connector-like and regulator-control labels visible; review required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [SW, FB, PG]}
    performance: {quantitative_values: {}}
    composition: {element_count: 29892, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 856, off_page_connector_count: 156, material_property_signal_count: 0, pcb_footprint_signal_count: 211}
    evidence_review: {status: review_required, visible_label_hint: "redacted power entry/control sheet signal"}
  - identity: {source_page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_basis: "visible evidence weak or generic; keep unknown/review_required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 29974, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 851, off_page_connector_count: 155, material_property_signal_count: 0, pcb_footprint_signal_count: 211}
    evidence_review: {status: review_required, visible_label_hint: "redacted schematic page signal"}
  - identity: {source_page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_basis: "dense repeated blocks visible; possible channelization review required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [FB, SET, VIOC]}
    performance: {quantitative_values: {}}
    composition: {element_count: 57198, part_inst_count: 464, net_scalar_count: 260, wire_scalar_count: 1689, off_page_connector_count: 36, material_property_signal_count: 0, pcb_footprint_signal_count: 464}
    evidence_review: {status: review_required, visible_label_hint: "redacted dense schematic page signal"}
  - identity: {source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_basis: "visible evidence weak or generic; keep unknown/review_required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 3210, part_inst_count: 11, net_scalar_count: 58, wire_scalar_count: 99, off_page_connector_count: 81, material_property_signal_count: 0, pcb_footprint_signal_count: 11}
    evidence_review: {status: review_required, visible_label_hint: "redacted schematic page signal"}
  - identity: {source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_basis: "visible evidence weak or generic; keep unknown/review_required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 4190, part_inst_count: 24, net_scalar_count: 51, wire_scalar_count: 132, off_page_connector_count: 45, material_property_signal_count: 0, pcb_footprint_signal_count: 24}
    evidence_review: {status: review_required, visible_label_hint: "redacted schematic page signal"}
  - identity: {source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_basis: "material-context structural hints present; do not collect materials here"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 1434, part_inst_count: 11, net_scalar_count: 10, wire_scalar_count: 50, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 11}
    evidence_review: {status: review_required, visible_label_hint: "redacted hardware/material context signal"}
  - identity: {source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_basis: "visible evidence weak or generic; keep unknown/review_required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 1536, part_inst_count: 12, net_scalar_count: 10, wire_scalar_count: 56, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 12}
    evidence_review: {status: review_required, visible_label_hint: "redacted schematic page signal"}
  - identity: {source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_basis: "hardware/material context and PCB footprint signals present; review required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [PG]}
    performance: {quantitative_values: {}}
    composition: {element_count: 4404, part_inst_count: 39, net_scalar_count: 19, wire_scalar_count: 123, off_page_connector_count: 0, material_property_signal_count: 39, pcb_footprint_signal_count: 39}
    evidence_review: {status: review_required, visible_label_hint: "redacted material-heavy page signal"}
  - identity: {source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_basis: "visible evidence weak or generic; keep unknown/review_required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 7200, part_inst_count: 58, net_scalar_count: 39, wire_scalar_count: 220, off_page_connector_count: 23, material_property_signal_count: 0, pcb_footprint_signal_count: 58}
    evidence_review: {status: review_required, visible_label_hint: "redacted schematic page signal"}
  - identity: {source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_basis: "visible evidence weak or generic; keep unknown/review_required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 5808, part_inst_count: 10, net_scalar_count: 102, wire_scalar_count: 237, off_page_connector_count: 42, material_property_signal_count: 0, pcb_footprint_signal_count: 10}
    evidence_review: {status: review_required, visible_label_hint: "redacted schematic page signal"}
  - identity: {source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_basis: "visible evidence weak or generic; keep unknown/review_required"}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {quantitative_values: {}}
    composition: {element_count: 2096, part_inst_count: 16, net_scalar_count: 12, wire_scalar_count: 65, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 16}
    evidence_review: {status: review_required, visible_label_hint: "redacted schematic page signal"}

module_spec_manifest:
  schema_version: page_module_spec_manifest_v0
  page_count: 11
  entries:
    - {source_page_id: page_001, source_page_order: 1, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90}
    - {source_page_id: page_002, source_page_order: 2, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee}
    - {source_page_id: page_003, source_page_order: 3, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc}
    - {source_page_id: page_004, source_page_order: 4, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538}
    - {source_page_id: page_005, source_page_order: 5, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9}
    - {source_page_id: page_006, source_page_order: 6, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405}
    - {source_page_id: page_007, source_page_order: 7, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870}
    - {source_page_id: page_008, source_page_order: 8, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b}
    - {source_page_id: page_009, source_page_order: 9, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227}
    - {source_page_id: page_010, source_page_order: 10, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665}
    - {source_page_id: page_011, source_page_order: 11, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3}

module_spec_index:
  source_order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  review_required_pages: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  material_context_signal_pages: [page_006, page_007, page_008, page_011]
  offpage_connector_context_pages: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]

provenance_update:
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  upstream_manifest_policy_observed: true
  derived_artifact_scope: project_local_only
  final_library_asset_registration: false

normalization_warnings:
  - titleblock_page_count_reports_8_but_actual_page_nodes_are_11
  - page_number_signals_are_missing_or_non_contiguous
  - stable_page_ids_must_follow_source_order_not_titleblock_identity
  - classification_and_channelization_are_review_required_not_design_truth
  - material_property_signals_are_not_material_collection_permission
  - no_normalized_xml_variant_exists_so_normalized_refs_remain_blank

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  provide:
    - page_module_spec_sidecars
    - module_spec_manifest
    - downstream_handoff
  exclude:
    - raw_xml_body
    - runtime_absolute_paths
    - credentials
    - mdd_files
    - harness_payloads
    - final_library_registration_claims
  readiness: structural_review_input_only

boundary_review:
  public_safe: true
  raw_xml_included: false
  source_xml_mutated: false
  source_xml_rewritten: false
  workflow_package_output: false
  project_private_material_included: false
  credentials_or_cookies_included: false
  generated_outputs_under_workflow: false

open_questions:
  - Whether project policy later enables optional derived review XML annotation variants.
  - Whether reviewers confirm any module classification, channelization, or external interface semantics.
  - Whether downstream intake requires additional project-local registration metadata beyond this structural packet.
```