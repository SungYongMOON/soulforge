```yaml
profile_metadata:
  candidate_id: repeat_topk_gpt_5_5_xhigh_elf_auditor
  model: gpt-5.5
  reasoning_effort: xhigh
  species: elf
  class: auditor
  output_status: cli_telemetry_probe_no_files_written

normalization_input_summary:
  workflow_id: page_xml_normalize_spec_v0
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration_with_contract_refresh
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  upstream_workflow: whole_xml_page_split_v0
  raw_xml_body_included: false
  runtime_absolute_path_included: false
  credentials_or_secret_material_included: false
  generated_project_outputs_included: false
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  stable_page_id_policy: derive page_001..page_011 from source order, not titleblock count or page number

page_module_spec_plan:
  schema: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  annotation_variants_enabled: false
  normalized_page_ref: null
  normalized_sha256: null
  required_sidecar_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - system_contract
    - composition
    - evidence_review
  constraints:
    semantic_claims_require_review: true
    local_internal_candidates_are_external_interfaces: false
    harness_ready_default: false
    unsupported_quantitative_values: blank
    source_xml_mutation_allowed: false
    final_asset_registration_in_scope: false

page_module_spec_sidecars:
  - identity:
      registration_key: page_001
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_001
      source_page_order: 1
      source_page_ref: project_page_xml_asset.page_001
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    module_definition:
      status: review_required
      evidence_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      visible_summary: redacted power entry/control sheet signal
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [SW, FB, PG]
      interface_groups: []
    performance:
      part_count: 211
      net_count: 296
      wire_count: 856
      offpage_count: 156
      material_signal_count: 0
      pcb_signal_count: 211
      quantitative_claims_supported: false
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: review_required, reason: possible power entry/control evidence, not connectivity-backed }
      signal_contract: { status: review_required, reason: offpage context present but boundaries unconfirmed }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition:
      parent_workflow: whole_xml_page_split_v0
      downstream_candidate: capture_xml_intake_library_v0
      source_order_preserved: true
    evidence_review:
      page_number_values: [1]
      titleblock_count_values: [8]
      basis: connector-like and regulator-control labels visible; review required

  - identity:
      registration_key: page_002
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_002
      source_page_order: 2
      source_page_ref: project_page_xml_asset.page_002
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    module_definition:
      status: review_required
      evidence_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      visible_summary: redacted schematic page signal
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
      interface_groups: []
    performance:
      part_count: 211
      net_count: 296
      wire_count: 851
      offpage_count: 155
      material_signal_count: 0
      pcb_signal_count: 211
      quantitative_claims_supported: false
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: review_required, reason: offpage context present but boundaries unconfirmed }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition:
      parent_workflow: whole_xml_page_split_v0
      downstream_candidate: capture_xml_intake_library_v0
      source_order_preserved: true
    evidence_review:
      page_number_values: [2]
      titleblock_count_values: [8]
      basis: visible evidence weak or generic; keep unknown/review_required

  - identity:
      registration_key: page_003
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_003
      source_page_order: 3
      source_page_ref: project_page_xml_asset.page_003
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    module_definition:
      status: review_required
      evidence_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      visible_summary: redacted dense schematic page signal
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: [FB, SET, VIOC]
      interface_groups: []
    performance:
      part_count: 464
      net_count: 260
      wire_count: 1689
      offpage_count: 36
      material_signal_count: 0
      pcb_signal_count: 464
      quantitative_claims_supported: false
    system_contract:
      electrical_domains: { status: review_required, reason: dense repeated structural blocks visible }
      power_contract: { status: review_required, reason: possible channelized control labels, not connectivity-backed }
      signal_contract: { status: review_required, reason: offpage context present but boundaries unconfirmed }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition:
      parent_workflow: whole_xml_page_split_v0
      downstream_candidate: capture_xml_intake_library_v0
      source_order_preserved: true
    evidence_review:
      page_number_values: [missing_or_not_public]
      titleblock_count_values: [missing_or_not_public]
      basis: dense repeated blocks visible; possible channelization review required

  - identity:
      registration_key: page_004
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_004
      source_page_order: 4
      source_page_ref: project_page_xml_asset.page_004
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    module_definition:
      status: review_required
      evidence_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      visible_summary: redacted schematic page signal
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [], interface_groups: [] }
    performance: { part_count: 11, net_count: 58, wire_count: 99, offpage_count: 81, material_signal_count: 0, pcb_signal_count: 11, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: review_required, reason: offpage context present but boundaries unconfirmed }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [5], titleblock_count_values: [8], basis: visible evidence weak or generic; keep unknown/review_required }

  - identity:
      registration_key: page_005
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_005
      source_page_order: 5
      source_page_ref: project_page_xml_asset.page_005
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    module_definition: { status: review_required, evidence_hints: [schematic_content, offpage_connector_context, possible_pcb_context], visible_summary: redacted schematic page signal }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [], interface_groups: [] }
    performance: { part_count: 24, net_count: 51, wire_count: 132, offpage_count: 45, material_signal_count: 0, pcb_signal_count: 24, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: review_required, reason: offpage context present but boundaries unconfirmed }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [6], titleblock_count_values: [8], basis: visible evidence weak or generic; keep unknown/review_required }

  - identity:
      registration_key: page_006
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_006
      source_page_order: 6
      source_page_ref: project_page_xml_asset.page_006
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    module_definition: { status: review_required, evidence_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], visible_summary: redacted hardware/material context signal }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [], interface_groups: [] }
    performance: { part_count: 11, net_count: 10, wire_count: 50, offpage_count: 0, material_signal_count: 3, pcb_signal_count: 11, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: hardware/material context only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: unknown, reason: no offpage context and no inferred connectivity }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [missing_or_not_public], titleblock_count_values: [missing_or_not_public], basis: material-context structural hints present; do not collect materials here }

  - identity:
      registration_key: page_007
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_007
      source_page_order: 7
      source_page_ref: project_page_xml_asset.page_007
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    module_definition: { status: review_required, evidence_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], visible_summary: redacted schematic page signal }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [], interface_groups: [] }
    performance: { part_count: 12, net_count: 10, wire_count: 56, offpage_count: 0, material_signal_count: 3, pcb_signal_count: 12, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: unknown, reason: no offpage context and no inferred connectivity }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [missing_or_not_public], titleblock_count_values: [missing_or_not_public], basis: visible evidence weak or generic; keep unknown/review_required }

  - identity:
      registration_key: page_008
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_008
      source_page_order: 8
      source_page_ref: project_page_xml_asset.page_008
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    module_definition: { status: review_required, evidence_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], visible_summary: redacted material-heavy page signal }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [PG], interface_groups: [] }
    performance: { part_count: 39, net_count: 19, wire_count: 123, offpage_count: 0, material_signal_count: 39, pcb_signal_count: 39, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: material-heavy context and PCB footprint signals present }
      power_contract: { status: review_required, reason: local PG candidate requires review and is not externalized }
      signal_contract: { status: unknown, reason: no offpage context and no inferred connectivity }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [missing_or_not_public], titleblock_count_values: [missing_or_not_public], basis: hardware/material context and PCB footprint signals present; review required }

  - identity:
      registration_key: page_009
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_009
      source_page_order: 9
      source_page_ref: project_page_xml_asset.page_009
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    module_definition: { status: review_required, evidence_hints: [schematic_content, offpage_connector_context, possible_pcb_context], visible_summary: redacted schematic page signal }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [], interface_groups: [] }
    performance: { part_count: 58, net_count: 39, wire_count: 220, offpage_count: 23, material_signal_count: 0, pcb_signal_count: 58, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: review_required, reason: offpage context present but boundaries unconfirmed }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [7], titleblock_count_values: [8], basis: visible evidence weak or generic; keep unknown/review_required }

  - identity:
      registration_key: page_010
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_010
      source_page_order: 10
      source_page_ref: project_page_xml_asset.page_010
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    module_definition: { status: review_required, evidence_hints: [schematic_content, offpage_connector_context, possible_pcb_context], visible_summary: redacted schematic page signal }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [], interface_groups: [] }
    performance: { part_count: 10, net_count: 102, wire_count: 237, offpage_count: 42, material_signal_count: 0, pcb_signal_count: 10, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: review_required, reason: offpage context present but boundaries unconfirmed }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [8], titleblock_count_values: [8], basis: visible evidence weak or generic; keep unknown/review_required }

  - identity:
      registration_key: page_011
      source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
      source_page_id: page_011
      source_page_order: 11
      source_page_ref: project_page_xml_asset.page_011
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    module_definition: { status: review_required, evidence_hints: [schematic_content, hardware_or_material_context, possible_pcb_context], visible_summary: redacted schematic page signal }
    interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [], interface_groups: [] }
    performance: { part_count: 16, net_count: 12, wire_count: 65, offpage_count: 0, material_signal_count: 3, pcb_signal_count: 16, quantitative_claims_supported: false }
    system_contract:
      electrical_domains: { status: review_required, reason: redacted structural hints only }
      power_contract: { status: unknown, reason: no source-backed enrichment }
      signal_contract: { status: unknown, reason: no offpage context and no inferred connectivity }
      readiness_contract: { harness_ready: false, reason: source-backed enrichment not present }
    composition: { parent_workflow: whole_xml_page_split_v0, downstream_candidate: capture_xml_intake_library_v0, source_order_preserved: true }
    evidence_review: { page_number_values: [missing_or_not_public], titleblock_count_values: [missing_or_not_public], basis: visible evidence weak or generic; keep unknown/review_required }

module_spec_manifest:
  schema: page_module_spec_v0
  sidecar_count: 11
  artifact_scope: project_local_derived_artifacts
  workflow_project_outputs: false
  annotation_variants:
    enabled: false
    review_only_when_enabled: true
  source_identity_preserved: true

module_spec_index:
  - { source_page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90 }
  - { source_page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee }
  - { source_page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc }
  - { source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538 }
  - { source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9 }
  - { source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405 }
  - { source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870 }
  - { source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b }
  - { source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227 }
  - { source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665 }
  - { source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3 }

provenance_update:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  derived_from_upstream_workflow: whole_xml_page_split_v0
  source_page_ids_preserved: true
  source_page_order_preserved: true
  source_refs_preserved: true
  source_sha256_preserved: true
  source_xml_mutated: false
  actual_files_written: false

normalization_warnings:
  - titleblock reported count values [8] on 6 nodes conflict with actual 11 Page nodes
  - present page number values are non-contiguous: [1, 2, 5, 6, 7, 8]
  - 5 page number values are missing or ambiguous
  - stable page ids must follow source order page_001 through page_011
  - external interface boundaries remain unconfirmed
  - local_internal_candidates are review hints, not confirmed external interfaces
  - annotation variants disabled; normalized_page_ref and normalized_sha256 remain null or omitted
  - material-context pages are not material collection outputs

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  execution_claimed: false
  handoff_status: prepared_for_project_local_runner
  handoff_scope:
    - page_module_spec_v0 sidecar metadata
    - preserved source identities
    - review-required interface and system contract hints
  excluded:
    - source XML rewrite
    - connectivity inference
    - material collection
    - MDD attachment
    - harness composition
    - final library registration

boundary_review:
  public_safe_only: true
  raw_xml_included: false
  runtime_absolute_paths_included: false
  credentials_or_secret_material_included: false
  generated_project_output_payloads_included: false
  private_project_inspection_claimed: false
  command_execution_claimed: false
  file_creation_claimed: false
  xml_parsing_claimed: false
  harness_ready_any_page: false

open_questions:
  - Which page-level semantic roles, if any, should be confirmed by source-backed enrichment?
  - Should annotation variants be explicitly enabled for review-only project-local derived artifacts?
  - Which offpage connector groups are real harness boundaries after approved source review?
```