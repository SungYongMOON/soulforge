profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  profile:
    model: gpt-5.5
    reasoning_effort: low
    species: elf
    class: auditor
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  execution_mode: public_safe_cli_calibration
  commands_run: false
  files_created_or_mutated: false

normalization_input_summary:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  stable_page_id_policy: preserve upstream source order as page_001 through page_011
  source_page_xml_policy: read_only_immutable_inputs
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  credentials_or_secret_material_included: false

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  per_page_required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  interface_containers_required_on_every_sidecar:
    - inputs
    - outputs
    - bidirectional
    - passive_or_none
  local_internal_candidates_policy: separate_from_external_interface_containers
  normalized_page_ref_policy: blank_unless_optional_derived_review_variant_exists
  normalized_sha256_policy: blank_unless_optional_derived_review_variant_exists
  annotation_variant_default: disabled
  semantic_status: review_required_rationale_only
  prohibited_actions:
    - source_xml_rewrite
    - source_xml_rename
    - material_collection
    - mdd_attachment
    - harness_composition
    - inferred_connectivity_claims
    - final_library_asset_registration

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    sidecar_ref: project_local_derived.page_001.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_001
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: connector-like and regulator-control labels visible; review required
    local_internal_candidates: [SW, FB, PG]
  - source_page_id: page_002
    source_page_order: 2
    sidecar_ref: project_local_derived.page_002.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_002
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: visible evidence weak or generic; keep unknown/review_required
    local_internal_candidates: []
  - source_page_id: page_003
    source_page_order: 3
    sidecar_ref: project_local_derived.page_003.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_003
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: dense repeated blocks visible; possible channelization review required
    local_internal_candidates: [FB, SET, VIOC]
  - source_page_id: page_004
    source_page_order: 4
    sidecar_ref: project_local_derived.page_004.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_004
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: visible evidence weak or generic; keep unknown/review_required
    local_internal_candidates: []
  - source_page_id: page_005
    source_page_order: 5
    sidecar_ref: project_local_derived.page_005.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_005
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: visible evidence weak or generic; keep unknown/review_required
    local_internal_candidates: []
  - source_page_id: page_006
    source_page_order: 6
    sidecar_ref: project_local_derived.page_006.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_006
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: material-context structural hints present; do not collect materials here
    local_internal_candidates: []
  - source_page_id: page_007
    source_page_order: 7
    sidecar_ref: project_local_derived.page_007.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_007
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: visible evidence weak or generic; keep unknown/review_required
    local_internal_candidates: []
  - source_page_id: page_008
    source_page_order: 8
    sidecar_ref: project_local_derived.page_008.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_008
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: hardware/material context and PCB footprint signals present; review required
    local_internal_candidates: [PG]
  - source_page_id: page_009
    source_page_order: 9
    sidecar_ref: project_local_derived.page_009.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_009
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: visible evidence weak or generic; keep unknown/review_required
    local_internal_candidates: []
  - source_page_id: page_010
    source_page_order: 10
    sidecar_ref: project_local_derived.page_010.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_010
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: visible evidence weak or generic; keep unknown/review_required
    local_internal_candidates: []
  - source_page_id: page_011
    source_page_order: 11
    sidecar_ref: project_local_derived.page_011.page_module_spec_v0_yaml
    source_page_ref: project_page_xml_asset.page_011
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    required_blocks_present: [identity, module_definition, interfaces, performance, composition, evidence_review]
    interface_containers_present: [inputs, outputs, bidirectional, passive_or_none]
    normalized_page_ref: ""
    normalized_sha256: ""
    review_rationale: visible evidence weak or generic; keep unknown/review_required
    local_internal_candidates: []

