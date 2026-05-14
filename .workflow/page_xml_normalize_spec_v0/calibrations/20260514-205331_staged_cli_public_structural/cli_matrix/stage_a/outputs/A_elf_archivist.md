1. `profile_metadata`
```yaml
workflow_id: page_xml_normalize_spec_v0
downstream_workflow: capture_xml_intake_library_v0
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: elf
  class: archivist
mode: public_safe_structural_metadata_only
source_policy:
  preserve_source_page_order: true
  stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  source_inputs_read_only: true
  raw_xml_included: false
  annotation_variant_enabled: false
```

2. `normalization_input_summary`
```yaml
source_root: Design
page_boundary_node_family: Page
page_count: 11
split_integrity:
  titleblock_page_count_signal: ["8"]
  observed_titleblock_page_nodes: 6
  conflict_with_actual_page_nodes: true
  page_number_signal_summary:
    present_values: ["1", "2", "5", "6", "7", "8"]
    missing_or_ambiguous_page_nodes: 5
    non_contiguous: true
policy_summary:
  preserve_page_xml_without_normalization: true
  do_not_trust_titleblock_page_count_or_number_as_complete_identity: true
  derive_stable_page_ids_from_source_order: true
  duplicate_or_missing_label_policy: ordinal_suffix_and_manifest_warning
```

3. `page_module_spec_plan`
```yaml
primary_output: page_module_spec_v0.yaml
scope: one sidecar per source page
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
required_blocks:
  - identity
  - module_definition
  - interfaces
  - performance
  - composition
  - evidence_review
identity_rules:
  source_page_id_required: true
  source_page_order_required: true
  source_page_ref_required: true
  source_sha256_required: true
  normalized_page_ref_blank_by_default: true
  normalized_sha256_blank_by_default: true
classification_rules:
  semantic_claims_require_review: true
  structural_scope_default: unknown
  classification_basis_records_rationale_not_truth: true
```

4. `page_module_spec_sidecars`
```yaml
pages:
  - source_page_id: page_001
    source_page_order: 1
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    role_hint: [schematic_content, offpage_connector_context, possible_pcb_context]
    labels: {source_label_signal: present_redacted, page_number_signals: ["1"], page_count_signals: ["8"]}
    interface_note: local/internal candidates likely present; external interfaces review-required
  - source_page_id: page_002
    source_page_order: 2
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    role_hint: [schematic_content, offpage_connector_context, possible_pcb_context]
    labels: {source_label_signal: present_redacted, page_number_signals: ["2"], page_count_signals: ["8"]}
  - source_page_id: page_003
    source_page_order: 3
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    role_hint: [schematic_content, offpage_connector_context, possible_pcb_context]
    labels: {source_label_signal: present_redacted, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"]}
  - source_page_id: page_004
    source_page_order: 4
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    role_hint: [schematic_content, offpage_connector_context, possible_pcb_context]
    labels: {source_label_signal: present_redacted, page_number_signals: ["5"], page_count_signals: ["8"]}
  - source_page_id: page_005
    source_page_order: 5
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    role_hint: [schematic_content, offpage_connector_context, possible_pcb_context]
    labels: {source_label_signal: present_redacted, page_number_signals: ["6"], page_count_signals: ["8"]}
  - source_page_id: page_006
    source_page_order: 6
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    role_hint: [schematic_content, hardware_or_material_context, possible_pcb_context]
    labels: {source_label_signal: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"]}
  - source_page_id: page_007
    source_page_order: 7
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    role_hint: [schematic_content, hardware_or_material_context, possible_pcb_context]
    labels: {source_label_signal: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"]}
  - source_page_id: page_008
    source_page_order: 8
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    role_hint: [schematic_content, hardware_or_material_context, possible_pcb_context]
    labels: {source_label_signal: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"]}
  - source_page_id: page_009
    source_page_order: 9
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    role_hint: [schematic_content, offpage_connector_context, possible_pcb_context]
    labels: {source_label_signal: present_redacted, page_number_signals: ["7"], page_count_signals: ["8"]}
  - source_page_id: page_010
    source_page_order: 10
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    role_hint: [schematic_content, offpage_connector_context, possible_pcb_context]
    labels: {source_label_signal: present_redacted, page_number_signals: ["8"], page_count_signals: ["8"]}
  - source_page_id: page_011
    source_page_order: 11
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    role_hint: [schematic_content, hardware_or_material_context, possible_pcb_context]
    labels: {source_label_signal: missing_or_not_public, page_number_signals: ["missing_or_not_public"], page_count_signals: ["missing_or_not_public"]}
```

