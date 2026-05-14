profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  calibration_mode: public_safe_cli_structural_metadata_only
  assigned_profile: { model: gpt-5.4, reasoning_effort: high, species: elf, class: auditor }
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  source_sha256_prefix: 74195c6c62bdcf3f
  policy_assertions:
    - preserve_source_order_page_001_to_page_011
    - source_page_xml_assets_are_read_only_immutable_inputs
    - per_page_primary_output_is_page_module_spec_v0_yaml_sidecar
    - normalized_page_ref_and_normalized_sha256_remain_blank_without_explicit_review_variant
    - semantic_classification_and_interface_claims_are_review_required
    - outputs_are_project_local_only_and_never_under_workflow_package

normalization_input_summary:
  source_root_element: Design
  page_boundary_node_family: Page
  source_page_count: 11
  stable_page_id_policy: derive page_001..page_011 from source order; do not trust titleblock count/number as complete identity
  numbering_signals:
    titleblock_page_count_values: ["8"]
    titleblock_page_count_conflict: true
    present_page_numbers: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true
  page_groups:
    offpage_connector_signal_pages: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
    hardware_or_material_context_pages: [page_006, page_007, page_008, page_011]
    dense_repeated_block_candidate_pages: [page_003]

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_sidecar_count: 11
  per_page_sidecar_contract:
    required_blocks: [identity, module_definition, interfaces, performance, composition, evidence_review]
    required_interface_containers: [inputs, outputs, bidirectional, passive_or_none]
    optional_interface_containers: [local_internal_candidates]
  normalization_rules:
    - keep source_page_ref and source_sha256 as identity anchors
    - leave normalized_page_ref and normalized_sha256 blank
    - keep unsupported quantitative design values blank
    - record rationale as candidate/review_required, not confirmed truth
    - do not collect materials, attach MDD, compose harness, infer connectivity, or register final assets

page_module_spec_sidecars:
  - identity: { registration_key: page_module_spec.page_001, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: power_entry_or_control_sheet_candidate, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], review_required_rationale: "connector-like and regulator-control labels visible; not confirmed design truth" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [external_interface_review_required], local_internal_candidates: [SW, FB, PG] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 211, net_scalar_count: 296, off_page_connector_count: 156 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 211, material_property_signal_count: 0 }
    evidence_review: { visible_label_hint: redacted_power_entry_control_sheet_signal, source_label_signal: present_redacted, page_number_signals: ["1"], page_count_signals: ["8"], status: review_required }
  - identity: { registration_key: page_module_spec.page_002, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], review_required_rationale: "visible evidence weak or generic" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [external_interface_review_required], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 211, net_scalar_count: 296, off_page_connector_count: 155 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 211, material_property_signal_count: 0 }
    evidence_review: { visible_label_hint: redacted_schematic_page_signal, source_label_signal: present_redacted, page_number_signals: ["2"], page_count_signals: ["8"], status: review_required }
  - identity: { registration_key: page_module_spec.page_003, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: dense_repeated_channel_candidate, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], review_required_rationale: "dense repeated blocks visible; possible channelization requires review" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [external_interface_review_required], local_internal_candidates: [FB, SET, VIOC] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 464, net_scalar_count: 260, off_page_connector_count: 36 } }
    composition: { repeated_channel_candidate: true, pcb_footprint_signal_count: 464, material_property_signal_count: 0 }
    evidence_review: { visible_label_hint: redacted_dense_schematic_page_signal, source_label_signal: present_redacted, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], status: review_required }
  - identity: { registration_key: page_module_spec.page_004, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], review_required_rationale: "small sheet with high connector signal but weak public-safe semantics" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [external_interface_review_required], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 11, net_scalar_count: 58, off_page_connector_count: 81 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 11, material_property_signal_count: 0 }
    evidence_review: { visible_label_hint: redacted_schematic_page_signal, source_label_signal: present_redacted, page_number_signals: ["5"], page_count_signals: ["8"], status: review_required }
  - identity: { registration_key: page_module_spec.page_005, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], review_required_rationale: "visible evidence weak or generic" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [external_interface_review_required], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 24, net_scalar_count: 51, off_page_connector_count: 45 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 24, material_property_signal_count: 0 }
    evidence_review: { visible_label_hint: redacted_schematic_page_signal, source_label_signal: present_redacted, page_number_signals: ["6"], page_count_signals: ["8"], status: review_required }
  - identity: { registration_key: page_module_spec.page_006, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: hardware_or_material_context_candidate, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], review_required_rationale: "material-context structural hints present; material collection is out of scope here" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [no_external_interface_signal_public_safe], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 11, net_scalar_count: 10, off_page_connector_count: 0 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 11, material_property_signal_count: 3 }
    evidence_review: { visible_label_hint: redacted_hardware_material_context_signal, source_label_signal: missing_or_not_public, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], status: review_required }
  - identity: { registration_key: page_module_spec.page_007, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: hardware_or_material_context_candidate, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], review_required_rationale: "role hints indicate hardware/material context but visible evidence remains weak" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [no_external_interface_signal_public_safe], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 12, net_scalar_count: 10, off_page_connector_count: 0 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 12, material_property_signal_count: 3 }
    evidence_review: { visible_label_hint: redacted_schematic_page_signal, source_label_signal: missing_or_not_public, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], status: review_required }
  - identity: { registration_key: page_module_spec.page_008, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: material_heavy_pcb_context_candidate, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], review_required_rationale: "material-heavy and footprint-heavy structural signals present; not final library truth" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [no_external_interface_signal_public_safe], local_internal_candidates: [PG] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 39, net_scalar_count: 19, off_page_connector_count: 0 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 39, material_property_signal_count: 39 }
    evidence_review: { visible_label_hint: redacted_material_heavy_page_signal, source_label_signal: missing_or_not_public, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], status: review_required }
  - identity: { registration_key: page_module_spec.page_009, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: unknown, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], review_required_rationale: "visible evidence weak or generic" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [external_interface_review_required], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 58, net_scalar_count: 39, off_page_connector_count: 23 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 58, material_property_signal_count: 0 }
    evidence_review: { visible_label_hint: redacted_schematic_page_signal, source_label_signal: present_redacted, page_number_signals: ["7"], page_count_signals: ["8"], status: review_required }
  - identity: { registration_key: page_module_spec.page_010, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: connector_dense_net_candidate, role_hints: [schematic_content, offpage_connector_context, possible_pcb_context], review_required_rationale: "high net and connector signal with low part count; semantics remain review-only" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [external_interface_review_required], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 10, net_scalar_count: 102, off_page_connector_count: 42 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 10, material_property_signal_count: 0 }
    evidence_review: { visible_label_hint: redacted_schematic_page_signal, source_label_signal: present_redacted, page_number_signals: ["8"], page_count_signals: ["8"], status: review_required }
  - identity: { registration_key: page_module_spec.page_011, source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml, source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, normalized_page_ref: "", normalized_sha256: "" }
    module_definition: { schema_version: page_module_spec_v0, structural_scope: unknown, classification_candidate: hardware_or_material_context_candidate, role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], review_required_rationale: "role hints indicate hardware/material context but public-safe semantics are insufficient" }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [no_external_interface_signal_public_safe], local_internal_candidates: [] }
    performance: { timing: "", power: "", frequency: "", observed_structure_signals: { part_inst_count: 16, net_scalar_count: 12, off_page_connector_count: 0 } }
    composition: { repeated_channel_candidate: false, pcb_footprint_signal_count: 16, material_property_signal_count: 3 }
    evidence_review: { visible_label_hint: redacted_schematic_page_signal, source_label_signal: missing_or_not_public, page_number_signals: [missing_or_not_public], page_count_signals: [missing_or_not_public], status: review_required }

