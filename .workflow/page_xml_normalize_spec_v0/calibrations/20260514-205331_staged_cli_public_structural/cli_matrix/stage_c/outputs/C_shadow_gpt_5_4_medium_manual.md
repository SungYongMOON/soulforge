profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  calibration_mode: public_safe_cli_structural_metadata_only
  assigned_profile:
    model: gpt-5.4
    reasoning_effort: medium
    species: elf
    class: auditor
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  schema_version: page_module_spec_v0
  output_policy:
    project_local_only: true
    never_under_workflow_package: true
    source_xml_read_only: true
    source_xml_mutation_allowed: false
    raw_xml_included: false
    annotation_variants_enabled: false

normalization_input_summary:
  source_root_element: Design
  source_page_family: Page
  total_pages: 11
  stable_page_id_policy: derive page_001..page_011 from source order; do not trust titleblock Page Count/Number as complete identity
  split_policy:
    preserve_source_page_order: true
    preserve_page_xml_without_normalization: true
    single_page_fallback_allowed: false
  signal_warnings:
    titleblock_page_count_conflict: true
    page_number_signal_non_contiguous: true
    missing_or_ambiguous_page_nodes: 5
  immutable_inputs:
    - source_page_xml assets are treated as read-only
    - source page refs and source sha256 values are carried forward unchanged
    - normalized_page_ref and normalized_sha256 remain blank unless an explicit derived review variant exists

page_module_spec_plan:
  primary_output: one page_module_spec_v0.yaml sidecar per source page
  page_order:
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
  per_sidecar_requirements:
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
    optional_interface_containers:
      - local_internal_candidates
  review_posture:
    structural_scope_default: unknown
    semantic_claims_require_review: true
    classification_basis_records_rationale_not_truth: true
    local_internal_candidates_not_external_interfaces: true
    final_asset_registration_done_here: false

