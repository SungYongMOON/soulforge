profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: high
    species: elf
    class: auditor
  safety_scope: public_safe_structural_metadata_only
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0

normalization_input_summary:
  source_order_policy: preserve_source_page_order
  source_page_count: 11
  stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  source_truth_constraints:
    source_page_xml_is_read_only: true
    preserve_page_xml_without_normalization: true
    annotation_variants_enabled: false
    normalized_page_ref_policy: blank_unless_optional_derived_review_variant_exists
    normalized_sha256_policy: blank_unless_optional_derived_review_variant_exists
  split_signals:
    titleblock_page_count_conflict: true
    page_number_signal_gap_or_ambiguity: true
    page_number_signal_non_contiguous: true
    page_number_source_counts_reported_as_8_but_conflict_with_11_pages: true
  overall_structural_read:
    dominant_scope: schematic_content_with_offpage_context
    review_basis: structural metadata only, semantic claims require review

page_module_spec_plan:
  output_unit: one_page_module_spec_v0_yaml_sidecar_per_source_page
  per_sidecar_required_blocks:
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
  design_rules:
    local_internal_candidates_are_not_external_interfaces: true
    unsupported_quantitative_values_stay_blank: true
    classification_is_review_required_not_truth: true
    do_not_collect_materials_or_attach_mdd_or_compose_harness: true
    final_asset_registration_not_done_here: false
  sidecar_content_policy:
    source_page_ref: stable logical page ref only
    source_sha256: include exact source hash
    registration_key: derived stable logical key
    normalized_page_ref: blank
    normalized_sha256: blank

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    registration_key: page_001.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_001
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: connector_like_and_regulator_control_labels_visible
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates:
        - SW
        - FB
        - PG
    evidence_review:
      visible_evidence: redacted power entry/control sheet signal
      confidence: medium
  - source_page_id: page_002
    source_page_order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    registration_key: page_002.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_002
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: unknown_or_generic
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: weak_or_generic
      confidence: low
  - source_page_id: page_003
    source_page_order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    registration_key: page_003.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_003
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: dense_repeated_blocks_possible_channelization
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates:
        - FB
        - SET
        - VIOC
    evidence_review:
      visible_evidence: dense schematic page signal
      confidence: medium
  - source_page_id: page_004
    source_page_order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    registration_key: page_004.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_004
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: unknown_or_generic
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: weak_or_generic
      confidence: low
  - source_page_id: page_005
    source_page_order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    registration_key: page_005.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_005
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: unknown_or_generic
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: weak_or_generic
      confidence: low
  - source_page_id: page_006
    source_page_order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    registration_key: page_006.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_006
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: hardware_or_material_context_present
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: material-context structural hints present
      confidence: medium
  - source_page_id: page_007
    source_page_order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    registration_key: page_007.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_007
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: hardware_or_material_context_present
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: weak_or_generic
      confidence: low
  - source_page_id: page_008
    source_page_order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    registration_key: page_008.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_008
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: hardware_material_and_pcb_signals_present
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates:
        - PG
    evidence_review:
      visible_evidence: material-heavy page signal
      confidence: medium
  - source_page_id: page_009
    source_page_order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    registration_key: page_009.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_009
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: unknown_or_generic
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: weak_or_generic
      confidence: low
  - source_page_id: page_010
    source_page_order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    registration_key: page_010.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_010
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: unknown_or_generic
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: weak_or_generic
      confidence: low
  - source_page_id: page_011
    source_page_order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    registration_key: page_011.page_module_spec_v0
    source_page_ref: project_page_xml_asset.page_011
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_hint: schematic_content
      function_hint: hardware_or_material_context_present
    interfaces:
      inputs: review_required
      outputs: review_required
      bidirectional: review_required
      passive_or_none: review_required
      local_internal_candidates: []
    evidence_review:
      visible_evidence: weak_or_generic
      confidence: low

