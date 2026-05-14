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
    species: darkelf
    class: archivist
  policy_notes:
    - public_safe structural metadata only
    - source page XML treated as immutable read-only input
    - annotation variants disabled by default
    - no final asset registration here

normalization_input_summary:
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  stable_page_id_policy: derive page_001..page_011 from source order
  order_preservation: true
  source_page_identity_rule: preserve upstream split order and page ids without trusting page count/number signals as complete identity
  notable_signals:
    titleblock_page_count_conflict: true
    non_contiguous_page_number_signals: true
    page_number_signal_gaps_present: true

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
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
  plan:
    - create one sidecar per source page, keyed by stable page id
    - keep normalized_page_ref and normalized_sha256 blank unless a derived review variant exists
    - preserve raw page evidence cues as rationale only, not confirmed design truth
    - keep local_internal_candidates separate from external interface containers
    - do not infer connectivity, collect materials, or register final assets

page_module_spec_sidecars:
  page_001:
    checksum: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    identity:
      registration_key: page_001
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_001
      source_page_order: 1
      source_page_ref: project_page_xml_asset.page_001
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_basis: connector-like and regulator-control labels visible; review required
      function_hint: possible schematic content with off-page connector context
      local_internal_candidates:
        - SW
        - FB
        - PG
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
      structural_counts:
        element_count: 29892
        part_inst_count: 211
        net_scalar_count: 296
        wire_scalar_count: 856
        off_page_connector_count: 156
        material_property_signal_count: 0
        pcb_footprint_signal_count: 211
    evidence_review:
      visible_label_hint: redacted power entry/control sheet signal
      confidence: review_required
      notes:
        - classification is rationale-only
        - no external interface confirmation
  page_002:
    checksum: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    identity:
      registration_key: page_002
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_002
      source_page_order: 2
      source_page_ref: project_page_xml_asset.page_002
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification_basis: visible evidence weak or generic; keep unknown/review_required
      function_hint: schematic page, function not confirmed
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
      structural_counts:
        element_count: 29974
        part_inst_count: 211
        net_scalar_count: 296
        wire_scalar_count: 851
        off_page_connector_count: 155
        material_property_signal_count: 0
        pcb_footprint_signal_count: 211
    evidence_review:
      visible_label_hint: redacted schematic page signal
      confidence: low
      notes:
        - keep unknown until review
  page_003:
    checksum: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    identity:
      registration_key: page_003
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_003
      source_page_order: 3
      source_page_ref: project_page_xml_asset.page_003
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_basis: dense repeated blocks visible; possible channelization review required
      function_hint: dense schematic content with possible channelization
      local_internal_candidates:
        - FB
        - SET
        - VIOC
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
      structural_counts:
        element_count: 57198
        part_inst_count: 464
        net_scalar_count: 260
        wire_scalar_count: 1689
        off_page_connector_count: 36
        material_property_signal_count: 0
        pcb_footprint_signal_count: 464
    evidence_review:
      visible_label_hint: redacted dense schematic page signal
      confidence: review_required
      notes:
        - dense structural page
        - do not infer connectivity
  page_004:
    checksum: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    identity:
      registration_key: page_004
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_004
      source_page_order: 4
      source_page_ref: project_page_xml_asset.page_004
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification_basis: visible evidence weak or generic; keep unknown/review_required
      function_hint: schematic page, function not confirmed
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
      structural_counts:
        element_count: 3210
        part_inst_count: 11
        net_scalar_count: 58
        wire_scalar_count: 99
        off_page_connector_count: 81
        material_property_signal_count: 0
        pcb_footprint_signal_count: 11
    evidence_review:
      visible_label_hint: redacted schematic page signal
      confidence: low
      notes:
        - keep unknown until review
  page_005:
    checksum: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    identity:
      registration_key: page_005
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_005
      source_page_order: 5
      source_page_ref: project_page_xml_asset.page_005
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification_basis: visible evidence weak or generic; keep unknown/review_required
      function_hint: schematic page, function not confirmed
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
      structural_counts:
        element_count: 4190
        part_inst_count: 24
        net_scalar_count: 51
        wire_scalar_count: 132
        off_page_connector_count: 45
        material_property_signal_count: 0
        pcb_footprint_signal_count: 24
    evidence_review:
      visible_label_hint: redacted schematic page signal
      confidence: low
      notes:
        - keep unknown until review
  page_006:
    checksum: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    identity:
      registration_key: page_006
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_006
      source_page_order: 6
      source_page_ref: project_page_xml_asset.page_006
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_basis: material-context structural hints present; do not collect materials here
      function_hint: hardware or material context present
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
      structural_counts:
        element_count: 1434
        part_inst_count: 11
        net_scalar_count: 10
        wire_scalar_count: 50
        off_page_connector_count: 0
        material_property_signal_count: 3
        pcb_footprint_signal_count: 11
    evidence_review:
      visible_label_hint: redacted hardware/material context signal
      confidence: review_required
      notes:
        - material collection is out of scope here
  page_007:
    checksum: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    identity:
      registration_key: page_007
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_007
      source_page_order: 7
      source_page_ref: project_page_xml_asset.page_007
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification_basis: visible evidence weak or generic; keep unknown/review_required
      function_hint: hardware or material context possible
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
      structural_counts:
        element_count: 1536
        part_inst_count: 12
        net_scalar_count: 10
        wire_scalar_count: 56
        off_page_connector_count: 0
        material_property_signal_count: 3
        pcb_footprint_signal_count: 12
    evidence_review:
      visible_label_hint: redacted schematic page signal
      confidence: low
      notes:
        - keep unknown until review
  page_008:
    checksum: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    identity:
      registration_key: page_008
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_008
      source_page_order: 8
      source_page_ref: project_page_xml_asset.page_008
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: review_required
      classification_basis: hardware/material context and PCB footprint signals present; review required
      function_hint: material-heavy schematic page
      local_internal_candidates:
        - PG
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
      structural_counts:
        element_count: 4404
        part_inst_count: 39
        net_scalar_count: 19
        wire_scalar_count: 123
        off_page_connector_count: 0
        material_property_signal_count: 39
        pcb_footprint_signal_count: 39
    evidence_review:
      visible_label_hint: redacted material-heavy page signal
      confidence: review_required
      notes:
        - do not infer material specifics
  page_009:
    checksum: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    identity:
      registration_key: page_009
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_009
      source_page_order: 9
      source_page_ref: project_page_xml_asset.page_009
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification_basis: visible evidence weak or generic; keep unknown/review_required
      function_hint: schematic page, function not confirmed
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
      structural_counts:
        element_count: 7200
        part_inst_count: 58
        net_scalar_count: 39
        wire_scalar_count: 220
        off_page_connector_count: 23
        material_property_signal_count: 0
        pcb_footprint_signal_count: 58
    evidence_review:
      visible_label_hint: redacted schematic page signal
      confidence: low
      notes:
        - keep unknown until review
  page_010:
    checksum: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    identity:
      registration_key: page_010
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_010
      source_page_order: 10
      source_page_ref: project_page_xml_asset.page_010
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification_basis: visible evidence weak or generic; keep unknown/review_required
      function_hint: schematic page, function not confirmed
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
      structural_counts:
        element_count: 5808
        part_inst_count: 10
        net_scalar_count: 102
        wire_scalar_count: 237
        off_page_connector_count: 42
        material_property_signal_count: 0
        pcb_footprint_signal_count: 10
    evidence_review:
      visible_label_hint: redacted schematic page signal
      confidence: low
      notes:
        - keep unknown until review
  page_011:
    checksum: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    identity:
      registration_key: page_011
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_011
      source_page_order: 11
      source_page_ref: project_page_xml_asset.page_011
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification_basis: visible evidence weak or generic; keep unknown/review_required
      function_hint: hardware or material context possible
      local_internal_candidates: []
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
    performance:
      quantitative_claims: []
      unsupported_metrics: []
    composition:
      role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
      structural_counts:
        element_count: 2096
        part_inst_count: 16
        net_scalar_count: 12
        wire_scalar_count: 65
        off_page_connector_count: 0
        material_property_signal_count: 3
        pcb_footprint_signal_count: 16
    evidence_review:
      visible_label_hint: redacted schematic page signal
      confidence: low
      notes:
        - keep unknown until review

