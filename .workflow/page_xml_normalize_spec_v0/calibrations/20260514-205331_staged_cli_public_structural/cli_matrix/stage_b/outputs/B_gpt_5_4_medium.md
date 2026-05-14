```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  calibration_mode: public_safe_cli_calibration
  assigned_profile:
    model: gpt-5.4
    reasoning_effort: medium
    species: elf
    class: auditor
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  schema_version: page_module_spec_v0
  output_scope: project_local_only
  public_safe_constraints:
    raw_xml_body_included: false
    runtime_absolute_path_included: false
    credentials_or_secret_material_included: false
    generated_project_outputs_included: false

normalization_input_summary:
  source_root_element: Design
  source_page_boundary_node_family: Page
  source_page_count: 11
  stable_page_id_policy: derive page_001..page_011 from source order
  source_handling:
    source_page_xml_assets_are_read_only: true
    source_page_xml_rewrite_allowed: false
    source_page_xml_mutation_allowed: false
    single_page_fallback_allowed: false
  titleblock_signal_review:
    reported_page_count_values: ["8"]
    observed_on_page_nodes: 6
    conflicts_with_actual_page_nodes: true
  page_number_signal_review:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true
  normalization_policy:
    normalized_page_ref_policy: blank_unless_optional_derived_review_variant_exists
    annotation_variant_enabled: false
    semantic_claims_require_review: true
    unsupported_quantitative_values_stay_blank: true

page_module_spec_plan:
  primary_output: one page_module_spec_v0.yaml sidecar per source page
  page_order_preserved:
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
  sidecar_requirements:
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
  review_position:
    classification_is_rationale_only: true
    module_scope_is_review_required: true
    channelization_is_review_required: true
    function_hints_are_not_confirmed_truth: true
    local_internal_candidates_are_not_external_interfaces: true
  derived_review_variant_policy:
    normalized_page_ref: ""
    normalized_sha256: ""
    annotation_variant_default: disabled

page_module_spec_sidecars:
  - source_page_id: page_001
    source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_001:1a3da91ab0a283e2
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_001
        source_page_order: 1
        source_page_ref: project_page_xml_asset.page_001
        source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: ["SW", "FB", "PG"]
      performance:
        quantitative_values_confirmed: false
        notes: "Structural counts available; performance meaning unconfirmed."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted power entry/control sheet signal
        rationale: connector-like and regulator-control labels visible; review required

  - source_page_id: page_002
    source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_002:4a18c884f36bedab
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_002
        source_page_order: 2
        source_page_ref: project_page_xml_asset.page_002
        source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "Structural counts available; meaning unconfirmed."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted schematic page signal
        rationale: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_003
    source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_003:f355dc8f26a38429
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_003
        source_page_order: 3
        source_page_ref: project_page_xml_asset.page_003
        source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: ["FB", "SET", "VIOC"]
      performance:
        quantitative_values_confirmed: false
        notes: "Dense page; no confirmed performance extraction."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: possible_dense_repeated_blocks
      evidence_review:
        visible_label_hint: redacted dense schematic page signal
        rationale: dense repeated blocks visible; possible channelization review required

  - source_page_id: page_004
    source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_004:2760adf758d9d3c3
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_004
        source_page_order: 4
        source_page_ref: project_page_xml_asset.page_004
        source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "Counts present; semantic meaning deferred."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted schematic page signal
        rationale: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_005
    source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_005:c3d237934d816560
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_005
        source_page_order: 5
        source_page_ref: project_page_xml_asset.page_005
        source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "Counts present; semantic meaning deferred."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted schematic page signal
        rationale: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_006
    source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_006:311a9d421ed1e7bd
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_006
        source_page_order: 6
        source_page_ref: project_page_xml_asset.page_006
        source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "No performance extraction from material-context page."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted hardware/material context signal
        rationale: material-context structural hints present; do not collect materials here

  - source_page_id: page_007
    source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_007:19728e0aff41acc3
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_007
        source_page_order: 7
        source_page_ref: project_page_xml_asset.page_007
        source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "Counts present; semantic meaning deferred."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted schematic page signal
        rationale: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_008
    source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_008:34e41c5eb8d9a278
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_008
        source_page_order: 8
        source_page_ref: project_page_xml_asset.page_008
        source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: ["PG"]
      performance:
        quantitative_values_confirmed: false
        notes: "Material-heavy structural counts are not treated as performance truth."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted material-heavy page signal
        rationale: hardware/material context and PCB footprint signals present; review required

  - source_page_id: page_009
    source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_009:e6a6a20dd485f62c
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_009
        source_page_order: 9
        source_page_ref: project_page_xml_asset.page_009
        source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "Counts present; semantic meaning deferred."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted schematic page signal
        rationale: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_010
    source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_010:1d4a28f3140bf1b2
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_010
        source_page_order: 10
        source_page_ref: project_page_xml_asset.page_010
        source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - offpage_connector_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "Counts present; semantic meaning deferred."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted schematic page signal
        rationale: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_011
    source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
    sidecar_file: page_module_spec_v0.yaml
    sidecar:
      identity:
        registration_key: page_module_spec_v0:page_011:fb360e4fe37cb704
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_011
        source_page_order: 11
        source_page_ref: project_page_xml_asset.page_011
        source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
        normalized_page_ref: ""
        normalized_sha256: ""
      module_definition:
        structural_scope: unknown
        classification_basis: review_required
        role_hints:
          - schematic_content
          - hardware_or_material_context
          - possible_pcb_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_confirmed: false
        notes: "Counts present; semantic meaning deferred."
      composition:
        channelization_hypothesis: review_required
        repeated_block_hypothesis: ""
      evidence_review:
        visible_label_hint: redacted schematic page signal
        rationale: visible evidence weak or generic; keep unknown/review_required

module_spec_manifest:
  manifest_id: page_xml_normalize_spec_v0.module_spec_manifest
  schema_version: page_module_spec_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  page_count: 11
  ordered_entries:
    - { source_page_id: page_001, source_page_order: 1, source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_002, source_page_order: 2, source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_003, source_page_order: 3, source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_004, source_page_order: 4, source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_005, source_page_order: 5, source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_006, source_page_order: 6, source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_007, source_page_order: 7, source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_008, source_page_order: 8, source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_009, source_page_order: 9, source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_010, source_page_order: 10, source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665", sidecar_file: page_module_spec_v0.yaml }
    - { source_page_id: page_011, source_page_order: 11, source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3", sidecar_file: page_module_spec_v0.yaml }
  manifest_notes:
    preserve_source_order: true
    source_assets_immutable: true
    final_asset_registration_done_here: false

module_spec_index:
  by_page_id:
    page_001: { order: 1, registration_key: page_module_spec_v0:page_001:1a3da91ab0a283e2, review_state: review_required }
    page_002: { order: 2, registration_key: page_module_spec_v0:page_002:4a18c884f36bedab, review_state: review_required }
    page_003: { order: 3, registration_key: page_module_spec_v0:page_003:f355dc8f26a38429, review_state: review_required }
    page_004: { order: 4, registration_key: page_module_spec_v0:page_004:2760adf758d9d3c3, review_state: review_required }
    page_005: { order: 5, registration_key: page_module_spec_v0:page_005:c3d237934d816560, review_state: review_required }
    page_006: { order: 6, registration_key: page_module_spec_v0:page_006:311a9d421ed1e7bd, review_state: review_required }
    page_007: { order: 7, registration_key: page_module_spec_v0:page_007:19728e0aff41acc3, review_state: review_required }
    page_008: { order: 8, registration_key: page_module_spec_v0:page_008:34e41c5eb8d9a278, review_state: review_required }
    page_009: { order: 9, registration_key: page_module_spec_v0:page_009:e6a6a20dd485f62c, review_state: review_required }
    page_010: { order: 10, registration_key: page_module_spec_v0:page_010:1d4a28f3140bf1b2, review_state: review_required }
    page_011: { order: 11, registration_key: page_module_spec_v0:page_011:fb360e4fe37cb704, review_state: review_required }
  by_signal_group:
    offpage_connector_context:
      - page_001
      - page_002
      - page_003
      - page_004
      - page_005
      - page_009
      - page_010
    hardware_or_material_context:
      - page_006
      - page_007
      - page_008
      - page_011
    material_property_signal_present:
      - page_006
      - page_007
      - page_008
      - page_011

provenance_update:
  provenance_mode: calibration_structural_metadata_only
  upstream_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  inherited_from_upstream:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    source_sha256_prefix: "74195c6c62bdcf3f"
    stable_page_id_policy: preserve page_001..page_011 from split manifest source order
  derived_outputs_declared:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
    - downstream_handoff
  explicit_non_actions:
    - no raw XML inspection
    - no XML mutation
    - no normalized XML generation
    - no annotation variant generation
    - no material collection
    - no MDD attachment
    - no harness composition
    - no final library registration

normalization_warnings:
  - code: TITLEBLOCK_COUNT_CONFLICT
    severity: warning
    detail: Reported titleblock page count signal "8" conflicts with actual split page count 11.
  - code: PAGE_NUMBER_GAPS
    severity: warning
    detail: Public-safe page number signals are non-contiguous and incomplete; stable ids must stay ordinal by source order.
  - code: SIGNALS_NOT_IDENTITY
    severity: warning
    detail: Titleblock page number/count signals are advisory only and must not replace stable page ids.
  - code: SEMANTIC_REVIEW_REQUIRED
    severity: warning
    detail: Classification, scope, channelization, and function hints remain rationale only, not confirmed design truth.
  - code: INTERFACE_UNCONFIRMED
    severity: warning
    detail: External interfaces are not inferred from structural metadata alone; required interface containers remain empty pending review.
  - code: MATERIAL_CONTEXT_BOUNDARY
    severity: warning
    detail: Pages with material-property signals must not trigger material collection in this workflow.
  - code: NO_DERIVED_REVIEW_XML
    severity: warning
    detail: normalized_page_ref and normalized_sha256 remain blank because optional derived review XML variants are disabled by default.

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_payload:
    required_inputs:
      - page_module_spec_sidecars
      - module_spec_manifest
      - downstream_handoff
    source_assets_expected_from_upstream_reference_only: true
  downstream_expectations:
    preserve_stable_page_ids: true
    use_source_sha256_for_binding: true
    treat_sidecars_as_review_scaffolds: true
    do_not_assume_confirmed_connectivity: true
    do_not_assume_final_asset_registration: true
  compact_packet:
    page_count: 11
    review_required_pages:
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
    material_context_pages:
      - page_006
      - page_007
      - page_008
      - page_011

boundary_review:
  public_safe_result: pass
  boundary_assertions:
    raw_xml_included: false
    absolute_paths_included: false
    project_private_payloads_included: false
    credentials_or_secret_material_included: false
    generated_project_output_payloads_included: false
    workflow_package_write_target_used: false
  constraints_respected:
    source_xml_immutable: true
    outputs_project_local_only: true
    no_workflow_package_placement: true
    no_material_collection: true
    no_harness_composition: true

open_questions:
  - Should any optional derived review XML variant ever be enabled for this project, or should sidecars remain the only normalization-layer artifact?
  - What reviewer rubric should distinguish external interfaces from local_internal_candidates on dense pages such as page_001 and page_003?
  - Should hardware/material-context pages be split into a narrower downstream review lane before intake library processing?
  - Is there a project policy for expressing repeated-block or channel hypotheses beyond review_required without raw XML evidence review?
```