5. `module_spec_manifest`
```yaml
manifest_version: page_module_spec_v0
source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
source_sha256_prefix: 74195c6c62bdcf3f
page_count: 11
artifact_set:
  sidecars:
    item_name: page_module_spec_v0.yaml
    count: 11
  derived_variants:
    enabled: false
    count: 0
registration_status:
  final_asset_registration_done_here: false
  library_capture: pending downstream handoff
ordering_policy:
  preserve_source_page_order: true
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
warnings_present: true
```

6. `module_spec_index`
```yaml
index_by_page_id:
  page_001: {order: 1, sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90}
  page_002: {order: 2, sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee}
  page_003: {order: 3, sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc}
  page_004: {order: 4, sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538}
  page_005: {order: 5, sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9}
  page_006: {order: 6, sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405}
  page_007: {order: 7, sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870}
  page_008: {order: 8, sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b}
  page_009: {order: 9, sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227}
  page_010: {order: 10, sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665}
  page_011: {order: 11, sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3}
index_notes:
  stable_ids_derived_from_source_order: true
  titleblock_page_signals_not_used_as_identity: true
  page_number_signals_non_contiguous: true
```

7. `provenance_update`
```yaml
provenance_state: downstream_structural_metadata_ready
lineage:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  source_fixture_ref: public_safe_downstream_structural_metadata_from_prior_split_calibration
  raw_xml_body_included: false
  source_page_xml_mutation: not performed
provenance_actions:
  page_order_preserved: true
  source_hashes_recorded: true
  normalized_variants: none
  materials_collected: none
  mdd_attached: none
```

8. `normalization_warnings`
```yaml
warnings:
  - titleblock_page_count_conflict
    severity: high
    note: reported page count signal is 8, but upstream split produced 11 source pages.
  - non_contiguous_page_number_signals
    severity: medium
    note: visible page-number hints are sparse and discontinuous; do not use as identity.
  - ambiguous_or_missing_public_labels
    severity: medium
    note: several pages lack public page-number or label visibility; keep review_required.
  - material_context_present_on_some_pages
    severity: medium
    note: material-property signals exist on a subset of pages; do not collect materials in this workflow.
  - classification_requires_review
    severity: medium
    note: channelization and local/internal labels are rationale only, not confirmed design truth.
```

9. `downstream_handoff`
```yaml
target_workflow: capture_xml_intake_library_v0
handoff_payload:
  required_artifacts:
    - page_module_spec_sidecars
    - module_spec_manifest
  compact_notes:
    preserve_source_page_order: true
    page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
    normalized_page_ref_policy: blank_unless_optional_derived_review_variant_exists
    annotation_variant_enabled: false
    review_required_for_semantics: true
handoff_constraints:
  no_raw_xml: true
  no_private_material: true
  no_final_asset_registration_claim: true
```

10. `boundary_review`
```yaml
public_safe_check:
  passed: true
  reasons:
    - no raw XML included
    - no runtime absolute paths included
    - no credentials or secret material included
    - no generated project output payloads included
    - no claim of file creation, command execution, or XML mutation
scope_check:
  project_local_only: true
  under_workflow_package: false
  source_inputs_treated_as_read_only: true
  capture_library_handoff_only: true
```

11. `open_questions`
```yaml
questions:
  - Should downstream intake keep all pages as review_required, or promote any page-level module-scope hints to provisional labels?
  - Is there a project policy for representing repeated off-page connector-heavy sheets versus schematic-heavy sheets in the intake library?
  - Should future calibration packets include explicit blank-field examples for every required sidecar block, or is schema-level presence sufficient?
```