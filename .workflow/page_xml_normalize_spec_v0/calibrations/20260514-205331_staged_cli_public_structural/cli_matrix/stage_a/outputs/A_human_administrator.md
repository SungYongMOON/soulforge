profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: human
    class: administrator
  policy_notes:
    project_local_only: true
    source_page_xml_mutation_allowed: false
    annotation_variant_enabled: false
    final_asset_registration_done_here: false

normalization_input_summary:
  source_order_preserved: true
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
  page_count: 11
  split_observations:
    root_element: Design
    boundary_family: Page
    titleblock_page_count_signal_conflict: true
    page_number_signals_non_contiguous: true
    missing_or_ambiguous_page_nodes: 5
  normalization_posture:
    preserve_source_page_xml_without_normalization: true
    treat_source_assets_as_immutable: true
    trust_source_order_over_titleblock_count: true

page_module_spec_plan:
  scope: "one page_module_spec_v0.yaml sidecar per source page"
  required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  per_sidecar_identity_rules:
    registration_key: derived from stable page id and source binding
    source_system_id: project_page_xml_asset
    source_page_id: stable page id
    source_page_order: source order index
    source_page_ref: symbolic source reference only
    source_sha256: exact source page checksum
    normalized_page_ref: ""
    normalized_sha256: ""
  interface_container_rules:
    required:
      - inputs
      - outputs
      - bidirectional
      - passive_or_none
    optional:
      - local_internal_candidates
    note: local_internal_candidates are separate from external interface containers
  content_rules:
    - "classification and module scope remain review-required rationale, not confirmed truth"
    - "unsupported quantitative values stay blank"
    - "do not infer connectivity or final library registration"
    - "do not collect materials or compose harnesses"
  page_specific_notes:
    page_001: "high structural density; connector/regulator-control hints; likely central schematic content"
    page_002: "schematic/connector context appears generic; keep unknown/review_required"
    page_003: "very dense repeated blocks; possible channelization candidate, review required"
    page_004: "sparse schematic page with strong off-page connector context"
    page_005: "sparse schematic page with connector context"
    page_006: "material/hardware context present; do not collect materials"
    page_007: "material/hardware context present; classification stays review-required"
    page_008: "material-heavy signal with PCB footprint presence; review required"
    page_009: "schematic page with connector context"
    page_010: "schematic page with connector context"
    page_011: "material/hardware context present; review-required"

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    identity:
      registration_key: page_001__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_001
      source_page_order: 1
      source_page_ref: project_page_xml_asset.page_001
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "connector-like and regulator-control labels visible; review required"
      function_hint: schematic_content
      classification_basis: review_required
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
      element_count: 29892
      part_inst_count: 211
      net_scalar_count: 296
      wire_scalar_count: 856
      off_page_connector_count: 156
      pcb_footprint_signal_count: 211
      material_property_signal_count: 0
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted power entry/control sheet signal
      review_status: review_required

  - source_page_id: page_002
    source_page_order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    identity:
      registration_key: page_002__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_002
      source_page_order: 2
      source_page_ref: project_page_xml_asset.page_002
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "visible evidence weak or generic; keep unknown/review_required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 29974
      part_inst_count: 211
      net_scalar_count: 296
      wire_scalar_count: 851
      off_page_connector_count: 155
      pcb_footprint_signal_count: 211
      material_property_signal_count: 0
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      review_status: review_required

  - source_page_id: page_003
    source_page_order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    identity:
      registration_key: page_003__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_003
      source_page_order: 3
      source_page_ref: project_page_xml_asset.page_003
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "dense repeated blocks visible; possible channelization review required"
      function_hint: schematic_content
      classification_basis: review_required
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
      element_count: 57198
      part_inst_count: 464
      net_scalar_count: 260
      wire_scalar_count: 1689
      off_page_connector_count: 36
      pcb_footprint_signal_count: 464
      material_property_signal_count: 0
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted dense schematic page signal
      review_status: review_required

  - source_page_id: page_004
    source_page_order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    identity:
      registration_key: page_004__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_004
      source_page_order: 4
      source_page_ref: project_page_xml_asset.page_004
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "visible evidence weak or generic; keep unknown/review_required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 3210
      part_inst_count: 11
      net_scalar_count: 58
      wire_scalar_count: 99
      off_page_connector_count: 81
      pcb_footprint_signal_count: 11
      material_property_signal_count: 0
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      review_status: review_required

  - source_page_id: page_005
    source_page_order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    identity:
      registration_key: page_005__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_005
      source_page_order: 5
      source_page_ref: project_page_xml_asset.page_005
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "visible evidence weak or generic; keep unknown/review_required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 4190
      part_inst_count: 24
      net_scalar_count: 51
      wire_scalar_count: 132
      off_page_connector_count: 45
      pcb_footprint_signal_count: 24
      material_property_signal_count: 0
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      review_status: review_required

  - source_page_id: page_006
    source_page_order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    identity:
      registration_key: page_006__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_006
      source_page_order: 6
      source_page_ref: project_page_xml_asset.page_006
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "material-context structural hints present; do not collect materials here"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 1434
      part_inst_count: 11
      net_scalar_count: 10
      wire_scalar_count: 50
      off_page_connector_count: 0
      pcb_footprint_signal_count: 11
      material_property_signal_count: 3
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted hardware/material context signal
      review_status: review_required

  - source_page_id: page_007
    source_page_order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    identity:
      registration_key: page_007__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_007
      source_page_order: 7
      source_page_ref: project_page_xml_asset.page_007
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "visible evidence weak or generic; keep unknown/review_required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 1536
      part_inst_count: 12
      net_scalar_count: 10
      wire_scalar_count: 56
      off_page_connector_count: 0
      pcb_footprint_signal_count: 12
      material_property_signal_count: 3
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted schematic page signal
      review_status: review_required

  - source_page_id: page_008
    source_page_order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    identity:
      registration_key: page_008__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_008
      source_page_order: 8
      source_page_ref: project_page_xml_asset.page_008
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "hardware/material context and PCB footprint signals present; review required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates:
        - PG
    performance:
      element_count: 4404
      part_inst_count: 39
      net_scalar_count: 19
      wire_scalar_count: 123
      off_page_connector_count: 0
      pcb_footprint_signal_count: 39
      material_property_signal_count: 39
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted material-heavy page signal
      review_status: review_required

  - source_page_id: page_009
    source_page_order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    identity:
      registration_key: page_009__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_009
      source_page_order: 9
      source_page_ref: project_page_xml_asset.page_009
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "visible evidence weak or generic; keep unknown/review_required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 7200
      part_inst_count: 58
      net_scalar_count: 39
      wire_scalar_count: 220
      off_page_connector_count: 23
      pcb_footprint_signal_count: 58
      material_property_signal_count: 0
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      review_status: review_required

  - source_page_id: page_010
    source_page_order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    identity:
      registration_key: page_010__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_010
      source_page_order: 10
      source_page_ref: project_page_xml_asset.page_010
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "visible evidence weak or generic; keep unknown/review_required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 5808
      part_inst_count: 10
      net_scalar_count: 102
      wire_scalar_count: 237
      off_page_connector_count: 42
      pcb_footprint_signal_count: 10
      material_property_signal_count: 0
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      review_status: review_required

  - source_page_id: page_011
    source_page_order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    identity:
      registration_key: page_011__page_module_spec_v0
      source_system_id: project_page_xml_asset
      source_page_id: page_011
      source_page_order: 11
      source_page_ref: project_page_xml_asset.page_011
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      scope_rationale: "material/hardware context present; review required"
      function_hint: schematic_content
      classification_basis: review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      element_count: 2096
      part_inst_count: 16
      net_scalar_count: 12
      wire_scalar_count: 65
      off_page_connector_count: 0
      pcb_footprint_signal_count: 16
      material_property_signal_count: 3
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted schematic page signal
      review_status: review_required