module_spec_manifest:
  artifact_set:
    - page_001.page_module_spec_v0.yaml
    - page_002.page_module_spec_v0.yaml
    - page_003.page_module_spec_v0.yaml
    - page_004.page_module_spec_v0.yaml
    - page_005.page_module_spec_v0.yaml
    - page_006.page_module_spec_v0.yaml
    - page_007.page_module_spec_v0.yaml
    - page_008.page_module_spec_v0.yaml
    - page_009.page_module_spec_v0.yaml
    - page_010.page_module_spec_v0.yaml
    - page_011.page_module_spec_v0.yaml
  manifest_rules:
    preserve_source_order: true
    stable_page_ids: true
    source_xml_immutable: true
    no_generated_outputs_under_workflow_package: true
    no_final_asset_registration: true
  checksum_policy:
    source_sha256_recorded_per_page: true
    normalized_sha256_blank_by_default: true

module_spec_index:
  page_001:
    order: 1
    source_sha256_prefix: 1a3da91ab0a283e2
    spec_status: review_required
  page_002:
    order: 2
    source_sha256_prefix: 4a18c884f36bedab
    spec_status: review_required
  page_003:
    order: 3
    source_sha256_prefix: f355dc8f26a38429
    spec_status: review_required
  page_004:
    order: 4
    source_sha256_prefix: 2760adf758d9d3c3
    spec_status: review_required
  page_005:
    order: 5
    source_sha256_prefix: c3d237934d816560
    spec_status: review_required
  page_006:
    order: 6
    source_sha256_prefix: 311a9d421ed1e7bd
    spec_status: review_required
  page_007:
    order: 7
    source_sha256_prefix: 19728e0aff41acc3
    spec_status: review_required
  page_008:
    order: 8
    source_sha256_prefix: 34e41c5eb8d9a278
    spec_status: review_required
  page_009:
    order: 9
    source_sha256_prefix: e6a6a20dd485f62c
    spec_status: review_required
  page_010:
    order: 10
    source_sha256_prefix: 1d4a28f3140bf1b2
    spec_status: review_required
  page_011:
    order: 11
    source_sha256_prefix: fb360e4fe37cb704
    spec_status: review_required

provenance_update:
  input_provenance:
    upstream_workflow: whole_xml_page_split_v0
    source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
    source_sha256_prefix: 74195c6c62bdcf3f
  preservation_notes:
    source_page_order_preserved: true
    source_page_xml_not_modified: true
    no_derived_review_variant: true
    normalized_page_refs_left_blank: true
    normalized_sha256_left_blank: true
  registration_state:
    final_asset_registration_done_here: false

normalization_warnings:
  - titleblock_page_count_signals_conflict_with_actual_11_pages
  - page_number_signals_are_non_contiguous_and_partially_missing
  - pages_006_007_008_011_contain_material_or_hardware_context_signals; do_not_collect_materials_here
  - semantic_classification_remains_review_required_only
  - interface_directionality_is_not_confirmed_by_structural_metadata_alone
  - local_internal_candidates_must_not_be_promoted_to_external_interfaces_without_review
  - preserve_source_xml_as_immutable_input

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_packet:
    included_artifacts:
      - page_module_spec_sidecars
      - module_spec_manifest
      - module_spec_index
    summary:
      page_count: 11
      source_order_preserved: true
      page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
      normalized_refs_blank: true
      review_required: true
    constraints:
      no_raw_xml: true
      no_mdd: true
      no_harness: true
      no_project_private_material: true

boundary_review:
  public_safe_only: true
  excluded_from_output:
    - raw XML
    - runtime absolute paths
    - credentials or secrets
    - project-private material
    - generated project outputs outside this calibration packet
  boundary_assertions:
    source_assets_treated_as_read_only: true
    output_is_project_local_derived_metadata_only: true
    no_claim_of_final_library_registration: true
    no_xml_mutation_or_normalization_claimed: true

open_questions:
  - Should page_number signal gaps remain review-only, or should downstream intake attempt a label reconciliation pass?
  - Do pages with material or hardware signals require a separate review queue before intake classification?
  - Should local_internal_candidates be carried forward as hints only, or suppressed entirely for downstream consumer strictness?