module_spec_manifest:
  schema_version: page_module_spec_v0
  manifest_scope: project_local_derived_artifacts
  source_pages_preserved_in_order: true
  source_page_count: 11
  sidecar_count: 11
  source_xml_mutated: false
  annotation_variants_enabled: false
  entries:
    - {source_page_id: page_001, source_page_order: 1, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, sidecar_ref: project_local_derived.page_001.page_module_spec_v0_yaml}
    - {source_page_id: page_002, source_page_order: 2, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, sidecar_ref: project_local_derived.page_002.page_module_spec_v0_yaml}
    - {source_page_id: page_003, source_page_order: 3, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, sidecar_ref: project_local_derived.page_003.page_module_spec_v0_yaml}
    - {source_page_id: page_004, source_page_order: 4, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, sidecar_ref: project_local_derived.page_004.page_module_spec_v0_yaml}
    - {source_page_id: page_005, source_page_order: 5, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, sidecar_ref: project_local_derived.page_005.page_module_spec_v0_yaml}
    - {source_page_id: page_006, source_page_order: 6, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, sidecar_ref: project_local_derived.page_006.page_module_spec_v0_yaml}
    - {source_page_id: page_007, source_page_order: 7, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, sidecar_ref: project_local_derived.page_007.page_module_spec_v0_yaml}
    - {source_page_id: page_008, source_page_order: 8, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, sidecar_ref: project_local_derived.page_008.page_module_spec_v0_yaml}
    - {source_page_id: page_009, source_page_order: 9, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, sidecar_ref: project_local_derived.page_009.page_module_spec_v0_yaml}
    - {source_page_id: page_010, source_page_order: 10, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, sidecar_ref: project_local_derived.page_010.page_module_spec_v0_yaml}
    - {source_page_id: page_011, source_page_order: 11, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, sidecar_ref: project_local_derived.page_011.page_module_spec_v0_yaml}

module_spec_index:
  order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  pages_with_page_number_signal: [page_001, page_002, page_004, page_005, page_009, page_010]
  pages_missing_or_nonpublic_page_number_signal: [page_003, page_006, page_007, page_008, page_011]
  pages_with_offpage_connector_context: [page_001, page_002, page_003, page_004, page_005, page_009, page_010]
  pages_with_hardware_or_material_context: [page_006, page_007, page_008, page_011]
  pages_with_local_internal_candidates: [page_001, page_003, page_008]

provenance_update:
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  upstream_workflow: whole_xml_page_split_v0
  upstream_identity_policy_used: stable page ids derived from source order
  derived_artifact_scope: project_local_only
  workflow_package_write_allowed: false
  source_xml_checksum_binding: per_page_source_sha256
  final_asset_registration_done: false

normalization_warnings:
  - titleblock Page Count reports 8 while actual Page node count is 11.
  - Page number signals are incomplete and non-contiguous; stable page ids must remain source-order ordinals.
  - Classification, scope, channelization, local/internal labels, and function hints are review rationale only.
  - Material-property and PCB-footprint signals are structural hints only; material collection is out of scope.
  - normalized_page_ref and normalized_sha256 remain blank because no explicit derived review XML variant is enabled.
  - Source XML assets are immutable inputs and must not be overwritten by normalization outputs.

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - downstream_handoff
  page_count: 11
  stable_page_order_preserved: true
  source_xml_mutated: false
  expected_downstream_use: review page module sidecars, manifest bindings, and evidence rationale before any library intake decision
  excluded_from_handoff:
    - raw_xml_body
    - runtime_absolute_paths
    - credentials
    - cookies
    - project_private_material
    - generated_xml_payloads
    - mdd_files
    - harness_outputs

boundary_review:
  public_safe: true
  raw_xml_included: false
  project_private_material_included: false
  runtime_absolute_paths_included: false
  credentials_or_secrets_included: false
  generated_outputs_claimed_written: false
  source_assets_treated_read_only: true
  outputs_under_workflow_package: false
  design_truth_claimed: false
  connectivity_inferred: false

open_questions:
  - Should a project policy later enable annotation variants for review-only derived XML, and where should those variants be stored?
  - What reviewer criteria should promote unknown/review_required module classifications into confirmed module definitions?
  - Which downstream library intake fields are mandatory before final asset registration outside this workflow?