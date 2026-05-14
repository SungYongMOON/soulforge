profile_metadata:
  workflow_id: page_xml_normalize_spec_v0
  downstream_workflow: capture_xml_intake_library_v0
  profile:
    model: gpt-5.4-mini
    reasoning_effort: low
    species: dwarf
    class: auditor
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  source_page_count: 11

normalization_input_summary:
  source_order_policy: preserve_source_page_order
  stable_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  page_count_signal_conflict: true
  page_number_signal_conflict: true
  titleblock_page_count_reported: ["8"]
  observed_titleblock_pages: 6
  normalization_scope: public_safe_structural_metadata_only
  source_inputs_treated_as_immutable: true
  derived_output_type: per-page module spec sidecars plus manifest and index

page_module_spec_plan:
  schema_version: page_module_spec_v0
  primary_per_page_file: page_module_spec_v0.yaml
  required_blocks: [identity, module_definition, interfaces, performance, composition, evidence_review]
  annotation_variant_enabled: false
  normalized_page_ref_policy: blank_unless_optional_derived_review_variant_exists
  per_page_policy:
    source_page_ref: preserved as provided
    source_sha256: preserved as provided
    source_page_id: stable from upstream split order
    source_page_order: stable ordinal 1..11
    semantic_claims: review_required_only
    classification_basis: rationale_not_truth
    local_internal_candidates: separate_from_external_interfaces
  output_policy:
    project_local_only: true
    never_under_workflow_package: true
    no_raw_xml: true
    no_mutation_of_source_xml: true

