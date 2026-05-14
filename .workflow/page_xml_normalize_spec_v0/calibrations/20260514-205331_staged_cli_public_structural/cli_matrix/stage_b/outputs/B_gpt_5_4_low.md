```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  calibration_mode: public_safe_cli_structural_metadata_only
  assigned_profile:
    model: gpt-5.4
    reasoning_effort: low
    species: elf
    class: auditor
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  generated_project_outputs_included: false
  execution_note: output packet derived from provided fixture only; no file inspection or mutation performed

normalization_input_summary:
  source_root_element: Design
  page_boundary_node_family: Page
  source_page_count: 11
  stable_page_id_policy: derive page_001..page_011 from source order
  source_page_assets_immutable: true
  source_order_preserved: true
  source_label_signal_mode:
    present_redacted_pages: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
    missing_or_not_public_pages: [page_006, page_007, page_008, page_011]
  titleblock_signal_summary:
    reported_page_count_values: ["8"]
    observed_on_page_nodes: 6
    conflicts_with_actual_page_nodes: true
  page_number_signal_summary:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true

page_module_spec_plan:
  primary_output_rule: one page_module_spec_v0.yaml sidecar per source page
  sidecar_count_expected: 11
  sidecar_identity_policy:
    stable_page_ids_required: true
    checksum_binding_required: true
    source_page_ref_required: true
  sidecar_required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  interfaces_policy:
    required_containers: [inputs, outputs, bidirectional, passive_or_none]
    optional_containers: [local_internal_candidates]
    external_interface_inference_not_confirmed: true
  normalized_variant_policy:
    normalized_page_ref: ""
    normalized_sha256: ""
    annotation_variant_enabled: false
  semantic_policy:
    structural_scope_default: unknown
    classification_and_scope_are_review_required: true
    channelization_is_review_required: true
    function_hints_are_review_required: true
    final_asset_registration_done_here: false

page_module_spec_sidecars:
  - source_page_id: page_001
    source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_001#1a3da91ab0a283e2
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_001
        source_page_order: 1
        source_page_ref: project_page_xml_asset.page_001
        source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: redacted power/control style signal with off-page density; not design truth
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [SW, FB, PG]
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
        structural_counts:
          element_count: 29892
          part_inst_count: 211
          net_scalar_count: 296
          wire_scalar_count: 856
          off_page_connector_count: 156
          material_property_signal_count: 0
          pcb_footprint_signal_count: 211
  - source_page_id: page_002
    source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_002#4a18c884f36bedab
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_002
        source_page_order: 2
        source_page_ref: project_page_xml_asset.page_002
        source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: generic schematic signal only
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
        structural_counts:
          element_count: 29974
          part_inst_count: 211
          net_scalar_count: 296
          wire_scalar_count: 851
          off_page_connector_count: 155
          material_property_signal_count: 0
          pcb_footprint_signal_count: 211
  - source_page_id: page_003
    source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_003#f355dc8f26a38429
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_003
        source_page_order: 3
        source_page_ref: project_page_xml_asset.page_003
        source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: dense repeated-block appearance possible; not confirmed
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [FB, SET, VIOC]
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: possible
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
        structural_counts:
          element_count: 57198
          part_inst_count: 464
          net_scalar_count: 260
          wire_scalar_count: 1689
          off_page_connector_count: 36
          material_property_signal_count: 0
          pcb_footprint_signal_count: 464
  - source_page_id: page_004
    source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_004#2760adf758d9d3c3
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_004
        source_page_order: 4
        source_page_ref: project_page_xml_asset.page_004
        source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: small schematic page with high off-page ratio; no confirmed semantics
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
        structural_counts:
          element_count: 3210
          part_inst_count: 11
          net_scalar_count: 58
          wire_scalar_count: 99
          off_page_connector_count: 81
          material_property_signal_count: 0
          pcb_footprint_signal_count: 11
  - source_page_id: page_005
    source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_005#c3d237934d816560
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_005
        source_page_order: 5
        source_page_ref: project_page_xml_asset.page_005
        source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: compact schematic page; generic evidence only
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
        structural_counts:
          element_count: 4190
          part_inst_count: 24
          net_scalar_count: 51
          wire_scalar_count: 132
          off_page_connector_count: 45
          material_property_signal_count: 0
          pcb_footprint_signal_count: 24
  - source_page_id: page_006
    source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_006#311a9d421ed1e7bd
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_006
        source_page_order: 6
        source_page_ref: project_page_xml_asset.page_006
        source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: hardware/material context signals present; material collection prohibited here
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
        structural_counts:
          element_count: 1434
          part_inst_count: 11
          net_scalar_count: 10
          wire_scalar_count: 50
          off_page_connector_count: 0
          material_property_signal_count: 3
          pcb_footprint_signal_count: 11
  - source_page_id: page_007
    source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_007#19728e0aff41acc3
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_007
        source_page_order: 7
        source_page_ref: project_page_xml_asset.page_007
        source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: generic/weak visible evidence only
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
        structural_counts:
          element_count: 1536
          part_inst_count: 12
          net_scalar_count: 10
          wire_scalar_count: 56
          off_page_connector_count: 0
          material_property_signal_count: 3
          pcb_footprint_signal_count: 12
  - source_page_id: page_008
    source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_008#34e41c5eb8d9a278
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_008
        source_page_order: 8
        source_page_ref: project_page_xml_asset.page_008
        source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: material-heavy and footprint-heavy signals present; not a collection step
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [PG]
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
        structural_counts:
          element_count: 4404
          part_inst_count: 39
          net_scalar_count: 19
          wire_scalar_count: 123
          off_page_connector_count: 0
          material_property_signal_count: 39
          pcb_footprint_signal_count: 39
  - source_page_id: page_009
    source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_009#e6a6a20dd485f62c
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_009
        source_page_order: 9
        source_page_ref: project_page_xml_asset.page_009
        source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: generic schematic signal only
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
        structural_counts:
          element_count: 7200
          part_inst_count: 58
          net_scalar_count: 39
          wire_scalar_count: 220
          off_page_connector_count: 23
          material_property_signal_count: 0
          pcb_footprint_signal_count: 58
  - source_page_id: page_010
    source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_010#1d4a28f3140bf1b2
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_010
        source_page_order: 10
        source_page_ref: project_page_xml_asset.page_010
        source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: generic schematic signal only
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
        structural_counts:
          element_count: 5808
          part_inst_count: 10
          net_scalar_count: 102
          wire_scalar_count: 237
          off_page_connector_count: 42
          material_property_signal_count: 0
          pcb_footprint_signal_count: 10
  - source_page_id: page_011
    source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
    sidecar_file: page_module_spec_v0.yaml
    sidecar_blocks:
      identity:
        registration_key: project_page_xml_asset.page_011#fb360e4fe37cb704
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_011
        source_page_order: 11
        source_page_ref: project_page_xml_asset.page_011
        source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
      module_definition:
        structural_scope: unknown
        classification_hint: review_required
        rationale_hint: generic/weak visible evidence only
        normalized_page_ref: ""
        normalized_sha256: ""
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_supported: limited
        unsupported_quantitative_values_blank: true
      composition:
        repeated_block_signal: false
        channelization_hint: review_required
      evidence_review:
        role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
        structural_counts:
          element_count: 2096
          part_inst_count: 16
          net_scalar_count: 12
          wire_scalar_count: 65
          off_page_connector_count: 0
          material_property_signal_count: 3
          pcb_footprint_signal_count: 16

module_spec_manifest:
  schema_version: page_module_spec_manifest_v0
  workflow_id: page_xml_normalize_spec_v0
  page_count: 11
  page_order_preserved: true
  entries:
    - {source_page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665", sidecar_file: page_module_spec_v0.yaml}
    - {source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3", sidecar_file: page_module_spec_v0.yaml}

module_spec_index:
  by_page_id:
    page_001: {order: 1, checksum: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90", classification_hint: review_required}
    page_002: {order: 2, checksum: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee", classification_hint: review_required}
    page_003: {order: 3, checksum: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc", classification_hint: review_required}
    page_004: {order: 4, checksum: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538", classification_hint: review_required}
    page_005: {order: 5, checksum: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9", classification_hint: review_required}
    page_006: {order: 6, checksum: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405", classification_hint: review_required}
    page_007: {order: 7, checksum: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870", classification_hint: review_required}
    page_008: {order: 8, checksum: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b", classification_hint: review_required}
    page_009: {order: 9, checksum: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227", classification_hint: review_required}
    page_010: {order: 10, checksum: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665", classification_hint: review_required}
    page_011: {order: 11, checksum: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3", classification_hint: review_required}
  summary_flags:
    offpage_heavy_pages: [page_001, page_002, page_004, page_005, page_010]
    possible_dense_repeated_block_page: [page_003]
    hardware_or_material_context_pages: [page_006, page_007, page_008, page_011]
    confirmed_semantic_assignments: []

provenance_update:
  upstream_source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  inherited_from_upstream:
    stable_page_ids: true
    source_page_checksums: true
    source_order: true
  created_artifact_types:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
    - downstream_handoff
  provenance_constraints:
    raw_xml_embedded: false
    source_xml_mutated: false
    normalized_review_variant_created: false
    project_local_only: true
    never_under_workflow_package: true

normalization_warnings:
  - titleblock page count signal reports "8" but actual split manifest contains 11 pages
  - page number signals are non-contiguous and missing on 5 pages; stable ordinal ids must remain canonical
  - source labels are redacted or absent; semantic module naming remains unresolved
  - interface directionality cannot be confirmed from structural metadata alone
  - pages with material-property signals require review but no material collection is allowed in this workflow
  - page_003 shows dense repeated-block evidence, but channelization remains a review hypothesis only
  - normalized_page_ref and normalized_sha256 must remain blank because no explicit derived review XML variant is present

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_packet_contents:
    - page_module_spec_sidecars
    - module_spec_manifest
    - downstream_handoff
  receiver_expectations:
    preserve_source_page_ids_and_checksums: true
    treat_module_specs_as_review_scaffolds_not_final_truth: true
    do_not_assume_external_connectivity_from_local_internal_candidates: true
    do_not_require_annotation_variant: true
    do_not_register_final_library_assets_from_this_packet_alone: true

boundary_review:
  public_safe: true
  included_material:
    structural metadata only
  excluded_material:
    - raw XML bodies
    - runtime absolute paths
    - generated project payloads
    - credentials
    - cookies
    - project-private content
  action_boundaries_respected:
    no_commands_run: true
    no_browsing: true
    no_file_inspection: true
    no_file_creation: true
    no_xml_mutation_claimed: true

open_questions:
  - Should downstream review assign human-readable module names per page, or keep page-id keyed identity only until later intake?
  - Are pages page_006, page_007, page_008, and page_011 intended for non-schematic support metadata handling downstream, or should they stay in the same intake lane with unknown scope?
  - If a project policy later enables annotation variants, what checksum/linkage convention should pair derived review XML with these immutable source-page sidecars?
```