```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: medium
  species: elf
  class: archivist
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  expected_component_folders:
    - "DATA Sheet"
    - "EVAL"
    - "Layout Guide"
  components:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      identity_status: source_backed
      source_docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          cache_status: new_index_required
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          cache_status: new_index_required
        - source_file: "EVAL/DC2222A_design_files.zip"
          source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          cache_status: inspect_archive_manifest_only
      review_required_components: []
    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      identity_status: source_backed
      source_docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          cache_status: existing_index_reusable
      review_required_components: []
      supplemental_source:
        source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
        official_or_owner_approved: true
        cache_status: mock_saved
    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      identity_status: review_required
      source_docs: []
      review_required_components:
        - "identity and source evidence"
  cache_status_summary:
    datasheet_cache: "U2 existing index reusable; U1 new index required"
    eval_cache: "U1 new index required; archive manifest only for design zip"
    supplemental_cache: "approved mock supplemental source saved for U2"
```

```yaml
per_component_layout_guides:
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    layout_guide_md:
      sections:
        source_bound_findings:
          - finding_id: "U1-F1"
            topic: "decoupling and power routing"
            finding: "Input and output capacitors should be placed close to the regulator pins with short, low-impedance traces."
            citation:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
              extraction_method: "source-backed span synthesis"
            output_path: "Layout Guide/layout_guide.md#u1-f1-decoupling-and-power-routing"
          - finding_id: "U1-F2"
            topic: "thermal and exposed pad grounding"
            finding: "The exposed pad and nearby copper should connect into the ground/thermal plane with multiple vias for heat spreading."
            citation:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 24
              span_id: "U1_DS_p24_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
              extraction_method: "source-backed span synthesis"
            output_path: "Layout Guide/layout_guide.md#u1-f2-thermal-and-exposed-pad-grounding"
          - finding_id: "U1-F3"
            topic: "reference layout and grounding"
            finding: "The evaluation-board layout keeps the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
            citation:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
              extraction_method: "source-backed span synthesis"
            output_path: "Layout Guide/layout_guide.md#u1-f3-reference-layout-and-grounding"
        layout_decisions:
          - decision_id: "U1-D1"
            decision: "Keep decoupling parts immediately adjacent to pins and route with shortest practical return path."
            basis: ["U1-F1", "U1-F3"]
            output_path: "Layout Guide/layout_guide.md#u1-d1-placement-and-routing-rule"
          - decision_id: "U1-D2"
            decision: "Use the exposed pad as a thermal tie to a continuous ground/thermal plane with multiple vias."
            basis: ["U1-F2"]
            output_path: "Layout Guide/layout_guide.md#u1-d2-thermal-via-strategy"
          - decision_id: "U1-D3"
            decision: "Mirror the evaluation-board compactness around the regulator, capacitors, and sense points."
            basis: ["U1-F3"]
            output_path: "Layout Guide/layout_guide.md#u1-d3-reference-layout-alignment"
        promoted_figure_and_table_notes:
          - item_id: "U1_fig_ds_p24"
            kind: "figure"
            status: "promote"
            reason: "Unique cited page pair and directly supports thermal pad guidance."
            output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
          - item_id: "U1_table_eval_p7_jumpers"
            kind: "table"
            status: "promote"
            reason: "Board/setup context retained and usable as layout-adjacent reference material."
            output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
        open_questions: []
    review_status: ready
  - component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    layout_guide_md:
      sections:
        source_bound_findings:
          - finding_id: "U2-F1"
            topic: "thermal and copper area"
            finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
            citation:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 14
              span_id: "U2_DS_p14_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
              extraction_method: "source-backed span synthesis"
            output_path: "Layout Guide/layout_guide.md#u2-f1-thermal-and-copper-area"
          - finding_id: "U2-F2"
            topic: "battery trace routing and decoupling"
            finding: "Battery and input-capacitor routing should be short, with sense and charge paths kept clear of noisy switching nodes."
            citation:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 17
              span_id: "U2_DS_p17_power_path"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
              extraction_method: "source-backed span synthesis"
            output_path: "Layout Guide/layout_guide.md#u2-f2-battery-trace-routing-and-decoupling"
          - finding_id: "U2-F3"
            topic: "final layout readiness from approved supplemental guidance"
            finding: "The approved supplemental app note emphasizes close placement of the input capacitor, a clean ground return, and short battery connector routing."
            citation:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
              extraction_method: "approved supplemental source synthesis"
            output_path: "Layout Guide/layout_guide.md#u2-f3-approved-supplemental-layout-readiness"
        layout_decisions:
          - decision_id: "U2-D1"
            decision: "Use compact input-capacitor and battery-path placement with a clean ground return."
            basis: ["U2-F2", "U2-F3"]
            output_path: "Layout Guide/layout_guide.md#u2-d1-placement-and-return-path-rule"
          - decision_id: "U2-D2"
            decision: "Bias copper allocation toward thermal spreading around the package."
            basis: ["U2-F1"]
            output_path: "Layout Guide/layout_guide.md#u2-d2-thermal-copper-strategy"
          - decision_id: "U2-D3"
            decision: "Treat the approved app note as the final layout-readiness reference because local EVAL material is absent."
            basis: ["U2-F3"]
            output_path: "Layout Guide/layout_guide.md#u2-d3-readiness-reference"
        promoted_figure_and_table_notes:
          - item_id: "U2_fig_sup_p3"
            kind: "figure"
            status: "promote"
            reason: "Unique cited page pair from an approved supplemental source; directly supports final readiness."
            output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
        open_questions:
          - "No local EVAL guide or board drawing is present; final acceptance depends on the approved supplemental app note only."
    review_status: ready_with_supplemental
  - component_key: "usb_c_receptacle_unresolved"
    refdes: "J1"
    layout_guide_md:
      sections:
        source_bound_findings: []
        layout_decisions: []
        promoted_figure_and_table_notes: []
        open_questions:
          - "Manufacturer part number missing."
          - "No owner-approved source identity."
          - "Do not invent datasheets, EVAL material, or layout guidance."
    review_status: review_required
```