page_module_spec_sidecars:
  - source_page_id: page_001
    source_page_order: 1
    source_page_ref: project_page_xml_asset.page_001
    source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_001, source_page_order: 1, source_page_ref: project_page_xml_asset.page_001, source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90" }
      module_definition: { scope: unknown, rationale: "connector-like and regulator-control labels visible; review required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: ["SW", "FB", "PG"] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted power entry/control sheet signal", review_basis: "classification_basis_hint present", confidence: low }

  - source_page_id: page_002
    source_page_order: 2
    source_page_ref: project_page_xml_asset.page_002
    source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_002, source_page_order: 2, source_page_ref: project_page_xml_asset.page_002, source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee" }
      module_definition: { scope: unknown, rationale: "visible evidence weak or generic; keep unknown/review_required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted schematic page signal", review_basis: "weak evidence", confidence: low }

  - source_page_id: page_003
    source_page_order: 3
    source_page_ref: project_page_xml_asset.page_003
    source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_003, source_page_order: 3, source_page_ref: project_page_xml_asset.page_003, source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc" }
      module_definition: { scope: unknown, rationale: "dense repeated blocks visible; possible channelization review required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: ["FB", "SET", "VIOC"] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted dense schematic page signal", review_basis: "dense structure only", confidence: low }

  - source_page_id: page_004
    source_page_order: 4
    source_page_ref: project_page_xml_asset.page_004
    source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_004, source_page_order: 4, source_page_ref: project_page_xml_asset.page_004, source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538" }
      module_definition: { scope: unknown, rationale: "visible evidence weak or generic; keep unknown/review_required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted schematic page signal", review_basis: "weak evidence", confidence: low }

  - source_page_id: page_005
    source_page_order: 5
    source_page_ref: project_page_xml_asset.page_005
    source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_005, source_page_order: 5, source_page_ref: project_page_xml_asset.page_005, source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9" }
      module_definition: { scope: unknown, rationale: "visible evidence weak or generic; keep unknown/review_required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted schematic page signal", review_basis: "weak evidence", confidence: low }

  - source_page_id: page_006
    source_page_order: 6
    source_page_ref: project_page_xml_asset.page_006
    source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_006, source_page_order: 6, source_page_ref: project_page_xml_asset.page_006, source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405" }
      module_definition: { scope: unknown, rationale: "material-context structural hints present; do not collect materials here" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted hardware/material context signal", review_basis: "material hints only", confidence: low }

  - source_page_id: page_007
    source_page_order: 7
    source_page_ref: project_page_xml_asset.page_007
    source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_007, source_page_order: 7, source_page_ref: project_page_xml_asset.page_007, source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870" }
      module_definition: { scope: unknown, rationale: "visible evidence weak or generic; keep unknown/review_required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted schematic page signal", review_basis: "weak evidence", confidence: low }

  - source_page_id: page_008
    source_page_order: 8
    source_page_ref: project_page_xml_asset.page_008
    source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_008, source_page_order: 8, source_page_ref: project_page_xml_asset.page_008, source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b" }
      module_definition: { scope: unknown, rationale: "hardware/material context and PCB footprint signals present; review required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: ["PG"] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted material-heavy page signal", review_basis: "material-heavy structure", confidence: low }

  - source_page_id: page_009
    source_page_order: 9
    source_page_ref: project_page_xml_asset.page_009
    source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_009, source_page_order: 9, source_page_ref: project_page_xml_asset.page_009, source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227" }
      module_definition: { scope: unknown, rationale: "visible evidence weak or generic; keep unknown/review_required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted schematic page signal", review_basis: "weak evidence", confidence: low }

  - source_page_id: page_010
    source_page_order: 10
    source_page_ref: project_page_xml_asset.page_010
    source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_010, source_page_order: 10, source_page_ref: project_page_xml_asset.page_010, source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665" }
      module_definition: { scope: unknown, rationale: "visible evidence weak or generic; keep unknown/review_required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "offpage_connector_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted schematic page signal", review_basis: "weak evidence", confidence: low }

  - source_page_id: page_011
    source_page_order: 11
    source_page_ref: project_page_xml_asset.page_011
    source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3
    normalized_page_ref: ""
    normalized_sha256: ""
    blocks:
      identity: { registration_key: "", source_system_id: "", source_page_id: page_011, source_page_order: 11, source_page_ref: project_page_xml_asset.page_011, source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3" }
      module_definition: { scope: unknown, rationale: "visible evidence weak or generic; keep unknown/review_required" }
      interfaces: { inputs: [], outputs: [], bidirectional: [], passive_or_none: [], local_internal_candidates: [] }
      performance: { status: unknown, quantitative_values: "" }
      composition: { page_role_hints: ["schematic_content", "hardware_or_material_context", "possible_pcb_context"] }
      evidence_review: { visible_label_hint: "redacted schematic page signal", review_basis: "weak evidence", confidence: low }

module_spec_manifest:
  schema_version: page_module_spec_v0
  source_binding_identity: project_binding.whole_xml_source.sample_exp_capture_big_xml
  source_sha256_prefix: 74195c6c62bdcf3f
  page_count: 11
  ordered_page_ids: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]
  manifest_entries:
    - page_id: page_001
      page_order: 1
      source_sha256: 1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90
    - page_id: page_002
      page_order: 2
      source_sha256: 4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee
    - page_id: page_003
      page_order: 3
      source_sha256: f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc
    - page_id: page_004
      page_order: 4
      source_sha256: 2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538
    - page_id: page_005
      page_order: 5
      source_sha256: c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9
    - page_id: page_006
      page_order: 6
      source_sha256: 311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405
    - page_id: page_007
      page_order: 7
      source_sha256: 19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870
    - page_id: page_008
      page_order: 8
      source_sha256: 34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b
    - page_id: page_009
      page_order: 9
      source_sha256: e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227
    - page_id: page_010
      page_order: 10
      source_sha256: 1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665
    - page_id: page_011
      page_order: 11
      source_sha256: fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3

module_spec_index:
  by_page_id:
    page_001: { page_order: 1, source_sha256: "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90" }
    page_002: { page_order: 2, source_sha256: "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee" }
    page_003: { page_order: 3, source_sha256: "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc" }
    page_004: { page_order: 4, source_sha256: "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538" }
    page_005: { page_order: 5, source_sha256: "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9" }
    page_006: { page_order: 6, source_sha256: "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405" }
    page_007: { page_order: 7, source_sha256: "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870" }
    page_008: { page_order: 8, source_sha256: "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b" }
    page_009: { page_order: 9, source_sha256: "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227" }
    page_010: { page_order: 10, source_sha256: "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665" }
    page_011: { page_order: 11, source_sha256: "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3" }
  by_source_order: [page_001, page_002, page_003, page_004, page_005, page_006, page_007, page_008, page_009, page_010, page_011]

provenance_update:
  upstream_workflow: whole_xml_page_split_v0
  downstream_workflow: capture_xml_intake_library_v0
  provenance_state: derived_public_safe_structural_metadata_only
  preserved_invariants:
    - source order preserved
    - source page identity stable
    - source page XML treated as immutable
    - no raw XML emitted
    - no final asset registration claimed
  payloads_prepared:
    - page_module_spec_sidecars
    - module_spec_manifest
    - module_spec_index

normalization_warnings:
  - titleblock page count signal conflicts with actual page count; do not trust page count "8" as complete identity
  - page number signals are non-contiguous and partially missing or ambiguous
  - classification and scope remain review_required, not confirmed design truth
  - material-property signals exist on some pages; do not collect materials here
  - normalized_page_ref and normalized_sha256 intentionally blank
  - annotation_variant is disabled by default
  - final library asset registration is not performed here

downstream_handoff:
  target_workflow: capture_xml_intake_library_v0
  handoff_packet:
    includes: [page_module_spec_sidecars, module_spec_manifest, module_spec_index]
    summary: "Provide per-page sidecars keyed by stable page ids and source checksums; preserve source order; treat all semantic labels as review-required rationale only."
  acceptance_notes:
    - consume page_module_spec_v0 sidecars as derived inputs only
    - do not assume titleblock page numbering is authoritative
    - keep source page XML immutable
    - defer any material collection, MDD attachment, or harness composition

boundary_review:
  public_safe: true
  private_material_excluded: true
  raw_xml_excluded: true
  runtime_absolute_paths_excluded: true
  credentials_excluded: true
  project_private_material_excluded: true
  workflow_package_boundary_respected: true
  output_location_constraint: "project-local derived artifacts only; not under .workflow/"
  review_result: passes_boundary_checks_for_calibration_packet_only

open_questions:
  - Should downstream intake prefer only the manifest/index first, or ingest all per-page sidecars in one pass?
  - Is there a project policy that later enables annotation_variant for review-only derived XML?
  - Should any page-level review heuristics be standardized for unknown vs review_required scope labels?