module_spec_manifest:
  schema_version: page_module_spec_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  page_count: 11
  pages:
    - page_id: page_001
      source_order: 1
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    - page_id: page_002
      source_order: 2
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    - page_id: page_003
      source_order: 3
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    - page_id: page_004
      source_order: 4
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    - page_id: page_005
      source_order: 5
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    - page_id: page_006
      source_order: 6
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    - page_id: page_007
      source_order: 7
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    - page_id: page_008
      source_order: 8
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    - page_id: page_009
      source_order: 9
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    - page_id: page_010
      source_order: 10
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    - page_id: page_011
      source_order: 11
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
  manifest_notes:
    - source XML remains immutable
    - stable page ids derived from order only
    - no final registration performed

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
  source_workflow: whole_xml_page_split_v0
  target_workflow: page_xml_normalize_spec_v0
  downstream_workflow: capture_xml_intake_library_v0
  preserved_invariants:
    - source order preserved
    - page ids stable and ordinal
    - source page XML not modified
    - no normalized review variant assumed
  provenance_notes:
    - downstream handoff uses sidecars, manifest, and compact summary only
    - raw XML and private project materials excluded

normalization_warnings:
  - titleblock page count signal conflicts with actual page nodes
  - page number signals are incomplete and non-contiguous
  - some pages have missing or non-public page number/count signals
  - material-context pages require review and must not trigger material collection
  - interface containers remain empty because connectivity is not confirmed
  - local internal labels are rationale hints only, not design truth
  - final asset registration is not performed here

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_payload:
    include:
      - page_module_spec_sidecars
      - module_spec_manifest
      - compact_downstream_handoff
    omit:
      - raw_xml
      - runtime_absolute_paths
      - credentials
      - private project material
      - generated workflow-package artifacts
  compact_downstream_handoff:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    page_count: 11
    page_order: preserved
    readiness: review_required
    notes:
      - intake should treat sidecars as derived calibration artifacts
      - no derivation from titleblock counts alone
      - preserve page ids page_001 through page_011

boundary_review:
  public_safe: true
  private_material_excluded: true
  workflow_package_excluded: true
  source_xml_mutation: not performed
  materials_collection: not performed
  mdd_attachment: not performed
  harness_composition: not performed
  final_asset_registration: false

open_questions:
  - Which pages, if any, should later receive optional derived review variants
  - Whether downstream intake wants any additional page-level rationale tags beyond the current review-required hints
  - Whether the non-contiguous page number pattern should be tracked as a separate normalization warning category
