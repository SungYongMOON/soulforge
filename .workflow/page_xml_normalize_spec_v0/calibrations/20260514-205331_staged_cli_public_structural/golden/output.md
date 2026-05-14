```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  calibration_mode: public_safe_cli
  model: gpt-5.5
  reasoning_effort: xhigh
  species: dwarf
  class: archivist
  output_status: structural_packet_only_no_files_written

normalization_input_summary:
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  credentials_or_secret_material_included: false
  generated_project_outputs_included: false
  stable_page_id_policy: preserve upstream source order as page_001 through page_011
  titleblock_signal_review:
    reported_page_count_values: ["8"]
    observed_on_page_nodes: 6
    conflicts_with_actual_page_nodes: true
    page_number_values_present: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  source_page_xml_policy:
    read_only_immutable_inputs: true
    mutation_allowed: false
    rewrite_allowed: false
    rename_allowed: false
  sidecar_policy:
    one_sidecar_per_source_page: true
    referenced_by_stable_page_id: true
    referenced_by_source_sha256: true
    generated_under_workflow_package: false
    project_local_derived_artifacts_only: true
  required_blocks:
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
  local_internal_candidates_policy: separate_from_external_interface_containers
  normalized_variant_policy:
    annotation_variants_enabled: false
    normalized_page_ref: blank_unless_explicit_optional_review_variant_exists
    normalized_sha256: blank_unless_explicit_optional_review_variant_exists
  review_policy:
    classification_review_required: true
    module_scope_review_required: true
    channelization_review_required: true
    function_hints_review_required: true
    unsupported_quantitative_values_stay_blank: true
    final_asset_registration_done_here: false

page_module_spec_sidecars:
  - identity: {registration_key: page_001, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_status: review_required, classification_basis: connector-like and regulator-control labels visible; review required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [SW, FB, PG]}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted power entry/control sheet signal, structural_counts: {element_count: 29892, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 856, off_page_connector_count: 156, material_property_signal_count: 0, pcb_footprint_signal_count: 211}}
  - identity: {registration_key: page_002, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_status: review_required, classification_basis: visible evidence weak or generic; keep unknown/review_required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted schematic page signal, structural_counts: {element_count: 29974, part_inst_count: 211, net_scalar_count: 296, wire_scalar_count: 851, off_page_connector_count: 155, material_property_signal_count: 0, pcb_footprint_signal_count: 211}}
  - identity: {registration_key: page_003, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_status: review_required, classification_basis: dense repeated blocks visible; possible channelization review required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [FB, SET, VIOC]}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted dense schematic page signal, structural_counts: {element_count: 57198, part_inst_count: 464, net_scalar_count: 260, wire_scalar_count: 1689, off_page_connector_count: 36, material_property_signal_count: 0, pcb_footprint_signal_count: 464}}
  - identity: {registration_key: page_004, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_status: review_required, classification_basis: visible evidence weak or generic; keep unknown/review_required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted schematic page signal, structural_counts: {element_count: 3210, part_inst_count: 11, net_scalar_count: 58, wire_scalar_count: 99, off_page_connector_count: 81, material_property_signal_count: 0, pcb_footprint_signal_count: 11}}
  - identity: {registration_key: page_005, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_status: review_required, classification_basis: visible evidence weak or generic; keep unknown/review_required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted schematic page signal, structural_counts: {element_count: 4190, part_inst_count: 24, net_scalar_count: 51, wire_scalar_count: 132, off_page_connector_count: 45, material_property_signal_count: 0, pcb_footprint_signal_count: 24}}
  - identity: {registration_key: page_006, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_status: review_required, classification_basis: material-context structural hints present; do not collect materials here}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted hardware/material context signal, structural_counts: {element_count: 1434, part_inst_count: 11, net_scalar_count: 10, wire_scalar_count: 50, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 11}}
  - identity: {registration_key: page_007, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_status: review_required, classification_basis: visible evidence weak or generic; keep unknown/review_required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted schematic page signal, structural_counts: {element_count: 1536, part_inst_count: 12, net_scalar_count: 10, wire_scalar_count: 56, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 12}}
  - identity: {registration_key: page_008, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_status: review_required, classification_basis: hardware/material context and PCB footprint signals present; review required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [PG]}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted material-heavy page signal, structural_counts: {element_count: 4404, part_inst_count: 39, net_scalar_count: 19, wire_scalar_count: 123, off_page_connector_count: 0, material_property_signal_count: 39, pcb_footprint_signal_count: 39}}
  - identity: {registration_key: page_009, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_status: review_required, classification_basis: visible evidence weak or generic; keep unknown/review_required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted schematic page signal, structural_counts: {element_count: 7200, part_inst_count: 58, net_scalar_count: 39, wire_scalar_count: 220, off_page_connector_count: 23, material_property_signal_count: 0, pcb_footprint_signal_count: 58}}
  - identity: {registration_key: page_010, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], classification_status: review_required, classification_basis: visible evidence weak or generic; keep unknown/review_required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted schematic page signal, structural_counts: {element_count: 5808, part_inst_count: 10, net_scalar_count: 102, wire_scalar_count: 237, off_page_connector_count: 42, material_property_signal_count: 0, pcb_footprint_signal_count: 10}}
  - identity: {registration_key: page_011, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, normalized_page_ref: "", normalized_sha256: ""}
    module_definition: {structural_scope: unknown, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], classification_status: review_required, classification_basis: visible evidence weak or generic; keep unknown/review_required}
    interfaces: {inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: []}
    performance: {unsupported_quantitative_values: ""}
    composition: {channelization_status: review_required}
    evidence_review: {visible_label_hint: redacted schematic page signal, structural_counts: {element_count: 2096, part_inst_count: 16, net_scalar_count: 12, wire_scalar_count: 65, off_page_connector_count: 0, material_property_signal_count: 3, pcb_footprint_signal_count: 16}}

module_spec_manifest:
  schema_version: page_module_spec_manifest_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  page_count: 11
  entries:
    - {source_page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, sidecar_ref: project_local_derived.page_module_spec.page_001}
    - {source_page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, sidecar_ref: project_local_derived.page_module_spec.page_002}
    - {source_page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, sidecar_ref: project_local_derived.page_module_spec.page_003}
    - {source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, sidecar_ref: project_local_derived.page_module_spec.page_004}
    - {source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, sidecar_ref: project_local_derived.page_module_spec.page_005}
    - {source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, sidecar_ref: project_local_derived.page_module_spec.page_006}
    - {source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, sidecar_ref: project_local_derived.page_module_spec.page_007}
    - {source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, sidecar_ref: project_local_derived.page_module_spec.page_008}
    - {source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, sidecar_ref: project_local_derived.page_module_spec.page_009}
    - {source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, sidecar_ref: project_local_derived.page_module_spec.page_010}
    - {source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, sidecar_ref: project_local_derived.page_module_spec.page_011}

module_spec_index:
  by_source_order:
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
  by_role_hint:
    schematic_content: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
    offpage_connector_context: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
    hardware_or_material_context: [page_006, page_007, page_008, page_011]
    possible_pcb_context: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  review_priority_notes:
    high_density_or_channelization_review: [page_003]
    material_context_review: [page_006, page_008, page_011]
    titleblock_identity_mismatch_review: [page_001, page_002, page_004, page_005, page_009, page_010]

provenance_update:
  derived_from_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  source_xml_body_used: false
  source_xml_mutated: false
  normalized_xml_variant_created: false
  source_page_ids_preserved: true
  source_order_preserved: true
  checksums_preserved_as_input_identity: true
  final_library_asset_registration: false

normalization_warnings:
  - titleblock page count reports 8 while upstream split observed 11 Page nodes.
  - Page number signals are missing or non-contiguous for 5 source pages; stable page ids must remain ordinal page_001 through page_011.
  - Visible labels and role hints are public-safe redacted evidence only; classifications remain review_required.
  - Off-page connector counts are structural signals only and do not confirm external connectivity.
  - Material property and PCB footprint signals are not material collection, MDD attachment, or final asset registration.
  - normalized_page_ref and normalized_sha256 remain blank because annotation variants are disabled.

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  compact_packet:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    source_sha256_prefix: 74195c6c62bdcf3f
    page_count: 11
    stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
    sidecar_schema_version: page_module_spec_v0
    classification_status: review_required
    final_registration_status: not_done_here
  downstream_constraints:
    - Treat sidecars as project-local derived artifacts.
    - Do not infer confirmed connectivity from this packet.
    - Do not treat local_internal_candidates as external interfaces.
    - Require review before library intake registration.

boundary_review:
  public_safe: true
  raw_xml_included: false
  runtime_absolute_paths_included: false
  credentials_or_cookies_included: false
  project_private_material_included: false
  generated_project_output_payloads_included: false
  source_xml_rewrite_claimed: false
  file_creation_claimed: false
  workflow_package_output_claimed: false
  material_collection_claimed: false
  mdd_attachment_claimed: false
  harness_composition_claimed: false
  connectivity_inference_claimed: false

open_questions:
  - What project-local storage convention should the runner use for the derived sidecar refs outside `.workflow/`?
  - Which reviewer should approve classification, module scope, and any channelization labels before downstream intake?
  - Should an explicit project policy ever enable annotation variants, and if so what checksum and provenance rules should bind them?
```