page_module_spec_sidecars:
  - source_page_id: page_001
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_001.1a3da91ab0a283e2
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_001
        source_page_order: 1
        source_page_ref: project_page_xml_asset.page_001
        source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
        classification_rationale: connector-like and regulator-control labels visible; review required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - SW
          - FB
          - PG
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted power entry/control sheet signal
        structural_counts:
          element_count: 29892
          part_inst_count: 211
          net_scalar_count: 296
          wire_scalar_count: 856
          off_page_connector_count: 156
          material_property_signal_count: 0
          pcb_footprint_signal_count: 211
  - source_page_id: page_002
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_002.4a18c884f36bedab
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_002
        source_page_order: 2
        source_page_ref: project_page_xml_asset.page_002
        source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
        classification_rationale: visible evidence weak or generic; keep unknown/review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted schematic page signal
        structural_counts:
          element_count: 29974
          part_inst_count: 211
          net_scalar_count: 296
          wire_scalar_count: 851
          off_page_connector_count: 155
          material_property_signal_count: 0
          pcb_footprint_signal_count: 211
  - source_page_id: page_003
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_003.f355dc8f26a38429
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_003
        source_page_order: 3
        source_page_ref: project_page_xml_asset.page_003
        source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
        classification_rationale: dense repeated blocks visible; possible channelization review required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - FB
          - SET
          - VIOC
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: true
      evidence_review:
        visible_label_hint: redacted dense schematic page signal
        structural_counts:
          element_count: 57198
          part_inst_count: 464
          net_scalar_count: 260
          wire_scalar_count: 1689
          off_page_connector_count: 36
          material_property_signal_count: 0
          pcb_footprint_signal_count: 464
  - source_page_id: page_004
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_004.2760adf758d9d3c3
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_004
        source_page_order: 4
        source_page_ref: project_page_xml_asset.page_004
        source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
        classification_rationale: visible evidence weak or generic; keep unknown/review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted schematic page signal
        structural_counts:
          element_count: 3210
          part_inst_count: 11
          net_scalar_count: 58
          wire_scalar_count: 99
          off_page_connector_count: 81
          material_property_signal_count: 0
          pcb_footprint_signal_count: 11
  - source_page_id: page_005
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_005.c3d237934d816560
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_005
        source_page_order: 5
        source_page_ref: project_page_xml_asset.page_005
        source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
        classification_rationale: visible evidence weak or generic; keep unknown/review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted schematic page signal
        structural_counts:
          element_count: 4190
          part_inst_count: 24
          net_scalar_count: 51
          wire_scalar_count: 132
          off_page_connector_count: 45
          material_property_signal_count: 0
          pcb_footprint_signal_count: 24
  - source_page_id: page_006
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_006.311a9d421ed1e7bd
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_006
        source_page_order: 6
        source_page_ref: project_page_xml_asset.page_006
        source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
        classification_rationale: material-context structural hints present; do not collect materials here
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted hardware/material context signal
        structural_counts:
          element_count: 1434
          part_inst_count: 11
          net_scalar_count: 10
          wire_scalar_count: 50
          off_page_connector_count: 0
          material_property_signal_count: 3
          pcb_footprint_signal_count: 11
  - source_page_id: page_007
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_007.19728e0aff41acc3
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_007
        source_page_order: 7
        source_page_ref: project_page_xml_asset.page_007
        source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
        classification_rationale: visible evidence weak or generic; keep unknown/review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted schematic page signal
        structural_counts:
          element_count: 1536
          part_inst_count: 12
          net_scalar_count: 10
          wire_scalar_count: 56
          off_page_connector_count: 0
          material_property_signal_count: 3
          pcb_footprint_signal_count: 12
  - source_page_id: page_008
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_008.34e41c5eb8d9a278
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_008
        source_page_order: 8
        source_page_ref: project_page_xml_asset.page_008
        source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
        classification_rationale: hardware/material context and PCB footprint signals present; review required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - PG
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted material-heavy page signal
        structural_counts:
          element_count: 4404
          part_inst_count: 39
          net_scalar_count: 19
          wire_scalar_count: 123
          off_page_connector_count: 0
          material_property_signal_count: 39
          pcb_footprint_signal_count: 39
  - source_page_id: page_009
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_009.e6a6a20dd485f62c
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_009
        source_page_order: 9
        source_page_ref: project_page_xml_asset.page_009
        source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
        classification_rationale: visible evidence weak or generic; keep unknown/review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted schematic page signal
        structural_counts:
          element_count: 7200
          part_inst_count: 58
          net_scalar_count: 39
          wire_scalar_count: 220
          off_page_connector_count: 23
          material_property_signal_count: 0
          pcb_footprint_signal_count: 58
  - source_page_id: page_010
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_010.1d4a28f3140bf1b2
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_010
        source_page_order: 10
        source_page_ref: project_page_xml_asset.page_010
        source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
        classification_rationale: visible evidence weak or generic; keep unknown/review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted schematic page signal
        structural_counts:
          element_count: 5808
          part_inst_count: 10
          net_scalar_count: 102
          wire_scalar_count: 237
          off_page_connector_count: 42
          material_property_signal_count: 0
          pcb_footprint_signal_count: 10
  - source_page_id: page_011
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    sidecar_file: page_module_spec_v0.yaml
    sidecar_spec:
      identity:
        registration_key: page_module_spec.page_011.fb360e4fe37cb704
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_011
        source_page_order: 11
        source_page_ref: project_page_xml_asset.page_011
        source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
        classification_rationale: visible evidence weak or generic; keep unknown/review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_fields_review_required: true
      composition:
        channelization_status: review_required
        repeated_block_hint: false
      evidence_review:
        visible_label_hint: redacted schematic page signal
        structural_counts:
          element_count: 2096
          part_inst_count: 16
          net_scalar_count: 12
          wire_scalar_count: 65
          off_page_connector_count: 0
          material_property_signal_count: 3
          pcb_footprint_signal_count: 16