```yaml
source_map_summary:
  - map_id: "SM-U1-001"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    finding_or_asset: "U1-F1 decoupling and power routing"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id_or_anchor: "U1_DS_p22_decoupling / SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "source-backed span synthesis"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md#u1-f1-decoupling-and-power-routing"
  - map_id: "SM-U1-002"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    finding_or_asset: "U1-F2 thermal and exposed pad grounding"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "U1_DS_p24_thermal / SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "source-backed span synthesis"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md#u1-f2-thermal-and-exposed-pad-grounding"
  - map_id: "SM-U1-003"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    finding_or_asset: "U1-F3 reference layout and grounding"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id_or_anchor: "U1_EVAL_p6_reference_layout / SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "source-backed span synthesis"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md#u1-f3-reference-layout-and-grounding"
  - map_id: "SM-U1-004"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    finding_or_asset: "Promoted figure"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "U1_fig_ds_p24"
    extraction_promotion_method: "full-page figure promotion"
    output_path_relative_to_layout_guide: "Layout Guide/figures/U1_fig_ds_p24.png"
  - map_id: "SM-U1-005"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    finding_or_asset: "Promoted table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_id_or_anchor: "U1_table_eval_p7_jumpers"
    extraction_promotion_method: "layout-context table promotion"
    output_path_relative_to_layout_guide: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
  - map_id: "SM-U2-001"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    finding_or_asset: "U2-F1 thermal and copper area"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id_or_anchor: "U2_DS_p14_thermal / SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "source-backed span synthesis"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md#u2-f1-thermal-and-copper-area"
  - map_id: "SM-U2-002"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    finding_or_asset: "U2-F2 battery trace routing and decoupling"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id_or_anchor: "U2_DS_p17_power_path / SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "source-backed span synthesis"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md#u2-f2-battery-trace-routing-and-decoupling"
  - map_id: "SM-U2-003"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    finding_or_asset: "U2-F3 approved supplemental layout readiness"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved supplemental source synthesis"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md#u2-f3-approved-supplemental-layout-readiness"
  - map_id: "SM-U2-004"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    finding_or_asset: "Promoted figure"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "U2_fig_sup_p3"
    extraction_promotion_method: "full-page figure promotion"
    output_path_relative_to_layout_guide: "Layout Guide/figures/U2_fig_sup_p3.png"
```

