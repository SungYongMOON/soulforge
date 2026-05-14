```yaml
profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: orc
    class: administrator
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  output_mode: public_safe_structural_metadata_only
  notes:
    - "Source page XML treated as immutable read-only input."
    - "Annotation variants disabled by default."
    - "No material collection, harness composition, or final asset registration."

normalization_input_summary:
  root_element: Design
  page_boundary_node_family: Page
  page_count: 11
  stable_page_id_policy: "derive page_001..page_011 from source order; do not trust titleblock page count/number as complete identity"
  split_policy:
    preserve_source_page_order: true
    preserve_page_xml_without_normalization: true
    duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
    single_page_fallback_allowed: false
  page_identity_mode: "source-order stable IDs with checksum binding"
  titleblock_signal_conflict: true
  page_number_signal_summary:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true
  page_count_signal_summary:
    reported_count_values: ["8"]
    observed_on_page_nodes: 6
    conflicts_with_actual_page_nodes: true

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
  optional_blocks:
    - annotation_variant
  identity_fields:
    - registration_key
    - source_system_id
    - source_page_id
    - source_page_order
    - source_page_ref
    - source_sha256
  interface_containers_required:
    - inputs
    - outputs
    - bidirectional
    - passive_or_none
  optional_interface_containers:
    - local_internal_candidates
  normalization_rules:
    normalized_page_ref: ""
    normalized_sha256: ""
    structural_scope_default: unknown
    semantic_claims_require_review: true
    classification_basis_records_rationale_not_truth: true
    local_internal_candidates_not_external_interfaces: true
    unsupported_quantitative_values_stay_blank: true
    final_asset_registration_done_here: false

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    registration_key: "page_001@1a3da91ab0a283e2"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_001
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic content with connector/context heavy structure"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates:
        - SW
        - FB
        - PG
    performance:
      structural_complexity: high
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "connector-like and regulator-control labels visible; review required"
      visible_label_hint: "redacted power entry/control sheet signal"

  - source_page_id: page_002
    source_page_order: 2
    source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    registration_key: "page_002@4a18c884f36bedab"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_002
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic content with weak visible evidence"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: high
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "visible evidence weak or generic; keep unknown/review_required"
      visible_label_hint: "redacted schematic page signal"

  - source_page_id: page_003
    source_page_order: 3
    source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    registration_key: "page_003@f355dc8f26a38429"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_003
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "dense schematic content; possible channelization"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates:
        - FB
        - SET
        - VIOC
    performance:
      structural_complexity: very_high
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "dense repeated blocks visible; possible channelization review required"
      visible_label_hint: "redacted dense schematic page signal"

  - source_page_id: page_004
    source_page_order: 4
    source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    registration_key: "page_004@2760adf758d9d3c3"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_004
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic content with weak visible evidence"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: moderate
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "visible evidence weak or generic; keep unknown/review_required"
      visible_label_hint: "redacted schematic page signal"

  - source_page_id: page_005
    source_page_order: 5
    source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    registration_key: "page_005@c3d237934d816560"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_005
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic content with weak visible evidence"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: moderate
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "visible evidence weak or generic; keep unknown/review_required"
      visible_label_hint: "redacted schematic page signal"

  - source_page_id: page_006
    source_page_order: 6
    source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    registration_key: "page_006@311a9d421ed1e7bd"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_006
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic page with hardware/material context signal"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: low
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "material-context structural hints present; do not collect materials here"
      visible_label_hint: "redacted hardware/material context signal"

  - source_page_id: page_007
    source_page_order: 7
    source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    registration_key: "page_007@19728e0aff41acc3"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_007
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic page with hardware/material context signal"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: low
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "visible evidence weak or generic; keep unknown/review_required"
      visible_label_hint: "redacted schematic page signal"

  - source_page_id: page_008
    source_page_order: 8
    source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    registration_key: "page_008@34e41c5eb8d9a278"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_008
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic page with material-heavy context"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates:
        - PG
    performance:
      structural_complexity: moderate
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "hardware/material context and PCB footprint signals present; review required"
      visible_label_hint: "redacted material-heavy page signal"

  - source_page_id: page_009
    source_page_order: 9
    source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    registration_key: "page_009@e6a6a20dd485f62c"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_009
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic content with weak visible evidence"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: moderate
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "visible evidence weak or generic; keep unknown/review_required"
      visible_label_hint: "redacted schematic page signal"

  - source_page_id: page_010
    source_page_order: 10
    source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    registration_key: "page_010@1d4a28f3140bf1b2"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_010
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic content with weak visible evidence"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: moderate
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - offpage_connector_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "visible evidence weak or generic; keep unknown/review_required"
      visible_label_hint: "redacted schematic page signal"

  - source_page_id: page_011
    source_page_order: 11
    source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
    registration_key: "page_011@fb360e4fe37cb704"
    source_system_id: project_page_xml_asset
    source_page_ref: project_page_xml_asset.page_011
    normalized_page_ref: ""
    normalized_sha256: ""
    module_definition:
      scope: review_required
      channelization: review_required
      function_hint: "schematic page with hardware/material context signal"
    interfaces:
      inputs: {}
      outputs: {}
      bidirectional: {}
      passive_or_none: {}
      local_internal_candidates: []
    performance:
      structural_complexity: low
      quantitative_claims: blank
    composition:
      page_role_hints:
        - schematic_content
        - hardware_or_material_context
        - possible_pcb_context
    evidence_review:
      classification_basis: "visible evidence weak or generic; keep unknown/review_required"
      visible_label_hint: "redacted schematic page signal"

module_spec_manifest:
  schema_version: page_module_spec_v0
  source_order_preserved: true
  page_count: 11
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
  checksum_binding:
    page_001: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
    page_002: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
    page_003: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
    page_004: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
    page_005: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
    page_006: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
    page_007: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
    page_008: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
    page_009: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
    page_010: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
    page_011: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
  manifest_warnings:
    - "Titleblock page count signal conflicts with actual page nodes."
    - "Page numbering is non-contiguous and partially missing/ambiguous."
    - "Keep page order authoritative over displayed page numbers."
  output_scope:
    project_local_only: true
    never_under_workflow_package: true
    source_xml_mutation_allowed: false

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
  lookup_notes:
    - "Index is source-order stable, not page-number driven."
    - "Blank normalized refs are intentional unless a review variant is explicitly enabled."

provenance_update:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  provenance_state:
    source_fixture_ref: whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json
    raw_xml_body_included: false
    generated_project_outputs_included: false
    runtime_absolute_path_included: false
  carried_forward_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
  excluded_artifacts:
    - raw_xml
    - mdd
    - harness
    - final asset registration
  update_note: "Stable per-page spec sidecars derived from source-order pages with checksum binding and review-only classification placeholders."

normalization_warnings:
  - "Titleblock Page Count signal reports 8, but 11 source pages are present."
  - "Page number signals are non-contiguous and partially missing."
  - "Several pages only support review-required scope; do not treat labels as confirmed design truth."
  - "Material/property signals appear on some pages; do not collect materials or infer procurement relevance here."
  - "No normalized review XML variant is assumed; normalized refs remain blank."
  - "Source page XML must remain immutable."

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_packet:
    includes:
      - page_module_spec_sidecars
      - module_spec_manifest
      - compact_downstream_handoff
    compact_downstream_handoff:
      source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
      page_count: 11
      stable_page_ids: true
      checksum_bound: true
      review_required_default: true
      annotation_variant_enabled: false
      normalized_refs_blank: true
  handoff_constraints:
    - "Do not add materials, MDD attachments, or harnesses."
    - "Treat page_module_spec_v0.yaml sidecars as the intake boundary artifact."
    - "Preserve source order and page identity exactly."

boundary_review:
  public_safe: true
  private_material_excluded: true
  no_secret_material: true
  no_project_private_paths: true
  no_raw_xml_included: true
  no_mutation_claimed: true
  canon_boundary_respected:
    - ".workflow not used as output surface"
    - "project-local derived artifacts only"
    - "source XML treated as read-only"
  registration_boundary:
    final_asset_registration_done_here: false
    final_library_asset_claimed: false

open_questions:
  - "Should a review-only annotation variant ever be enabled for this fixture, or remain disabled by policy?"
  - "Should pages with hardware/material signals be mapped to a separate review channel in downstream intake, or kept in the same generic intake lane?"
  - "Is there any project-local convention for leaving `module_definition.scope` as `review_required` versus `unknown` when evidence is weak but structured?"
```