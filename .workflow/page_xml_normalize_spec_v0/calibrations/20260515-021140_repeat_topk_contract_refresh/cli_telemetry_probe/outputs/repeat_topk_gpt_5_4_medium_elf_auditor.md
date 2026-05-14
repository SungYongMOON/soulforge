profile_metadata:
  candidate_id: repeat_topk_gpt_5_4_medium_elf_auditor
  model: gpt-5.4
  reasoning_effort: medium
  species: elf
  class: auditor
  output_status: cli_telemetry_probe_no_files_written

normalization_input_summary:
  workflow_id: page_xml_normalize_spec_v0
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration_with_contract_refresh
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_safety:
    raw_xml_body_included: false
    runtime_absolute_path_included: false
    credentials_or_secret_material_included: false
    generated_project_outputs_included: false
  split_observations:
    root_element: Design
    page_boundary_node_family: Page
    page_count: 11
    titleblock_reported_count_values: [8]
    titleblock_count_conflicts_with_page_nodes: true
    present_page_number_values: [1, 2, 5, 6, 7, 8]
    missing_or_ambiguous_page_numbers: 5
    non_contiguous: true
    stable_page_id_policy: derive page_001..page_011 from source order, not titleblock count/number

page_module_spec_plan:
  schema: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  generation_mode: review_only_structural_normalization
  page_id_policy: preserve source order and source identities exactly
  annotation_variants_enabled: false
  review_defaults:
    semantic_claims_require_review: true
    harness_ready: false
    unsupported_quantitative_values_blank: true
    final_asset_registration_in_scope: false

