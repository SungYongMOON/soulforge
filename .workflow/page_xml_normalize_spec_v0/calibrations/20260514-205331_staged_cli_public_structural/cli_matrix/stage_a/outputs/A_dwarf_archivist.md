```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: dwarf
    class: archivist
  safety_mode: public_safe
  output_scope: project_local_derived_metadata_only
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"

normalization_input_summary:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_page_count: 11
  source_order_policy: preserve_source_page_order
  stable_page_id_policy: derive page_001..page_011 from source order
  titleblock_page_count_signal: "8"
  titleblock_conflict: true
  page_number_signal_summary:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true
  normalization_stance: preserve_source_page_xml_without_normalization
  source_assets: read_only_immutable_inputs
  derived_artifact_type: page_module_spec_v0.yaml sidecar per page

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_output: page_module_spec_v0.yaml
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
  optional_containers:
    - local_internal_candidates
  annotation_variant:
    enabled: false
    normalized_page_ref_policy: blank
    normalized_sha256_policy: blank
  design_rules:
    - classification and scope remain review-required rationale, not confirmed truth
    - local_internal_candidates stay separate from external interface containers
    - no material collection, harness composition, or final asset registration
    - do not place outputs under .workflow/

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    registration_key: "page_001@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_001"
    source_page_ref: "project_page_xml_asset.page_001"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: offpage_connector_context
  - source_page_id: page_002
    source_page_order: 2
    source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    registration_key: "page_002@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_002"
    source_page_ref: "project_page_xml_asset.page_002"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: offpage_connector_context
  - source_page_id: page_003
    source_page_order: 3
    source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    registration_key: "page_003@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_003"
    source_page_ref: "project_page_xml_asset.page_003"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: offpage_connector_context
  - source_page_id: page_004
    source_page_order: 4
    source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    registration_key: "page_004@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_004"
    source_page_ref: "project_page_xml_asset.page_004"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: offpage_connector_context
  - source_page_id: page_005
    source_page_order: 5
    source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    registration_key: "page_005@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_005"
    source_page_ref: "project_page_xml_asset.page_005"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: offpage_connector_context
  - source_page_id: page_006
    source_page_order: 6
    source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    registration_key: "page_006@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_006"
    source_page_ref: "project_page_xml_asset.page_006"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: hardware_or_material_context
  - source_page_id: page_007
    source_page_order: 7
    source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    registration_key: "page_007@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_007"
    source_page_ref: "project_page_xml_asset.page_007"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: hardware_or_material_context
  - source_page_id: page_008
    source_page_order: 8
    source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    registration_key: "page_008@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_008"
    source_page_ref: "project_page_xml_asset.page_008"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: hardware_or_material_context
  - source_page_id: page_009
    source_page_order: 9
    source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    registration_key: "page_009@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_009"
    source_page_ref: "project_page_xml_asset.page_009"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: offpage_connector_context
  - source_page_id: page_010
    source_page_order: 10
    source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    registration_key: "page_010@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_010"
    source_page_ref: "project_page_xml_asset.page_010"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: offpage_connector_context
  - source_page_id: page_011
    source_page_order: 11
    source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
    registration_key: "page_011@page_xml_normalize_spec_v0"
    source_system_id: "project_page_xml_asset.page_011"
    source_page_ref: "project_page_xml_asset.page_011"
    normalized_page_ref: ""
    normalized_sha256: ""
    module_scope_hint: review_required
    interface_channel_hint: hardware_or_material_context

module_spec_manifest:
  manifest_type: page_module_spec_v0
  total_pages: 11
  stable_order: true
  page_ids:
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
  output_files:
    - page_001/page_module_spec_v0.yaml
    - page_002/page_module_spec_v0.yaml
    - page_003/page_module_spec_v0.yaml
    - page_004/page_module_spec_v0.yaml
    - page_005/page_module_spec_v0.yaml
    - page_006/page_module_spec_v0.yaml
    - page_007/page_module_spec_v0.yaml
    - page_008/page_module_spec_v0.yaml
    - page_009/page_module_spec_v0.yaml
    - page_010/page_module_spec_v0.yaml
    - page_011/page_module_spec_v0.yaml
  checksum_binding: source_sha256 per page
  registration_done_here: false
  final_asset_registration: false
  downstream_target: capture_xml_intake_library_v0

module_spec_index:
  by_page_id:
    page_001:
      order: 1
      checksum: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    page_002:
      order: 2
      checksum: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    page_003:
      order: 3
      checksum: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    page_004:
      order: 4
      checksum: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    page_005:
      order: 5
      checksum: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    page_006:
      order: 6
      checksum: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    page_007:
      order: 7
      checksum: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    page_008:
      order: 8
      checksum: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    page_009:
      order: 9
      checksum: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    page_010:
      order: 10
      checksum: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    page_011:
      order: 11
      checksum: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
  unknown_or_review_required_pages:
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

provenance_update:
  upstream_split_manifest: preserved_as_input
  source_order_preserved: true
  immutable_source_policy: respected
  derived_sidecar_policy: one per page
  canonical_truth_claims: none
  review_basis_only: true
  normalized_page_ref: ""
  normalized_sha256: ""
  mutation_or_rewrite: not_performed
  workflow_package_write_location: project_local_only

normalization_warnings:
  - titleblock page count signal conflicts with actual page nodes
  - page number signals are non-contiguous and incomplete
  - pages with material or hardware context must not trigger material collection here
  - visible evidence is weak or redacted for most pages, so module classification remains review_required
  - no derived review XML variant is enabled, so normalized_page_ref and normalized_sha256 remain blank
  - final library asset registration is not performed in this workflow
  - outputs must stay outside .workflow/

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_payload:
    required_artifacts:
      - page_module_spec_sidecars
      - module_spec_manifest
    compact_context:
      source_page_count: 11
      stable_page_order: true
      review_required_scope: true
      annotation_variant_enabled: false
      normalized_refs_blank: true
  handoff_notes:
    - preserve page ids page_001..page_011
    - carry checksum bindings forward
    - treat local_internal_candidates as non-external
    - do not infer connectivity or final asset registration

boundary_review:
  public_safe: true
  private_material_excluded: true
  raw_xml_excluded: true
  runtime_paths_excluded: true
  secrets_excluded: true
  generated_project_payloads_excluded: true
  harness_or_mdd_excluded: true
  source_assets_treated_as_read_only: true
  under_workflow_package: false

open_questions:
  - Should downstream intake later permit an annotation review variant for any specific page group?
  - Do pages with hardware/material context need a separate review lane, or remain in the same intake track?
  - Is there a preferred registration-key naming convention beyond page_id@workflow_id for future calibration runs?
```
