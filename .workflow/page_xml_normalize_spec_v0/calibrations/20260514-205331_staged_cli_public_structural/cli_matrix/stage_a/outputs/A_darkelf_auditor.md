profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  downstream_workflow: capture_xml_intake_library_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: darkelf
    class: auditor
  calibration_type: public_safe_structural_metadata_only
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"

normalization_input_summary:
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  source_order_policy: preserve_source_page_order
  stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  titleblock_signals:
    reported_page_count_values: ["8"]
    observed_on_page_nodes: 6
    conflicts_with_actual_page_nodes: true
    page_number_signal_summary:
      present_values: ["1", "2", "5", "6", "7", "8"]
      missing_or_ambiguous_page_nodes: 5
      non_contiguous: true
  preservation_rules:
    preserve_page_xml_without_normalization: true
    source_page_xml_mutation_allowed: false
    source_page_xml_body_rewrite_allowed: false

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  required_blocks: [identity, module_definition, interfaces, performance, composition, evidence_review]
  interface_containers: [inputs, outputs, bidirectional, passive_or_none]
  optional_interface_containers: [local_internal_candidates]
  per_page_policy:
    normalized_page_ref: blank
    normalized_sha256: blank
    annotation_variant_enabled: false
    semantic_claims_require_review: true
    classification_basis_records_rationale_not_truth: true
    local_internal_candidates_not_external_interfaces: true
    unsupported_quantitative_values_stay_blank: true
    final_asset_registration_done_here: false
  page_sequence:
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

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_001
      source_page_order: 1
      source_page_ref: project_page_xml_asset.page_001
      source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: possible power entry/control or schematic context
      rationale: connector-like and regulator-control labels visible; review required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [SW, FB, PG]
    performance:
      quantitative_claims: []
      density_notes: high element and wire count; no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 211
        net_scalar_count: 296
        wire_scalar_count: 856
        off_page_connector_count: 156
        pcb_footprint_signal_count: 211
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted power entry/control sheet signal
      classification_basis_hint: connector-like and regulator-control labels visible; review required

  - source_page_id: page_002
    source_page_order: 2
    source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_002
      source_page_order: 2
      source_page_ref: project_page_xml_asset.page_002
      source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: schematic content
      rationale: visible evidence weak or generic; keep unknown/review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 211
        net_scalar_count: 296
        wire_scalar_count: 851
        off_page_connector_count: 155
        pcb_footprint_signal_count: 211
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_003
    source_page_order: 3
    source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_003
      source_page_order: 3
      source_page_ref: project_page_xml_asset.page_003
      source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: dense schematic block
      rationale: dense repeated blocks visible; possible channelization review required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [FB, SET, VIOC]
    performance:
      quantitative_claims: []
      density_notes: dense structural page; no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 464
        net_scalar_count: 260
        wire_scalar_count: 1689
        off_page_connector_count: 36
        pcb_footprint_signal_count: 464
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted dense schematic page signal
      classification_basis_hint: dense repeated blocks visible; possible channelization review required

  - source_page_id: page_004
    source_page_order: 4
    source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_004
      source_page_order: 4
      source_page_ref: project_page_xml_asset.page_004
      source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: schematic content
      rationale: visible evidence weak or generic; keep unknown/review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 11
        net_scalar_count: 58
        wire_scalar_count: 99
        off_page_connector_count: 81
        pcb_footprint_signal_count: 11
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_005
    source_page_order: 5
    source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_005
      source_page_order: 5
      source_page_ref: project_page_xml_asset.page_005
      source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: schematic content
      rationale: visible evidence weak or generic; keep unknown/review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 24
        net_scalar_count: 51
        wire_scalar_count: 132
        off_page_connector_count: 45
        pcb_footprint_signal_count: 24
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_006
    source_page_order: 6
    source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_006
      source_page_order: 6
      source_page_ref: project_page_xml_asset.page_006
      source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: hardware or material context
      rationale: material-context structural hints present; do not collect materials here
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: material property signals present; no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 11
        net_scalar_count: 10
        wire_scalar_count: 50
        off_page_connector_count: 0
        material_property_signal_count: 3
        pcb_footprint_signal_count: 11
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted hardware/material context signal
      classification_basis_hint: material-context structural hints present; do not collect materials here

  - source_page_id: page_007
    source_page_order: 7
    source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_007
      source_page_order: 7
      source_page_ref: project_page_xml_asset.page_007
      source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: hardware or material context
      rationale: visible evidence weak or generic; keep unknown/review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: material property signals present; no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 12
        net_scalar_count: 10
        wire_scalar_count: 56
        off_page_connector_count: 0
        material_property_signal_count: 3
        pcb_footprint_signal_count: 12
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_008
    source_page_order: 8
    source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_008
      source_page_order: 8
      source_page_ref: project_page_xml_asset.page_008
      source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: hardware or material context
      rationale: hardware/material context and PCB footprint signals present; review required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [PG]
    performance:
      quantitative_claims: []
      density_notes: material-heavy page; no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 39
        net_scalar_count: 19
        wire_scalar_count: 123
        off_page_connector_count: 0
        material_property_signal_count: 39
        pcb_footprint_signal_count: 39
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted material-heavy page signal
      classification_basis_hint: hardware/material context and PCB footprint signals present; review required

  - source_page_id: page_009
    source_page_order: 9
    source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_009
      source_page_order: 9
      source_page_ref: project_page_xml_asset.page_009
      source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: schematic content
      rationale: visible evidence weak or generic; keep unknown/review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 58
        net_scalar_count: 39
        wire_scalar_count: 220
        off_page_connector_count: 23
        pcb_footprint_signal_count: 58
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_010
    source_page_order: 10
    source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_010
      source_page_order: 10
      source_page_ref: project_page_xml_asset.page_010
      source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: schematic content
      rationale: visible evidence weak or generic; keep unknown/review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 10
        net_scalar_count: 102
        wire_scalar_count: 237
        off_page_connector_count: 42
        pcb_footprint_signal_count: 10
    evidence_review:
      source_label_signal: present_redacted
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_011
    source_page_order: 11
    source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
    identity:
      registration_key: review_required
      source_system_id: project_page_xml_asset
      source_page_id: page_011
      source_page_order: 11
      source_page_ref: project_page_xml_asset.page_011
      source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
      normalized_page_ref: ""
      normalized_sha256: ""
    module_definition:
      scope: unknown
      classification: review_required
      function_hint: hardware or material context
      rationale: visible evidence weak or generic; keep unknown/review_required
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      quantitative_claims: []
      density_notes: material property signals present; no confirmed performance spec
    composition:
      page_role_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      structural_counts:
        part_inst_count: 16
        net_scalar_count: 12
        wire_scalar_count: 65
        off_page_connector_count: 0
        material_property_signal_count: 3
        pcb_footprint_signal_count: 16
    evidence_review:
      source_label_signal: missing_or_not_public
      visible_label_hint: redacted schematic page signal
      classification_basis_hint: visible evidence weak or generic; keep unknown/review_required