module_spec_manifest:
  schema_version: page_module_spec_v0
  page_count: 11
  source_order_preserved: true
  stable_page_id_policy: derive page_001..page_011 from source order
  sidecar_file_pattern: page_module_spec_v0.yaml
  sidecar_count: 11
  checksum_basis: source_page_sha256
  normalized_outputs_allowed_under_workflow: false
  registered_final_assets: false
  manifest_warnings:
    - titleblock count signal conflicts with actual page nodes
    - page numbering is non-contiguous and partially missing
    - source page XML is immutable and must remain unmodified

module_spec_index:
  page_001: page_module_spec_v0.yaml
  page_002: page_module_spec_v0.yaml
  page_003: page_module_spec_v0.yaml
  page_004: page_module_spec_v0.yaml
  page_005: page_module_spec_v0.yaml
  page_006: page_module_spec_v0.yaml
  page_007: page_module_spec_v0.yaml
  page_008: page_module_spec_v0.yaml
  page_009: page_module_spec_v0.yaml
  page_010: page_module_spec_v0.yaml
  page_011: page_module_spec_v0.yaml

provenance_update:
  upstream_binding: project_binding.whole_xml_source.sample_exp_capture_big_xml
  downstream_target: capture_xml_intake_library_v0
  source_page_assets:
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
  immutable_input_policy: preserved
  derived_artifact_policy:
    project_local_only: true
    never_under_workflow_package: true
  variant_policy:
    annotation_variant_enabled: false
    normalized_page_ref_blank_by_default: true

normalization_warnings:
  - "Titleblock page count signal reports 8, but 11 page nodes are observed."
  - "Page number signals are incomplete and non-contiguous; do not use them as stable identity."
  - "Several pages have missing_or_not_public page number/count signals."
  - "Material/hardware context signals appear on multiple pages; do not collect materials in this workflow."
  - "Local internal labels are review hints only and must not be promoted to confirmed interfaces."
  - "No normalized review XML variant is enabled, so normalized_page_ref and normalized_sha256 remain blank."

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  required_payloads:
    - page_module_spec_sidecars
    - module_spec_manifest
    - compact_downstream_handoff
  compact_downstream_handoff:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    page_count: 11
    stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
    review_posture: review_required
    normalization_status: spec_only
    variant_status: disabled
    boundary_note: "carry forward derived page module specs only; do not treat source XML as normalized or rewritten"

boundary_review:
  public_safe: true
  source_xml_mutation: prohibited
  raw_xml_in_output: prohibited
  runtime_absolute_paths: prohibited
  credentials_or_secret_material: prohibited
  project_private_material: withheld
  workflow_tree_storage: prohibited
  final_asset_registration: not_done_here
  contract_alignment: compliant

open_questions:
  - "Should page_003 be explored later as a candidate for channelized module grouping, or left as an unresolved dense schematic page?"
  - "Is there any project policy that would later enable annotation_variant outputs for review-only comparison?"
  - "Should downstream intake treat the material-heavy pages as separate evidence classes or just as review-required schematic pages?"