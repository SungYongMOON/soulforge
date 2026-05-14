profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  assigned_profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: elf
    class: administrator
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"

normalization_input_summary:
  source_order_policy: preserve original source order
  stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  page_count: 11
  page_boundary_node_family: Page
  titleblock_count_signal: "conflicts with actual page nodes; treat as non-authoritative"
  page_number_signal_quality: "partial, non-contiguous, and sometimes missing"
  source_asset_handling: read-only immutable inputs
  normalization_scope: public-safe structural metadata only

page_module_spec_plan:
  output_unit: page_module_spec_v0.yaml per source page
  required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  identity_fields:
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
  policy_notes:
    normalized_page_ref: blank unless an explicit review-only derived variant exists
    normalized_sha256: blank unless an explicit review-only derived variant exists
    annotation_variant: disabled by default
    semantic_claims: review-required, not confirmed truth
    local_internal_candidates: separate from external interfaces

page_module_spec_sidecars:
  page_001:
    identity:
      registration_key: page_001
      source_system_id: project_page_xml_asset
      source_page_id: page_001
      source_page_order: 1
      source_page_ref: project_page_xml_asset.page_001
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: connector-like and regulator-control labels visible
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [SW, FB, PG]
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted power entry/control sheet signal
      classification_basis_hint: connector-like and regulator-control labels visible; review required

  page_002:
    identity:
      registration_key: page_002
      source_system_id: project_page_xml_asset
      source_page_id: page_002
      source_page_order: 2
      source_page_ref: project_page_xml_asset.page_002
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: weak generic evidence
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  page_003:
    identity:
      registration_key: page_003
      source_system_id: project_page_xml_asset
      source_page_id: page_003
      source_page_order: 3
      source_page_ref: project_page_xml_asset.page_003
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: dense repeated blocks visible
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [FB, SET, VIOC]
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted dense schematic page signal
      classification_basis_hint: dense repeated blocks visible; possible channelization review required

  page_004:
    identity:
      registration_key: page_004
      source_system_id: project_page_xml_asset
      source_page_id: page_004
      source_page_order: 4
      source_page_ref: project_page_xml_asset.page_004
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: weak generic evidence
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  page_005:
    identity:
      registration_key: page_005
      source_system_id: project_page_xml_asset
      source_page_id: page_005
      source_page_order: 5
      source_page_ref: project_page_xml_asset.page_005
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: weak generic evidence
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  page_006:
    identity:
      registration_key: page_006
      source_system_id: project_page_xml_asset
      source_page_id: page_006
      source_page_order: 6
      source_page_ref: project_page_xml_asset.page_006
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: material-context structural hints present
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted hardware/material context signal
      classification_basis_hint: material-context structural hints present; do not collect materials here

  page_007:
    identity:
      registration_key: page_007
      source_system_id: project_page_xml_asset
      source_page_id: page_007
      source_page_order: 7
      source_page_ref: project_page_xml_asset.page_007
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: weak generic evidence
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  page_008:
    identity:
      registration_key: page_008
      source_system_id: project_page_xml_asset
      source_page_id: page_008
      source_page_order: 8
      source_page_ref: project_page_xml_asset.page_008
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: hardware/material context and PCB footprint signals present
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [PG]
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted material-heavy page signal
      classification_basis_hint: hardware/material context and PCB footprint signals present; review required

  page_009:
    identity:
      registration_key: page_009
      source_system_id: project_page_xml_asset
      source_page_id: page_009
      source_page_order: 9
      source_page_ref: project_page_xml_asset.page_009
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: weak generic evidence
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  page_010:
    identity:
      registration_key: page_010
      source_system_id: project_page_xml_asset
      source_page_id: page_010
      source_page_order: 10
      source_page_ref: project_page_xml_asset.page_010
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: weak generic evidence
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  page_011:
    identity:
      registration_key: page_011
      source_system_id: project_page_xml_asset
      source_page_id: page_011
      source_page_order: 11
      source_page_ref: project_page_xml_asset.page_011
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_basis: weak generic evidence
      function_hint: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_values: {}
    composition:
      observed_signals:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

module_spec_manifest:
  schema_version: page_module_spec_v0
  source_order_preserved: true
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
  sidecar_name: page_module_spec_v0.yaml
  sidecar_count: 11
  normalized_page_ref_policy: blank unless explicit review-only derived variant exists
  annotation_variant_enabled: false
  final_asset_registration_done_here: false

module_spec_index:
  page_001:
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    sidecar: page_module_spec_v0.yaml
  page_002:
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    sidecar: page_module_spec_v0.yaml
  page_003:
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    sidecar: page_module_spec_v0.yaml
  page_004:
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    sidecar: page_module_spec_v0.yaml
  page_005:
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    sidecar: page_module_spec_v0.yaml
  page_006:
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    sidecar: page_module_spec_v0.yaml
  page_007:
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    sidecar: page_module_spec_v0.yaml
  page_008:
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    sidecar: page_module_spec_v0.yaml
  page_009:
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    sidecar: page_module_spec_v0.yaml
  page_010:
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    sidecar: page_module_spec_v0.yaml
  page_011:
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    sidecar: page_module_spec_v0.yaml

provenance_update:
  upstream_input: whole_xml_page_split_v0 split manifest metadata
  provenance_policy: preserve source order and source hashes only
  derived_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  source_mutation: not performed
  normalized_variant: not created
  registration_status: not finalized here

normalization_warnings:
  - titleblock page count signal conflicts with actual 11 page nodes
  - page number signals are partial and non-contiguous
  - page-level semantic classification remains review-required
  - material-context pages must not be treated as material collection tasks
  - normalized_page_ref and normalized_sha256 remain blank by policy
  - no final library asset registration is claimed here

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_packet_contents:
    - page_module_spec_sidecars
    - module_spec_manifest
    - compact_downstream_handoff
  handoff_intent: provide stable per-page structural sidecars for intake review
  constraints:
    - no raw XML
    - no material collection
    - no harness composition
    - no final asset registration
    - public-safe only

boundary_review:
  public_safe: true
  private_material_excluded: true
  raw_xml_excluded: true
  runtime_absolute_paths_excluded: true
  credentials_excluded: true
  project_private_payloads_excluded: true
  under_workflow_package: false

open_questions:
  - Which pages, if any, should later receive review-only derived variants?
  - Should downstream intake treat any local_internal_candidates as cross-page linkage hints only?
  - Is there a separate project policy for channelization review priority across pages 001, 003, and 008?