page_module_spec_sidecars:
  required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - system_contract
    - composition
    - evidence_review
  pages:
    - page_id: page_001
      identity:
        registration_key: page_module_spec.page_001
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_001
        source_page_order: 1
        source_page_ref: project_page_xml_asset.page_001
        source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
      module_definition:
        module_name: unknown_review_required
        module_kind: schematic_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [SW, FB, PG]
        interface_groups: [offpage_connector_context, regulator_control_review_hint]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: source-backed enrichment absent }
      composition:
        structural_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted power entry/control sheet signal
        basis: connector-like and regulator-control labels visible; review required

    - page_id: page_002
      identity:
        registration_key: page_module_spec.page_002
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_002
        source_page_order: 2
        source_page_ref: project_page_xml_asset.page_002
        source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
      module_definition:
        module_name: unknown_review_required
        module_kind: schematic_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
        interface_groups: [offpage_connector_context]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: evidence generic and unenriched }
      composition:
        structural_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted schematic page signal
        basis: visible evidence weak or generic; keep unknown/review_required

    - page_id: page_003
      identity:
        registration_key: page_module_spec.page_003
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_003
        source_page_order: 3
        source_page_ref: project_page_xml_asset.page_003
        source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
      module_definition:
        module_name: unknown_review_required
        module_kind: schematic_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [FB, SET, VIOC]
        interface_groups: [possible_repeated_channel_review_hint]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: dense repeated structures need review }
      composition:
        structural_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted dense schematic page signal
        basis: dense repeated blocks visible; possible channelization review required

    - page_id: page_004
      identity:
        registration_key: page_module_spec.page_004
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_004
        source_page_order: 4
        source_page_ref: project_page_xml_asset.page_004
        source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
      module_definition:
        module_name: unknown_review_required
        module_kind: schematic_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
        interface_groups: [offpage_connector_context]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: evidence generic and unenriched }
      composition:
        structural_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted schematic page signal
        basis: visible evidence weak or generic; keep unknown/review_required

    - page_id: page_005
      identity:
        registration_key: page_module_spec.page_005
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_005
        source_page_order: 5
        source_page_ref: project_page_xml_asset.page_005
        source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
      module_definition:
        module_name: unknown_review_required
        module_kind: schematic_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
        interface_groups: [offpage_connector_context]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: evidence generic and unenriched }
      composition:
        structural_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted schematic page signal
        basis: visible evidence weak or generic; keep unknown/review_required

    - page_id: page_006
      identity:
        registration_key: page_module_spec.page_006
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_006
        source_page_order: 6
        source_page_ref: project_page_xml_asset.page_006
        source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
      module_definition:
        module_name: unknown_review_required
        module_kind: hardware_or_material_context_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: material-context page; no harness inference allowed }
      composition:
        structural_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted hardware/material context signal
        basis: material-context structural hints present; do not collect materials here

    - page_id: page_007
      identity:
        registration_key: page_module_spec.page_007
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_007
        source_page_order: 7
        source_page_ref: project_page_xml_asset.page_007
        source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
      module_definition:
        module_name: unknown_review_required
        module_kind: hardware_or_material_context_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: evidence generic and unenriched }
      composition:
        structural_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted schematic page signal
        basis: visible evidence weak or generic; keep unknown/review_required

    - page_id: page_008
      identity:
        registration_key: page_module_spec.page_008
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_008
        source_page_order: 8
        source_page_ref: project_page_xml_asset.page_008
        source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
      module_definition:
        module_name: unknown_review_required
        module_kind: material_heavy_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: [PG]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: hardware/material context; no external boundary confirmation }
      composition:
        structural_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted material-heavy page signal
        basis: hardware/material context and PCB footprint signals present; review required

    - page_id: page_009
      identity:
        registration_key: page_module_spec.page_009
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_009
        source_page_order: 9
        source_page_ref: project_page_xml_asset.page_009
        source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
      module_definition:
        module_name: unknown_review_required
        module_kind: schematic_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
        interface_groups: [offpage_connector_context]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: evidence generic and unenriched }
      composition:
        structural_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted schematic page signal
        basis: visible evidence weak or generic; keep unknown/review_required

    - page_id: page_010
      identity:
        registration_key: page_module_spec.page_010
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_010
        source_page_order: 10
        source_page_ref: project_page_xml_asset.page_010
        source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
      module_definition:
        module_name: unknown_review_required
        module_kind: schematic_page_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
        interface_groups: [offpage_connector_context]
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: evidence generic and unenriched }
      composition:
        structural_hints: [schematic_content, offpage_connector_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted schematic page signal
        basis: visible evidence weak or generic; keep unknown/review_required

    - page_id: page_011
      identity:
        registration_key: page_module_spec.page_011
        source_system_id: project_binding.whole_xml_source.sample_exp_capture_big_xml
        source_page_id: page_011
        source_page_order: 11
        source_page_ref: project_page_xml_asset.page_011
        source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
      module_definition:
        module_name: unknown_review_required
        module_kind: hardware_or_material_context_candidate
        status: review_required
      interfaces:
        inputs: []
        outputs: []
        bidirectional: []
        passive_or_none: []
        local_internal_candidates: []
      performance:
        quantitative_values_supported: false
        status: blank_pending_review
      system_contract:
        electrical_domains: { status: review_required }
        power_contract: { status: review_required }
        signal_contract: { status: review_required }
        readiness_contract: { harness_ready: false, status: not_ready, reason: evidence generic and unenriched }
      composition:
        structural_hints: [schematic_content, hardware_or_material_context, possible_pcb_context]
      evidence_review:
        visible_summary: redacted schematic page signal
        basis: visible evidence weak or generic; keep unknown/review_required

module_spec_manifest:
  schema: page_module_spec_v0
  page_count: 11
  entries:
    - { page_id: page_001, source_page_ref: project_page_xml_asset.page_001, source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90, status: review_required }
    - { page_id: page_002, source_page_ref: project_page_xml_asset.page_002, source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee, status: review_required }
    - { page_id: page_003, source_page_ref: project_page_xml_asset.page_003, source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc, status: review_required }
    - { page_id: page_004, source_page_ref: project_page_xml_asset.page_004, source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538, status: review_required }
    - { page_id: page_005, source_page_ref: project_page_xml_asset.page_005, source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9, status: review_required }
    - { page_id: page_006, source_page_ref: project_page_xml_asset.page_006, source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405, status: review_required }
    - { page_id: page_007, source_page_ref: project_page_xml_asset.page_007, source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870, status: review_required }
    - { page_id: page_008, source_page_ref: project_page_xml_asset.page_008, source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b, status: review_required }
    - { page_id: page_009, source_page_ref: project_page_xml_asset.page_009, source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227, status: review_required }
    - { page_id: page_010, source_page_ref: project_page_xml_asset.page_010, source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665, status: review_required }
    - { page_id: page_011, source_page_ref: project_page_xml_asset.page_011, source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3, status: review_required }

module_spec_index:
  registration_namespace: page_module_spec
  source_order_index:
    - { source_page_order: 1, source_page_id: page_001, source_page_ref: project_page_xml_asset.page_001 }
    - { source_page_order: 2, source_page_id: page_002, source_page_ref: project_page_xml_asset.page_002 }
    - { source_page_order: 3, source_page_id: page_003, source_page_ref: project_page_xml_asset.page_003 }
    - { source_page_order: 4, source_page_id: page_004, source_page_ref: project_page_xml_asset.page_004 }
    - { source_page_order: 5, source_page_id: page_005, source_page_ref: project_page_xml_asset.page_005 }
    - { source_page_order: 6, source_page_id: page_006, source_page_ref: project_page_xml_asset.page_006 }
    - { source_page_order: 7, source_page_id: page_007, source_page_ref: project_page_xml_asset.page_007 }
    - { source_page_order: 8, source_page_id: page_008, source_page_ref: project_page_xml_asset.page_008 }
    - { source_page_order: 9, source_page_id: page_009, source_page_ref: project_page_xml_asset.page_009 }
    - { source_page_order: 10, source_page_id: page_010, source_page_ref: project_page_xml_asset.page_010 }
    - { source_page_order: 11, source_page_id: page_011, source_page_ref: project_page_xml_asset.page_011 }

provenance_update:
  derived_from:
    workflow_id: whole_xml_page_split_v0
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    source_sha256_prefix: 74195c6c62bdcf3f
  preserved_invariants:
    - source_page_ids preserved
    - source_page_order preserved
    - source_page_refs preserved
    - source_sha256 values preserved
  omitted_fields_by_policy:
    - normalized_page_ref
    - normalized_sha256
    - annotation_variant
  output_character: project_local_derived_artifact_description_only

normalization_warnings:
  - titleblock reported page count values [8] conflict with actual 11 Page nodes
  - page number values are non-contiguous and incomplete; stable page ids must follow source order
  - semantic interface, power, and signal claims remain review-required across all pages
  - local labels are internal candidates only and must not be promoted to confirmed external interfaces
  - hardware/material-context pages must not trigger material collection or harness composition
  - no annotation variants included because they are disabled by default

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_status: ready_for_review_gated_intake
  handoff_payload_scope:
    - page_module_spec_v0 sidecar set
    - manifest/index with preserved source identities
    - review-required structural hints only
  execution_claim: not_executed_here

boundary_review:
  in_scope:
    - structural normalization of per-page module spec metadata
    - preservation of source identities, refs, order, and checksums
    - review-only hints for possible module and interface follow-up
  out_of_scope:
    - source XML mutation or rewrite
    - connectivity inference
    - material collection
    - MDD attachment
    - harness composition
    - final library registration
    - downstream workflow execution
  safety_posture:
    command_execution_claimed: false
    file_write_claimed: false
    repository_inspection_claimed: false
    xml_parse_claimed: false
    source_mutation_verification_claimed: false

open_questions:
  - Should any review-only interface_groups be retained for pages with weak evidence, or omitted entirely in stricter normalization mode?
  - Should pages 006-008 and 011 remain typed as generic candidates, or receive a dedicated non-harness material-context subtype in later enrichment?
  - Is there a preferred downstream review path for reconciling titleblock numbering conflict versus source-order page identity?