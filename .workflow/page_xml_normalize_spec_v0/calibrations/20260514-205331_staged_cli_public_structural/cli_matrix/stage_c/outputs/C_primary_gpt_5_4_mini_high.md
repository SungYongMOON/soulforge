profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  assigned_profile:
    model: gpt-5.4-mini
    reasoning_effort: high
    species: elf
    class: auditor
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  policy_notes:
    - public_safe_structural_metadata_only
    - source_page_xml_is_read_only
    - no_xml_mutation_or_rewrite
    - no_final_asset_registration_here

normalization_input_summary:
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  stable_page_order:
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
  page_number_signal_status:
    titleblock_count_conflict: true
    non_contiguous_signal_present: true
    missing_or_ambiguous_pages: 5
  normalization_scope:
    preserve_source_page_order: true
    preserve_page_xml_without_normalization: true
    single_page_fallback_allowed: false
    duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning

page_module_spec_plan:
  output_unit: page_module_spec_v0.yaml
  per_page_sidecar_count: 11
  sidecar_policy:
    one_sidecar_per_source_page: true
    stable_page_id_binding: true
    source_sha256_binding: true
    normalized_page_ref: ""
    normalized_sha256: ""
    annotation_variant_enabled: false
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
  separate_internal_bucket:
    local_internal_candidates: true
    not_an_external_interface: true
  review_basis:
    classification_is_rationale_not_truth: true
    module_scope_is_review_required: true
    channelization_is_review_required: true
    function_hints_are_review_required: true

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    source_page_ref: project_page_xml_asset.page_001
    sidecar_file: page_module_spec_v0.page_001.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - connector-like control labels
          - regulator-control labels
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_002
    source_page_order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    source_page_ref: project_page_xml_asset.page_002
    sidecar_file: page_module_spec_v0.page_002.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_003
    source_page_order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    source_page_ref: project_page_xml_asset.page_003
    sidecar_file: page_module_spec_v0.page_003.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - repeated block candidates
          - channelization review hints
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_004
    source_page_order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    source_page_ref: project_page_xml_asset.page_004
    sidecar_file: page_module_spec_v0.page_004.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_005
    source_page_order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    source_page_ref: project_page_xml_asset.page_005
    sidecar_file: page_module_spec_v0.page_005.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_006
    source_page_order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    source_page_ref: project_page_xml_asset.page_006
    sidecar_file: page_module_spec_v0.page_006.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - material-context structural hints
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_007
    source_page_order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    source_page_ref: project_page_xml_asset.page_007
    sidecar_file: page_module_spec_v0.page_007.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - material-context structural hints
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_008
    source_page_order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    source_page_ref: project_page_xml_asset.page_008
    sidecar_file: page_module_spec_v0.page_008.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - material-heavy context
          - PG label hint
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_009
    source_page_order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    source_page_ref: project_page_xml_asset.page_009
    sidecar_file: page_module_spec_v0.page_009.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_010
    source_page_order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    source_page_ref: project_page_xml_asset.page_010
    sidecar_file: page_module_spec_v0.page_010.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance: required
      composition: required
      evidence_review: required
  - source_page_id: page_011
    source_page_order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    source_page_ref: project_page_xml_asset.page_011
    sidecar_file: page_module_spec_v0.page_011.yaml
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: required
      module_definition: required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates:
          - material-context structural hints
      performance: required
      composition: required
      evidence_review: required

