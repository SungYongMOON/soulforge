profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: elf
    class: auditor
  execution_mode: public-safe structural calibration
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  source_page_count: 11

normalization_input_summary:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  root_element: Design
  page_boundary_node_family: Page
  stable_page_id_policy: derive page_001..page_011 from source order; do not trust titleblock page count/number as complete identity
  preservation_policy:
    preserve_source_page_order: true
    preserve_page_xml_without_normalization: true
    source_page_xml_mutation_allowed: false
    source_page_xml_body_rewrite_allowed: false
  split_signals:
    titleblock_page_count_signal: conflicts_with_actual_page_nodes
    page_number_signal_summary: non_contiguous_and_partially_ambiguous
  scope_note: page XML assets treated as immutable read-only inputs; no material collection, harness composition, or final asset registration

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  required_identity_fields:
    - registration_key
    - source_system_id
    - source_page_id
    - source_page_order
    - source_page_ref
    - source_sha256
  interface_containers:
    required:
      - inputs
      - outputs
      - bidirectional
      - passive_or_none
    optional:
      - local_internal_candidates
  review_policy:
    structural_scope_default: unknown
    semantic_claims_require_review: true
    classification_basis_records_rationale_not_truth: true
    local_internal_candidates_not_external_interfaces: true
    unsupported_quantitative_values_stay_blank: true
    normalized_page_ref_policy: blank_unless_optional_derived_review_variant_exists
  annotation_variant:
    enabled: false
    output_is_derived_review_only: true

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_002
    source_page_order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_003
    source_page_order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_004
    source_page_order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_005
    source_page_order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_006
    source_page_order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_007
    source_page_order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_008
    source_page_order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_009
    source_page_order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_010
    source_page_order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present
  - source_page_id: page_011
    source_page_order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    normalized_page_ref: ""
    normalized_sha256: ""
    sidecar_file: page_module_spec_v0.yaml
    blocks:
      identity: present
      module_definition: review_required
      interfaces: present
      performance: present
      composition: present
      evidence_review: present

module_spec_manifest:
  schema_version: page_module_spec_v0
  source_order: preserved
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
  checksum_policy:
    source_sha256_tracked: true
    normalized_sha256_blank_by_default: true
  artifact_scope:
    project_local_only: true
    never_under_workflow_package: true
    sidecars: page_module_spec_sidecars
    manifest: module_spec_manifest
    index: module_spec_index

module_spec_index:
  page_001:
    order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
  page_002:
    order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
  page_003:
    order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
  page_004:
    order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
  page_005:
    order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
  page_006:
    order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
  page_007:
    order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
  page_008:
    order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
  page_009:
    order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
  page_010:
    order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
  page_011:
    order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3

provenance_update:
  upstream_source: whole_xml_page_split_v0
  downstream_target: capture_xml_intake_library_v0
  provenance_state: derived_structural_metadata_only
  preserved_facts:
    - source page order
    - source page identity
    - source sha256
    - split summary signals
  excluded_facts:
    - raw xml body
    - credentials or secret material
    - runtime absolute paths
    - final asset registration
    - material collection
    - harness composition

normalization_warnings:
  - titleblock page count signal conflicts with actual page count; use stable ordinal page ids only
  - page number signals are non-contiguous and partially missing; do not infer identity from page numbers alone
  - semantic classification, module scope, and channelization remain review-required rationale rather than confirmed design truth
  - material-heavy and pcb-footprint signals are visible on some pages, but material collection is out of scope
  - normalized_page_ref and normalized_sha256 remain blank because no optional derived review variant is enabled

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  payload_items:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  handoff_summary: consume stable page-ordered sidecars keyed by page_001..page_011; treat all page XML inputs as immutable and keep review-required labels provisional
  constraints:
    - no raw xml
    - no final registration claim
    - no derived review variant unless explicitly enabled by project policy

boundary_review:
  public_safe: true
  workflow_boundary_respected: true
  project_local_only: true
  no_workflow_package_output: true
  no_secret_material: true
  no_source_xml_mutation: true
  no_material_collection: true
  no_mdd_attachment: true
  no_harness_composition: true

open_questions:
  - Should any page receive an explicit review-only annotation variant later, or should annotation remain disabled for this binding?
  - Is there a project-local convention for registration_key formatting beyond source page identity and order?
  - Does downstream intake expect any additional provenance tags beyond source_sha256 and stable page order?