module_spec_manifest:
  manifest_type: page_module_spec_manifest_v0
  workflow_id: page_xml_normalize_spec_v0
  page_count: 11
  ordered_entries:
    - source_page_id: page_001
      source_page_order: 1
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_002
      source_page_order: 2
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_003
      source_page_order: 3
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_004
      source_page_order: 4
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_005
      source_page_order: 5
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_006
      source_page_order: 6
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_007
      source_page_order: 7
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_008
      source_page_order: 8
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_009
      source_page_order: 9
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_010
      source_page_order: 10
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
      sidecar_file: page_module_spec_v0.yaml
    - source_page_id: page_011
      source_page_order: 11
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
      sidecar_file: page_module_spec_v0.yaml

module_spec_index:
  index_type: page_module_spec_index_v0
  by_page_id:
    page_001:
      registration_key: page_module_spec.page_001.1a3da91ab0a283e2
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    page_002:
      registration_key: page_module_spec.page_002.4a18c884f36bedab
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    page_003:
      registration_key: page_module_spec.page_003.f355dc8f26a38429
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    page_004:
      registration_key: page_module_spec.page_004.2760adf758d9d3c3
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    page_005:
      registration_key: page_module_spec.page_005.c3d237934d816560
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    page_006:
      registration_key: page_module_spec.page_006.311a9d421ed1e7bd
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    page_007:
      registration_key: page_module_spec.page_007.19728e0aff41acc3
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    page_008:
      registration_key: page_module_spec.page_008.34e41c5eb8d9a278
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    page_009:
      registration_key: page_module_spec.page_009.e6a6a20dd485f62c
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    page_010:
      registration_key: page_module_spec.page_010.1d4a28f3140bf1b2
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    page_011:
      registration_key: page_module_spec.page_011.fb360e4fe37cb704
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3

provenance_update:
  source_workflow: whole_xml_page_split_v0
  derived_workflow: page_xml_normalize_spec_v0
  derived_from:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    source_sha256_prefix: 74195c6c62bdcf3f
    split_manifest_page_count: 11
  carried_forward_constraints:
    - source_page_ref unchanged
    - source_sha256 unchanged
    - source order unchanged
    - no raw XML included
    - no normalized XML variant declared

normalization_warnings:
  - Titleblock page count signal reports 8 while actual Page node count is 11; stable page ids must remain ordinal by source order.
  - Page number signals are non-contiguous and missing on 5 pages; titleblock numbering is not a complete identity source.
  - Pages 003, 006, 007, 008, and 011 lack public page-number certainty; preserve upstream page ids without reinterpretation.
  - All classification, module scope, channelization, interface direction, and local/internal hints remain review-required rationale only.
  - Pages 006, 008, and 011 contain material-context signals; this workflow must not collect materials or attach MDD artifacts.
  - Annotation variants are disabled by default; normalized_page_ref and normalized_sha256 remain blank for all pages.
  - No connectivity inference, harness composition, or final library registration is performed here.

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_packet:
    includes:
      - page_module_spec_sidecars
      - module_spec_manifest
      - module_spec_index
    excludes:
      - raw_page_xml
      - normalized_review_xml_variants
      - material_packets
      - mdd_files
      - harness_outputs
  receiver_expectations:
    - consume sidecars by stable page id and source sha256
    - treat sidecars as derived review artifacts only
    - preserve source page XML immutability
    - require human/project policy review before semantic promotion or asset registration

boundary_review:
  public_safe_input_only: true
  raw_xml_body_present: false
  runtime_absolute_paths_present: false
  credentials_or_secrets_present: false
  generated_project_outputs_present: false
  project_private_material_included: false
  workflow_package_write_allowed: false
  boundary_result: pass

open_questions:
  - Should downstream intake retain page-level grouping only, or introduce a review queue split between offpage-heavy pages and material-context pages?
  - If a project later enables annotation variants, what policy will govern variant naming and checksum registration while keeping source XML immutable?
  - Are pages 006, 007, 008, and 011 intended to remain in the same intake lane as schematic pages, or should downstream treat them as mixed-context review candidates?