```yaml
layout_guide_citation_map:
  cited_pairs:
    - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      citation_anchors:
        - "U1_DS_p22_decoupling"
        - "SYNTHETIC_U1_DS_P22_DECOUPLING"
      dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
    - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      citation_anchors:
        - "U1_DS_p24_thermal"
        - "SYNTHETIC_U1_DS_P24_THERMAL"
        - "U1_fig_ds_p24"
      dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
    - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      citation_anchors:
        - "U1_EVAL_p6_reference_layout"
        - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
    - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      citation_anchors:
        - "U2_DS_p14_thermal"
        - "SYNTHETIC_U2_DS_P14_THERMAL"
      dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
    - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      citation_anchors:
        - "U2_DS_p17_power_path"
        - "SYNTHETIC_U2_DS_P17_POWER_PATH"
      dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
    - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      citation_anchors:
        - "U2_SUP_p3_layout"
        - "SYNTHETIC_U2_SUP_P3_LAYOUT"
        - "U2_fig_sup_p3"
      dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
  note: "Only unique cited source-file checksum plus page pairs are listed; promoted figure/table assets inherit the same dedupe key as their cited source page."
```

```yaml
figure_table_extraction_summary:
  figures_to_render_and_promote:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      asset_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      status: "promote"
      reason: "Full-page layout/thermal pad drawing is cited by the final guide."
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      asset_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      status: "promote"
      reason: "Approved supplemental layout drawing is cited by the final guide and supports final readiness."
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
  layout_only_tables_to_promote:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      asset_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      camelot_quality:
        accuracy: 98.2
        whitespace: 21.0
      status: "promote"
      reason: "Retains board/setup context relevant to reference-board layout usage."
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
  context_only_items:
    - component_key: "analog_devices_lt3045edd_1"
      asset_id: "U1_table_eval_p2_revision_history"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      page_number: 2
      status: "reject"
      reason: "Revision history is not layout guidance."
    - component_key: "microchip_mcp73831t_2aci_ot"
      asset_id: "U2_table_ds_p4_ordering"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      page_number: 4
      status: "reject"
      reason: "Ordering codes are not layout guidance."
  missing_tool_or_low_confidence_notes:
    - "No actual PDF rendering, OCR, or Camelot execution was performed; all decisions are fixture-bound."
    - "U2 local EVAL material is absent; final readiness relies on the approved mock supplemental source."
```

```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  fixture_type: "public_safe_synthetic"
  processed_docs:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      cache_status: "new_index_required"
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      cache_status: "new_index_required"
    - source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: "inspect_archive_manifest_only"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      cache_status: "existing_index_reusable"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      cache_status: "mock_saved"
  cache_hits:
    - "U2 datasheet index reusable"
  cache_misses:
    - "U1 datasheet index"
    - "U1 EVAL user guide index"
  candidate_span_count: 6
  supplemental_docs:
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  figure_count:
    promoted: 2
    rejected: 0
  table_count:
    promoted: 1
    rejected: 2
  rejected_candidates:
    - "U1_table_eval_p2_revision_history"
    - "U2_table_ds_p4_ordering"
  tool_use_status:
    network: "not used"
    local_project_files: "not read"
    pdf_rendering: "not claimed"
    ocr: "not claimed"
    camelot: "not claimed"
    pymupdf: "not claimed"
    file_writes: "not claimed"
  warnings:
    - "All synthesis is bound to fixture spans only."
    - "J1 remains unresolved and must not receive inferred guidance."
    - "No runtime absolute paths are included."
  open_questions:
    - "J1 manufacturer identity remains missing."
    - "U2 lacks local EVAL coverage, but approved supplemental guidance closes the readiness gap."
```

```yaml
rejected_visual_table_candidates:
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "Revision history is not board/layout guidance."
  - component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "Ordering codes are not board/layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  boundary_notes:
    - "Only mocked file names, checksums, page numbers, synthetic span anchors, and approved supplemental metadata are used."
    - "No real PDFs, vendor text, credentials, cookies, runtime absolute paths, or project-private material are exposed."
  ready_components:
    - "U1"
    - "U2"
  blocked_or_review_components:
    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      status: "review_required"
      reason: "No manufacturer-backed identity or source evidence is available."
  next_owner_actions:
    - "Write U1 Layout Guide with the three cited findings, promoted page-24 figure, and promoted page-7 table."
    - "Write U2 Layout Guide with datasheet thermal/power-path guidance, approved supplemental readiness note, and promoted page-3 figure."
    - "Hold J1 for identity resolution before any layout guidance is drafted."
```

Recommended next step: write the Markdown files and the manifest directly from these YAML blocks, preserving the cited anchors and promoted asset paths exactly.