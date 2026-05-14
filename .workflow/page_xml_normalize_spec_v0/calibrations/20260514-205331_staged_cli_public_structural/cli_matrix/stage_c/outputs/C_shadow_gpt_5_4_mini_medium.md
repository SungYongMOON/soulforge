profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: medium
    species: elf
    class: auditor
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  output_scope: public_safe_structural_metadata_only

normalization_input_summary:
  source_order_preserved: true
  page_count: 11
  stable_page_ids:
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
  trust_policy:
    titleblock_page_count_signal: untrusted_for_identity
    page_number_signals: review_only
    split_identity_basis: source_order
  structural_summary:
    root_element: Design
    page_boundary_node_family: Page
    mixed_signals_present: true
    material_context_pages: [page_006, page_007, page_008, page_011]

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_output: page_module_spec_v0.yaml
  per_page_sidecar_policy: one_sidecar_per_source_page
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
  optional_interface_container:
    - local_internal_candidates
  normalization_rule:
    normalized_page_ref: ""
    normalized_sha256: ""
  annotation_variant:
    enabled: false
    review_only: true

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    registration_key: page_001
    source_system_id: project_page_xml_asset.page_001
    source_page_ref: project_page_xml_asset.page_001
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_unknown_scope
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [SW, FB, PG]
      performance: review_required
      composition: review_required
      evidence_review: connector_like_regulator_control_hints
  - source_page_id: page_002
    source_page_order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    registration_key: page_002
    source_system_id: project_page_xml_asset.page_002
    source_page_ref: project_page_xml_asset.page_002
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_unknown_scope
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: weak_generic_visible_evidence
  - source_page_id: page_003
    source_page_order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    registration_key: page_003
    source_system_id: project_page_xml_asset.page_003
    source_page_ref: project_page_xml_asset.page_003
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_unknown_scope
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [FB, SET, VIOC]
      performance: review_required
      composition: review_required
      evidence_review: dense_repeated_blocks_hints
  - source_page_id: page_004
    source_page_order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    registration_key: page_004
    source_system_id: project_page_xml_asset.page_004
    source_page_ref: project_page_xml_asset.page_004
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_unknown_scope
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: weak_generic_visible_evidence
  - source_page_id: page_005
    source_page_order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    registration_key: page_005
    source_system_id: project_page_xml_asset.page_005
    source_page_ref: project_page_xml_asset.page_005
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_unknown_scope
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: weak_generic_visible_evidence
  - source_page_id: page_006
    source_page_order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    registration_key: page_006
    source_system_id: project_page_xml_asset.page_006
    source_page_ref: project_page_xml_asset.page_006
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_material_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: material_context_present_do_not_collect_materials
  - source_page_id: page_007
    source_page_order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    registration_key: page_007
    source_system_id: project_page_xml_asset.page_007
    source_page_ref: project_page_xml_asset.page_007
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_material_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: generic_weak_evidence_material_hints
  - source_page_id: page_008
    source_page_order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    registration_key: page_008
    source_system_id: project_page_xml_asset.page_008
    source_page_ref: project_page_xml_asset.page_008
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_material_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [PG]
      performance: review_required
      composition: review_required
      evidence_review: material_heavy_and_footprint_signals_present
  - source_page_id: page_009
    source_page_order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    registration_key: page_009
    source_system_id: project_page_xml_asset.page_009
    source_page_ref: project_page_xml_asset.page_009
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_unknown_scope
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: weak_generic_visible_evidence
  - source_page_id: page_010
    source_page_order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    registration_key: page_010
    source_system_id: project_page_xml_asset.page_010
    source_page_ref: project_page_xml_asset.page_010
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_unknown_scope
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: weak_generic_visible_evidence
  - source_page_id: page_011
    source_page_order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    registration_key: page_011
    source_system_id: project_page_xml_asset.page_011
    source_page_ref: project_page_xml_asset.page_011
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: present
      module_definition: review_required_material_context
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
      performance: review_required
      composition: review_required
      evidence_review: material_context_present_do_not_collect_materials

module_spec_manifest:
  manifest_kind: page_module_spec_manifest_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
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
  sidecar_count: 11
  sidecar_filename: page_module_spec_v0.yaml
  checksum_index:
    page_001: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    page_002: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    page_003: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    page_004: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    page_005: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    page_006: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    page_007: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    page_008: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    page_009: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    page_010: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    page_011: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3

module_spec_index:
  page_001: page_module_spec_v0.yaml#page_001
  page_002: page_module_spec_v0.yaml#page_002
  page_003: page_module_spec_v0.yaml#page_003
  page_004: page_module_spec_v0.yaml#page_004
  page_005: page_module_spec_v0.yaml#page_005
  page_006: page_module_spec_v0.yaml#page_006
  page_007: page_module_spec_v0.yaml#page_007
  page_008: page_module_spec_v0.yaml#page_008
  page_009: page_module_spec_v0.yaml#page_009
  page_010: page_module_spec_v0.yaml#page_010
  page_011: page_module_spec_v0.yaml#page_011

provenance_update:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  preserved_source_order: true
  preserved_source_sha256s: true
  normalized_identity_basis: source_order_only
  review_flags:
    titleblock_count_conflict: true
    non_contiguous_page_numbers: true
    missing_or_ambiguous_page_numbers: true
    material_context_present: true

normalization_warnings:
  - Titleblock page count signal conflicts with actual 11-page source order.
  - Page number signals are incomplete and non-contiguous; do not use for identity.
  - Material-context pages exist; this packet does not collect materials or infer composition truth.
  - Module scope, channelization, and function hints remain review-required rather than confirmed.
  - Normalized review XML variants are disabled; normalized_page_ref and normalized_sha256 remain blank.
  - No final asset registration is claimed here.

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  packet_summary: >
    Consume 11 ordered page-sidecar specs keyed by stable page ids and source checksums.
    Treat module_definition and evidence_review as review-required metadata only.
    Keep source XML immutable and do not expect normalized review variants.
  requested_action: intake_and_library_classification_review

boundary_review:
  public_safe: true
  private_material_excluded: true
  source_xml_immutable: true
  no_raw_xml_included: true
  no_runtime_absolute_paths_included: true
  no_credentials_or_secrets_included: true
  no_generated_project_outputs_included: true
  no_mdd_or_harness_compose: true
  no_final_library_registration_claimed: true

open_questions:
  - Which page-sidecars, if any, should later be promoted from review-required scope to confirmed module scope?
  - Do pages with material-context signals require a separate downstream review track distinct from schematic-content pages?
  - Should any local_internal_candidates be re-evaluated after capture_xml_intake_library_v0 intake?
  - Is a future annotation variant policy expected for this source binding, or should review-only remain the default?