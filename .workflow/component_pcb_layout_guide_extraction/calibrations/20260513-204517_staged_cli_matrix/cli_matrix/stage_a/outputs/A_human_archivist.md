```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: archivist
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  component_keys:
    - analog_devices_lt3045edd_1
    - microchip_mcp73831t_2aci_ot
    - usb_c_receptacle_unresolved
  source_docs:
    analog_devices_lt3045edd_1:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        cache_status: "new_index_required"
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        cache_status: "new_index_required"
      - source_file: "EVAL/DC2222A_design_files.zip"
        source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        cache_status: "inspect_archive_manifest_only"
    microchip_mcp73831t_2aci_ot:
      - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
        source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        cache_status: "existing_index_reusable"
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
        cache_status: "mock_saved"
    usb_c_receptacle_unresolved: []
  cache_status:
    U1: "mixed: new_index_required + archive_manifest_only"
    U2: "existing_index_reusable + approved supplemental mock_saved"
    J1: "no source material"
  review_required_components:
    - usb_c_receptacle_unresolved
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    identity_status: source_backed
    layout_guide_path: "Layout Guide/layout_guide.md"
    source_bound_findings:
      - finding_id: "U1-F1"
        topic: "decoupling and bypass placement"
        evidence:
          source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 22
          span_id: "U1_DS_p22_decoupling"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
          summary: "Input and output capacitors should be close to the regulator pins and connected with short, low-impedance traces."
        intended_output_path: "Layout Guide/layout_guide.md"
      - finding_id: "U1-F2"
        topic: "thermal and exposed pad grounding"
        evidence:
          source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 24
          span_id: "U1_DS_p24_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          summary: "Exposed pad and nearby copper should tie into the ground/thermal plane with multiple vias for heat spreading."
        intended_output_path: "Layout Guide/layout_guide.md"
      - finding_id: "U1-F3"
        topic: "reference layout and grounding"
        evidence:
          source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_number: 6
          span_id: "U1_EVAL_p6_reference_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
          summary: "The evaluation board keeps the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
        intended_output_path: "Layout Guide/layout_guide.md"
    open_questions:
      - "Promote the page-24 thermal drawing as a cited figure only if the final guide references the thermal/exposed-pad guidance."
      - "Promote the page-7 jumper/load connector table only if the final guide retains board-setup context."
    figure_table_notes:
      - "Primary layout guide should emphasize decoupling, thermal pad vias, and compact ground-return routing."

  microchip_mcp73831t_2aci_ot:
    refdes: U2
    identity_status: source_backed
    layout_guide_path: "Layout Guide/layout_guide.md"
    source_bound_findings:
      - finding_id: "U2-F1"
        topic: "thermal and copper area"
        evidence:
          source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 14
          span_id: "U2_DS_p14_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
          summary: "Thermal behavior depends on copper area and package-to-board heat spreading."
        intended_output_path: "Layout Guide/layout_guide.md"
      - finding_id: "U2-F2"
        topic: "battery trace and power routing"
        evidence:
          source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 17
          span_id: "U2_DS_p17_power_path"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          summary: "Battery and input capacitor routing should be short, with sense and charge paths kept clear of noisy switching nodes."
        intended_output_path: "Layout Guide/layout_guide.md"
      - finding_id: "U2-F3"
        topic: "approved supplemental layout readiness"
        evidence:
          source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          page_number: 3
          span_id: "U2_SUP_p3_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
          summary: "Close input capacitor placement, clean ground return, and short battery connector routing."
        intended_output_path: "Layout Guide/layout_guide.md"
    open_questions: []
    figure_table_notes:
      - "Use the approved supplemental app note to close the local EVAL gap for final layout readiness."
      - "Local EVAL none_found should be recorded as an explicit coverage gap, not as a blocker once the approved supplemental source is cited."

  usb_c_receptacle_unresolved:
    refdes: J1
    identity_status: review_required
    layout_guide_path: "Layout Guide/layout_guide.md"
    source_bound_findings: []
    open_questions:
      - "Manufacturer part number is missing."
      - "No owner-approved source identity is available."
      - "Do not invent datasheets, EVAL material, or layout guidance."
    figure_table_notes:
      - "Keep excluded from source-backed layout guidance until identity is approved."
```

```yaml
source_map_summary:
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    method: "source-bound synthesis"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    method: "source-bound synthesis"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    method: "source-bound synthesis"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    method: "source-bound synthesis"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    method: "source-bound synthesis"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    method: "approved supplemental source synthesis"
```

```yaml
layout_guide_citation_map:
  U1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_p22:
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
  U1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_p24:
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
  U1_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_p6:
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
  U2_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd_p14:
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
  U2_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd_p17:
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
  U2_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee_p3:
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - figure_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      promotion: "promote"
      target_path: "Layout Guide/figures/U1_fig_ds_p24.png"
      reason: "Unique cited full-page render with thermal pad and recommended layout context"
    - figure_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      promotion: "promote"
      target_path: "Layout Guide/figures/U2_fig_sup_p3.png"
      reason: "Unique cited full-page render from approved supplemental layout note"
  layout_only_tables_to_promote:
    - table_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      promotion: "promote_layout_only"
      target_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      reason: "Board setup / jumper / load connector context retained"
  context_only_items:
    - item_id: "archive_entry_README_layout_notes"
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      promotion: "context_only"
      reason: "Archive manifest note only; not a visual or layout table source by itself"
  low_confidence_or_missing_tool_notes:
    - "No real rendering/OCR/Camelot was performed; synthetic fixture only."
    - "Only cited unique page pairs are eligible for promotion."
```

```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  processed_docs:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
  supplemental_docs:
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  candidate_span_count: 6
  figure_count:
    full_page_figures: 2
    context_only_items: 1
  table_count:
    promotable_layout_tables: 1
    rejected_tables: 2
  rejected_candidates:
    - "U1_table_eval_p2_revision_history"
    - "U2_table_ds_p4_ordering"
  tool_use_status:
    network: "not_used"
    local_project_files: "not_used"
    pdf_rendering: "not_claimed"
    ocr: "not_claimed"
    camelot: "not_claimed"
    pymupdf: "not_claimed"
    file_writes: "not_claimed"
  warnings:
    - "Synthetic calibration packet only."
    - "No source material beyond fixture spans may be invented."
  open_questions:
    - "Whether the runner wants `Layout Guide/figures/` and `Layout Guide/tables/` emitted for U1 and U2 only."
    - "Whether J1 should be surfaced as an explicit blocking review item in the final markdown body."
```

```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "Revision history, not board layout guidance"
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "Ordering codes, not layout guidance"
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  rationale: "Uses only fixture-provided synthetic spans, checksums, mock URL, and page anchors; no runtime paths, credentials, or project data leaked."
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_or_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Write U1 Layout Guide.md with decoupling, thermal/exposed-pad, grounding, and EVAL reference-layout synthesis."
    - "Write U2 Layout Guide.md with datasheet thermal/power-path synthesis and cite the approved supplemental app note for final readiness."
    - "Keep J1 in review_required until manufacturer-backed identity and source evidence are provided."
```

Brief recommendation: keep the final writer constrained to the cited spans above, promote only the two cited full-page figures plus the one layout-context table, and leave J1 unresolved until identity is approved.