module_spec_manifest:
  schema_version: page_module_spec_manifest_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  page_order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  entries:
    - { source_page_id: page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, sidecar_registration_key: page_module_spec.page_001, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, sidecar_registration_key: page_module_spec.page_002, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, sidecar_registration_key: page_module_spec.page_003, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, sidecar_registration_key: page_module_spec.page_004, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, sidecar_registration_key: page_module_spec.page_005, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, sidecar_registration_key: page_module_spec.page_006, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, sidecar_registration_key: page_module_spec.page_007, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, sidecar_registration_key: page_module_spec.page_008, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, sidecar_registration_key: page_module_spec.page_009, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, sidecar_registration_key: page_module_spec.page_010, primary_sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, sidecar_registration_key: page_module_spec.page_011, primary_sidecar_file: page_module_spec_v0.yaml }

module_spec_index:
  review_status: review_required_for_all_pages
  classification_index:
    power_entry_or_control_sheet_candidate: [page_001]
    dense_repeated_channel_candidate: [page_003]
    hardware_or_material_context_candidate: [page_006, page_007, page_011]
    material_heavy_pcb_context_candidate: [page_008]
    connector_dense_net_candidate: [page_010]
    unknown: [page_002, page_004, page_005, page_009]
  interface_signal_index:
    offpage_connector_signal_present: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
    no_offpage_connector_signal_present: [page_006, page_007, page_008, page_011]

provenance_update:
  derivation_type: fixture_only_structural_metadata_calibration
  derived_from_upstream_split_manifest: true
  source_identity_anchor: project_binding.whole_xml_source.sample_exp_capture_big_xml
  immutable_input_policy_observed: true
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  generated_project_outputs_included: false
  annotation_variant_enabled: false
  downstream_packet_ready: true

normalization_warnings:
  - titleblock Page Count signal reports 8 while actual upstream split manifest contains 11 pages
  - page number signals are non-contiguous and missing on 5 pages; stable ordinal page ids must remain authoritative
  - source_label_signal is redacted or missing on multiple pages; semantic naming cannot be promoted from this packet
  - off-page connector counts indicate possible external interfaces, but no connectivity inference is permitted here
  - material-property signals appear on pages 006, 007, 008, and 011, but material collection is explicitly out of scope
  - normalized_page_ref and normalized_sha256 are blank for all pages because no explicit derived review XML variant is present
  - final library asset registration is not performed by this workflow

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_payload:
    required_inputs: [page_module_spec_sidecars, module_spec_manifest, downstream_handoff]
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    source_page_order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
    review_focus:
      - confirm tentative module classifications against real page content
      - resolve external interfaces from source page XML without mutating inputs
      - keep local_internal_candidates separate from external interfaces
      - decide whether any optional derived review XML variant is explicitly enabled by project policy

boundary_review:
  public_safe_input_only: pass
  source_xml_mutation: prohibited_and_not_assumed
  raw_xml_in_packet: absent
  runtime_absolute_paths_in_packet: absent
  credentials_or_secret_material: absent
  project_private_material: absent
  workflow_package_output_placement: prohibited
  project_local_only_output_contract: pass

open_questions:
  - What project-local registration namespace should wrap `page_module_spec.page_001` through `page_module_spec.page_011` at write time?
  - Should downstream intake preserve the tentative classifications verbatim or remap them into a stricter controlled vocabulary?
  - If a review-only annotation variant is later enabled, what relative artifact ref convention should carry `normalized_page_ref` without colliding with immutable source page refs?
  - Do pages 006, 007, 008, and 011 require a distinct downstream review lane for hardware/material context before any library intake step?