module_spec_manifest:
  schema_version: page_module_spec_v0
  source_order_preserved: true
  source_page_count: 11
  sidecars:
    - page_id: page_001
      order: 1
      sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
      file: page_module_spec_v0.page_001.yaml
    - page_id: page_002
      order: 2
      sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
      file: page_module_spec_v0.page_002.yaml
    - page_id: page_003
      order: 3
      sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
      file: page_module_spec_v0.page_003.yaml
    - page_id: page_004
      order: 4
      sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
      file: page_module_spec_v0.page_004.yaml
    - page_id: page_005
      order: 5
      sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
      file: page_module_spec_v0.page_005.yaml
    - page_id: page_006
      order: 6
      sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
      file: page_module_spec_v0.page_006.yaml
    - page_id: page_007
      order: 7
      sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
      file: page_module_spec_v0.page_007.yaml
    - page_id: page_008
      order: 8
      sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
      file: page_module_spec_v0.page_008.yaml
    - page_id: page_009
      order: 9
      sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
      file: page_module_spec_v0.page_009.yaml
    - page_id: page_010
      order: 10
      sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
      file: page_module_spec_v0.page_010.yaml
    - page_id: page_011
      order: 11
      sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
      file: page_module_spec_v0.page_011.yaml
  manifest_warnings:
    - titleblock_page_count_signal_conflicts_with_actual_page_nodes
    - page_number_signals_are_non_contiguous
    - page_identity_must_follow_source_order_not_titleblock_count

module_spec_index:
  by_page_id:
    page_001: page_module_spec_v0.page_001.yaml
    page_002: page_module_spec_v0.page_002.yaml
    page_003: page_module_spec_v0.page_003.yaml
    page_004: page_module_spec_v0.page_004.yaml
    page_005: page_module_spec_v0.page_005.yaml
    page_006: page_module_spec_v0.page_006.yaml
    page_007: page_module_spec_v0.page_007.yaml
    page_008: page_module_spec_v0.page_008.yaml
    page_009: page_module_spec_v0.page_009.yaml
    page_010: page_module_spec_v0.page_010.yaml
    page_011: page_module_spec_v0.page_011.yaml
  by_source_order:
    1: page_001
    2: page_002
    3: page_003
    4: page_004
    5: page_005
    6: page_006
    7: page_007
    8: page_008
    9: page_009
    10: page_010
    11: page_011
  normalized_ref_policy: blank_until_review_variant_exists
  registration_scope: project_local_derived_artifact_only

provenance_update:
  upstream_split_workflow: whole_xml_page_split_v0
  downstream_intake_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  provenance_status:
    source_pages_are_immutable_inputs: true
    derived_sidecars_are_project_local_only: true
    final_asset_registration_done_here: false
    raw_xml_body_carried_forward: false
  continuity_notes:
    - preserve_page_order_and_page_ids
    - bind each sidecar to source sha256
    - keep review-only claims separate from confirmed structure

normalization_warnings:
  - titleblock_page_count_signal_reports_8_but_source_pages_are_11
  - page_number_signals_are_sparse_non_contiguous_and_not_authoritative
  - page_003_page_006_page_007_page_008_page_011_have_missing_or_not_public_page_number_signals
  - material_property_signals_exist_on_some_pages_but_material_collection_is_out_of_scope_here
  - classification_and_module_scope_remain_review_required
  - do_not_infer_connectivity_or_finalize_library_registration_from_this_packet

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_items:
    - page_module_spec_sidecars
    - module_spec_manifest
    - compact_downstream_handoff_packet
  compact_downstream_handoff_packet:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    source_page_count: 11
    page_order_preserved: true
    sidecar_format: page_module_spec_v0.yaml
    normalized_refs_blank: true
    review_only_scope: true
    external_interfaces_unconfirmed: true
    internal_candidates_separate: true
    asset_registration_not_done: true

boundary_review:
  public_safe_boundary:
    raw_xml_excluded: true
    runtime_paths_excluded: true
    credentials_excluded: true
    project_private_material_excluded: true
  contract_boundary:
    no_workflow_package_write: true
    no_source_xml_mutation: true
    no_harness_composition: true
    no_mdd_attachment: true
    no_material_collection: true
  operational_boundary:
    output_is_derived_structural_metadata_only: true
    page_module_specs_remain_reviewable_artifacts: true
    downstream_intake_must_revalidate_scope: true

open_questions:
  - Which pages, if any, should later receive review-only annotation variants if project policy enables them.
  - Whether any page-local internal candidates should be promoted into downstream intake labels after dedicated review.
  - Whether the sparse page-number signals reflect omitted numbering or a split artifact of the upstream source.