module_spec_manifest:
  manifest_type: page_module_spec_v0
  source_page_order_preserved: true
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
  manifest_notes:
    - one sidecar per source page
    - source XML treated as immutable read-only input
    - no final asset registration performed here
    - no derived review variant assumed

module_spec_index:
  by_page_id:
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
  ordering: source_page_order_ascending
  lookup_policy: stable_page_id_and_checksum

provenance_update:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  derived_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
    - downstream_handoff
  provenance_notes:
    - public-safe structural metadata only
    - no raw page XML included
    - no runtime absolute paths included
    - no credentials, cookies, or project-private material included

normalization_warnings:
  - titleblock page count signal conflicts with actual page node count
  - page number signals are incomplete and non-contiguous
  - pages 003, 006, 007, 008, and 011 have missing or non-public page number/page count signals
  - classification and module scope remain review-required, not confirmed
  - material-context signals appear on pages 006, 007, 008, and 011; do not infer materials collection
  - local internal label examples are hints only and must not be treated as external interfaces

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_packet:
    included: [page_module_spec_sidecars, module_spec_manifest, module_spec_index]
    compact_context:
      source_page_count: 11
      stable_page_ids_preserved: true
      review_required_scope: true
      annotation_variant_enabled: false
      normalized_refs_blank: true
    constraints:
      - preserve source order
      - keep source XML immutable
      - do not collect materials
      - do not attach MDD files
      - do not compose a harness
      - do not claim final library asset registration

boundary_review:
  public_safe: true
  project_local_only: true
  workflow_tree_exclusion: true
  no_raw_xml: true
  no_secret_material: true
  no_private_repo_material: true
  no_runtime_absolute_paths: true
  no_generated_project_output_payloads: true
  canon_boundary_observed: true

open_questions:
  - Which pages, if any, should be promoted later from review_required to confirmed module scope after a separate evidence-backed intake pass?
  - Should a future run enable annotation variants for review-only comparison, or remain disabled by default?
  - Are the material-context pages intended to remain excluded from materials collection and treated only as structural hints?
