profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: medium
    species: elf
    class: auditor
  mode: public_safe_calibration_only

normalization_input_summary:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: "74195c6c62bdcf3f"
  root_element: Design
  page_boundary_node_family: Page
  source_page_count: 11
  stable_page_order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  split_policy_notes:
    - preserve_source_page_order: true
    - preserve_page_xml_without_normalization: true
    - duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
    - single_page_fallback_allowed: false
  titleblock_signals:
    page_count_reported: ["8"]
    page_number_signals: ["1", "2", "5", "6", "7", "8"]
    conflict_with_actual_page_nodes: true

page_module_spec_plan:
  output_form: one page_module_spec_v0.yaml sidecar per source page
  identity_policy:
    required_fields:
      - registration_key
      - source_system_id
      - source_page_id
      - source_page_order
      - source_page_ref
      - source_sha256
    normalized_page_ref: ""
    normalized_sha256: ""
  required_blocks:
    - identity
    - module_definition
    - interfaces
    - performance
    - composition
    - evidence_review
  required_interface_containers:
    - inputs
    - outputs
    - bidirectional
    - passive_or_none
  optional_interface_containers:
    - local_internal_candidates
  annotation_variant:
    enabled: false
    review_only: true
  scope_rules:
    - treat source page XML as immutable input
    - do not infer final library registration
    - keep classification and function hints as review-required rationale
    - keep local/internal labels separate from external interfaces
    - leave unsupported quantitative values blank unless explicitly evidenced

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; power-entry/control-like signal"
      interfaces: "containers present; external interface mapping tentative"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + offpage_connector_context + possible_pcb_context"
      evidence_review: "visible label hints suggest connector/regulator-control context; not confirmed"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: ["SW", "FB", "PG"]
  - source_page_id: page_002
    source_page_order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; schematic page"
      interfaces: "containers present; mapping unknown"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + offpage_connector_context + possible_pcb_context"
      evidence_review: "visible evidence weak or generic"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []
  - source_page_id: page_003
    source_page_order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; dense repeated-block schematic"
      interfaces: "containers present; channelization remains provisional"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + offpage_connector_context + possible_pcb_context"
      evidence_review: "dense repeated blocks visible; channelization requires review"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: ["FB", "SET", "VIOC"]
  - source_page_id: page_004
    source_page_order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; sparse schematic page"
      interfaces: "containers present; mapping unknown"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + offpage_connector_context + possible_pcb_context"
      evidence_review: "visible evidence weak or generic"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []
  - source_page_id: page_005
    source_page_order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; sparse schematic page"
      interfaces: "containers present; mapping unknown"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + offpage_connector_context + possible_pcb_context"
      evidence_review: "visible evidence weak or generic"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []
  - source_page_id: page_006
    source_page_order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; hardware/material-context page"
      interfaces: "containers present; no external-interface claim"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + hardware_or_material_context + possible_pcb_context"
      evidence_review: "material-context hints present; do not collect materials here"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []
  - source_page_id: page_007
    source_page_order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; hardware/material-context page"
      interfaces: "containers present; no external-interface claim"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + hardware_or_material_context + possible_pcb_context"
      evidence_review: "visible evidence weak or generic"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []
  - source_page_id: page_008
    source_page_order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; material-heavy page"
      interfaces: "containers present; mapping unknown"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + hardware_or_material_context + possible_pcb_context"
      evidence_review: "hardware/material context and PCB footprint signals present"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: ["PG"]
  - source_page_id: page_009
    source_page_order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; schematic page"
      interfaces: "containers present; mapping unknown"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + offpage_connector_context + possible_pcb_context"
      evidence_review: "visible evidence weak or generic"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []
  - source_page_id: page_010
    source_page_order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; schematic page"
      interfaces: "containers present; mapping unknown"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + offpage_connector_context + possible_pcb_context"
      evidence_review: "visible evidence weak or generic"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []
  - source_page_id: page_011
    source_page_order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    page_module_spec_v0:
      identity: "present"
      module_definition: "review_required; hardware/material-context page"
      interfaces: "containers present; no external-interface claim"
      performance: "blank unless explicitly supported"
      composition: "schematic_content + hardware_or_material_context + possible_pcb_context"
      evidence_review: "visible evidence weak or generic"
      interface_containers:
        inputs: "present"
        outputs: "present"
        bidirectional: "present"
        passive_or_none: "present"
        local_internal_candidates: []

