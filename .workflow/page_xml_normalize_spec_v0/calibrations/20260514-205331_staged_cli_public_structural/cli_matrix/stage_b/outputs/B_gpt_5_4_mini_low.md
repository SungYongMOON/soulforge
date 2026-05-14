```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  fixture_type: public_safe_downstream_structural_metadata_from_prior_split_calibration
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: elf
    class: auditor

normalization_input_summary:
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  page_count: 11
  source_order_policy: preserve_ordinal_source_order
  stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  split_observations:
    titleblock_page_count_signal: "8"
    titleblock_signal_conflict: true
    non_contiguous_page_number_signals: true
    missing_or_ambiguous_page_nodes: 5
  normalization_constraints:
    preserve_source_page_xml: true
    rewrite_source_xml: false
    derive_review_variant_by_default: false
    annotation_variant_enabled: false
    project_local_only: true

page_module_spec_plan:
  output_form: one page_module_spec_v0.yaml sidecar per source page
  required_sidecar_blocks:
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
  blank_field_policy:
    normalized_page_ref: blank
    normalized_sha256: blank
  classification_policy:
    basis_is_rationale_not_truth: true
    semantic_claims_require_review: true
    unsupported_quantitative_values_stay_blank: true
  page_scope_note: treat each page as a review-required module-spec candidate, not a finalized library asset

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    registration_key: page_001
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_001
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: power entry/control candidate
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
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted power entry/control sheet signal
      basis_hint: connector-like and regulator-control labels visible; review required

  - source_page_id: page_002
    source_page_order: 2
    source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    registration_key: page_002
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_002
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: schematic page candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted schematic page signal
      basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_003
    source_page_order: 3
    source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    registration_key: page_003
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_003
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: dense schematic / repeated-block candidate
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
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted dense schematic page signal
      basis_hint: dense repeated blocks visible; possible channelization review required

  - source_page_id: page_004
    source_page_order: 4
    source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    registration_key: page_004
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_004
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: schematic page candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted schematic page signal
      basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_005
    source_page_order: 5
    source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    registration_key: page_005
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_005
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: schematic page candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted schematic page signal
      basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_006
    source_page_order: 6
    source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    registration_key: page_006
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_006
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: hardware/material context candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted hardware/material context signal
      basis_hint: material-context structural hints present; do not collect materials here

  - source_page_id: page_007
    source_page_order: 7
    source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    registration_key: page_007
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_007
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: hardware/material context candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted schematic page signal
      basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_008
    source_page_order: 8
    source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    registration_key: page_008
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_008
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: material-heavy schematic candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates:
        - PG
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted material-heavy page signal
      basis_hint: hardware/material context and PCB footprint signals present; review required

  - source_page_id: page_009
    source_page_order: 9
    source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    registration_key: page_009
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_009
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: schematic page candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted schematic page signal
      basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_010
    source_page_order: 10
    source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    registration_key: page_010
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_010
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: schematic page candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted schematic page signal
      basis_hint: visible evidence weak or generic; keep unknown/review_required

  - source_page_id: page_011
    source_page_order: 11
    source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
    registration_key: page_011
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_011
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      structural_scope: unknown
      review_classification: review_required
      function_hint: hardware/material context candidate
    interfaces:
      inputs: []
      outputs: []
      bidirectional: []
      passive_or_none: []
      local_internal_candidates: []
    performance:
      counts_present: true
      quantitative_claims_final: false
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      visible_label_hint: redacted schematic page signal
      basis_hint: visible evidence weak or generic; keep unknown/review_required

module_spec_manifest:
  manifest_type: page_module_spec_v0
  source_page_count: 11
  order_policy: preserve_source_page_order
  stable_ids:
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
  sidecar_targets:
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
  manifest_notes:
    - source_xml_assets_are_read_only
    - no_final_asset_registration_here
    - no_generated_artifacts_under_workflow_package

module_spec_index:
  page_001: { order: 1, source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90" }
  page_002: { order: 2, source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee" }
  page_003: { order: 3, source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc" }
  page_004: { order: 4, source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538" }
  page_005: { order: 5, source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9" }
  page_006: { order: 6, source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405" }
  page_007: { order: 7, source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870" }
  page_008: { order: 8, source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b" }
  page_009: { order: 9, source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227" }
  page_010: { order: 10, source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665" }
  page_011: { order: 11, source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3" }

provenance_update:
  source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
  upstream_chain: whole_xml_page_split_v0 -> page_xml_normalize_spec_v0 -> capture_xml_intake_library_v0
  provenance_status: derived_public_safe_structural_metadata_only
  updated_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  preservation_notes:
    - source order preserved
    - source page ids preserved
    - page XML treated as immutable input
    - review-only rationales kept separate from confirmed design truth

normalization_warnings:
  - titleblock page count signal conflicts with observed page nodes
  - page number signals are non-contiguous and partially missing
  - page identity must rely on ordinal source order, not titleblock numbering
  - classification and module scope remain review-required, not confirmed
  - material/property hints exist on some pages; do not collect materials here
  - local internal labels are hints only and must not be promoted to external interfaces
  - normalized_page_ref and normalized_sha256 remain blank by policy
  - no annotation variant is enabled by default
  - no final library asset registration is performed here

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  payload_items:
    - page_module_spec_sidecars
    - module_spec_manifest
    - downstream_handoff
  handoff_summary: pass page-ordered sidecars and manifest for intake-library review; preserve review-only uncertainty and blank normalized refs
  constraints:
    - no raw XML
    - no project-private material
    - no generated sidecars under workflow package
    - no final registration claim

boundary_review:
  public_safe: true
  private_material_present: false
  workflow_package_write_target: false
  source_xml_mutation: false
  raw_xml_included: false
  credentials_or_secrets_included: false
  notes:
    - output is derived structural metadata only
    - all claims are bounded to review-required rationale
    - public-safe calibration stays outside .workflow

open_questions:
  - Should the intake library treat pages with material-property signals as separate review buckets or keep them in the same page-module-spec stream?
  - Is there any project policy that later enables annotation_variant generation for this source family?
  - Should downstream intake attach a page-family label for the dense repeated-block region on page_003, or defer until evidence review?
  - Are there any additional public-safe labels available for stable external-facing module naming, or should names remain generic until review?
```