module_spec_manifest:
  schema_version: page_module_spec_v0
  source_order_preserved: true
  entries:
    - page_001: { source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90" }
    - page_002: { source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee" }
    - page_003: { source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc" }
    - page_004: { source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538" }
    - page_005: { source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9" }
    - page_006: { source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405" }
    - page_007: { source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870" }
    - page_008: { source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b" }
    - page_009: { source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227" }
    - page_010: { source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665" }
    - page_011: { source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3" }

module_spec_index:
  page_001:
    source_page_order: 1
    source_page_ref: project_page_xml_asset.page_001
    status: review_required
  page_002:
    source_page_order: 2
    source_page_ref: project_page_xml_asset.page_002
    status: review_required
  page_003:
    source_page_order: 3
    source_page_ref: project_page_xml_asset.page_003
    status: review_required
  page_004:
    source_page_order: 4
    source_page_ref: project_page_xml_asset.page_004
    status: review_required
  page_005:
    source_page_order: 5
    source_page_ref: project_page_xml_asset.page_005
    status: review_required
  page_006:
    source_page_order: 6
    source_page_ref: project_page_xml_asset.page_006
    status: review_required
  page_007:
    source_page_order: 7
    source_page_ref: project_page_xml_asset.page_007
    status: review_required
  page_008:
    source_page_order: 8
    source_page_ref: project_page_xml_asset.page_008
    status: review_required
  page_009:
    source_page_order: 9
    source_page_ref: project_page_xml_asset.page_009
    status: review_required
  page_010:
    source_page_order: 10
    source_page_ref: project_page_xml_asset.page_010
    status: review_required
  page_011:
    source_page_order: 11
    source_page_ref: project_page_xml_asset.page_011
    status: review_required

provenance_update:
  upstream_preserved: true
  source_inputs_treated_as_immutable: true
  derived_artifacts_scope: public_safe_project_local_metadata_only
  mutation_performed: false
  normalization_performed: false
  registration_claimed: false
  note: "Sidecar/manifest/index metadata prepared from split summary only; no raw XML or private material used."

normalization_warnings:
  - "Titleblock page count signal reports 8, which conflicts with the actual 11 page nodes."
  - "Page-number signals are non-contiguous and incomplete; do not use them as identity."
  - "Pages 003, 006, 007, 008, and 011 lack stable public page-number signals."
  - "Pages with material-context hints are review-only; do not collect materials or assert composition."
  - "Classification, module scope, and channelization remain rationale-only and unconfirmed."
  - "normalized_page_ref and normalized_sha256 remain blank by policy."
  - "Annotation variant is disabled; no derived review XML is assumed."

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  payload:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index
    - compact_downstream_handoff
  compact_downstream_handoff:
    source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
    source_page_count: 11
    page_order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
    policy_summary:
      - preserve source order
      - treat source XML as immutable
      - keep review-required rationale separate from confirmed design truth
      - do not register final assets here
  handoff_constraints:
    - no raw XML
    - no materials collection
    - no harness composition
    - no final asset registration

boundary_review:
  public_safe_only: true
  project_local_only: true
  never_under_workflow_package: true
  source_xml_read_only: true
  private_material_excluded: true
  derived_outputs_are_metadata_only: true
  canonical_boundary_note: "This packet stays outside `.workflow/` and does not claim canonical registration."

open_questions:
  - "Should a later review enable annotation_variant for any page, or remain disabled for this workflow family?"
  - "Does capture_xml_intake_library_v0 want page-level review tags beyond review_required / unknown?"
  - "Should pages 003 and 008 be prioritized for channelization and material-context review due to higher structural density?"
