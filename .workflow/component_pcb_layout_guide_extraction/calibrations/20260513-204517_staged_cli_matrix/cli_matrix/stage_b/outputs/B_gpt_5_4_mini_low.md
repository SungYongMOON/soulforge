```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: elf
  class: archivist
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  cache_status:
    U1:
      datasheet: new_index_required
      eval_guide: new_index_required
      eval_zip_manifest: inspect_archive_manifest_only
    U2:
      datasheet: existing_index_reusable
      supplemental_app_note: mock_saved
    J1:
      status: review_required
      note: no source docs provided
  component_keys:
    - analog_devices_lt3045edd_1
    - microchip_mcp73831t_2aci_ot
    - usb_c_receptacle_unresolved
  source_docs:
    U1:
      - "DATA Sheet/LT3045_datasheet.pdf"
      - "EVAL/DC2222A_user_guide.pdf"
      - "EVAL/DC2222A_design_files.zip"
    U2:
      - "DATA Sheet/MCP73831_family_datasheet.pdf"
      - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    J1: []
  review_required_components:
    - usb_c_receptacle_unresolved
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    status: source_backed
    layout_guide_md:
      sections:
        source_docs:
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            finding: "Input and output capacitors should be close to the regulator pins with short, low-impedance traces."
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
            finding: "Exposed pad and nearby copper should tie into the ground/thermal plane with multiple vias for heat spreading."
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            finding: "Reference layout keeps regulator, input/output capacitors, and sense points compact around a continuous ground area."
        layout_guidance:
          - "Place input and output capacitors immediately adjacent to the regulator pins."
          - "Use short, low-impedance power routing for decoupling paths."
          - "Tie the exposed pad into the thermal/ground plane with multiple vias."
          - "Keep sense and measurement points compact and return them to a continuous ground area."
          - "Treat the evaluation-board layout as the reference arrangement for compact placement and grounding."
        open_questions:
          - "Whether the final board stackup requires any additional thermal-via pattern constraints beyond the datasheet guidance."
    source_docs_used:
      - "DATA Sheet/LT3045_datasheet.pdf"
      - "EVAL/DC2222A_user_guide.pdf"
      - "EVAL/DC2222A_design_files.zip (manifest only)"
    promoted_items:
      figures:
        - "Layout Guide/figures/U1_fig_ds_p24.png"
      tables:
        - "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    notes:
      - "The table on page 7 is layout-relevant only if board setup context is retained."
      - "Archive evidence is limited to the README manifest entry; CAD/runtime files are not source text."

  microchip_mcp73831t_2aci_ot:
    refdes: U2
    status: source_backed
    layout_guide_md:
      sections:
        source_docs:
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
            finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            finding: "Battery and input capacitor routing should be short, with sense and charge paths kept clear of noisy switching nodes."
          - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            finding: "App note emphasizes close input-cap placement, clean ground return, and short battery connector routing."
        layout_guidance:
          - "Use adequate copper area for heat spreading under the package."
          - "Keep battery and input capacitor routing short and direct."
          - "Preserve a clean ground return path."
          - "Route sense and charge paths away from noisy switching nodes."
          - "Use the approved application note as final layout-readiness support."
        open_questions: []
    source_docs_used:
      - "DATA Sheet/MCP73831_family_datasheet.pdf"
      - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    promoted_items:
      figures:
        - "Layout Guide/figures/U2_fig_sup_p3.png"
      tables: []
    notes:
      - "Local EVAL material is none_found."
      - "The approved supplemental app note closes the layout-readiness gap."
      - "Datasheet cache is reusable."

  usb_c_receptacle_unresolved:
    refdes: J1
    status: review_required
    layout_guide_md:
      sections: []
      open_questions:
        - "Manufacturer part number is missing."
        - "Owner-approved source identity is missing."
        - "No datasheet or layout evidence is available, so no guidance should be authored."
```

```yaml
source_map_summary:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "source-backed layout finding"
    output_path: "Layout Guide/layout_guide.md#source_docs"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "source-backed layout finding"
    output_path: "Layout Guide/layout_guide.md#source_docs"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "reference-layout promotion"
    output_path: "Layout Guide/layout_guide.md#source_docs"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "source-backed layout finding"
    output_path: "Layout Guide/layout_guide.md#source_docs"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "source-backed layout finding"
    output_path: "Layout Guide/layout_guide.md#source_docs"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved supplemental source promotion"
    output_path: "Layout Guide/layout_guide.md#source_docs"
```

```yaml
layout_guide_citation_map:
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
  - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      promote_to: "Layout Guide/figures/U1_fig_ds_p24.png"
      reason: "Cited by the final layout guide and directly supports thermal pad/layout guidance."
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      promote_to: "Layout Guide/figures/U2_fig_sup_p3.png"
      reason: "Approved supplemental app note figure cited for final layout readiness."
  layout_only_tables_to_promote:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      promote_to: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      reason: "Board setup context retained and layout-relevant."
  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_table_eval_p2_revision_history"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      page_number: 2
      reason: "Revision history is not layout guidance."
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      candidate_id: "U2_table_ds_p4_ordering"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      page_number: 4
      reason: "Ordering codes are not layout guidance."
  missing_tool_or_low_confidence_notes:
    - "No actual PDF rendering or OCR was performed; all promotion decisions are fixture-bound."
    - "No Camelot extraction was executed; table promotion follows the provided accuracy/whitespace hints plus layout context."
```

```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  calibration_id: "20260513-204517_staged_cli_matrix"
  processed_docs:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  cache_hits:
    - "U2 datasheet existing_index_reusable"
  cache_misses:
    - "U1 datasheet new_index_required"
    - "U1 eval guide new_index_required"
  candidate_span_count: 6
  supplemental_docs:
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  figure_count: 2
  table_count: 1
  rejected_candidates: 2
  tool_use_status:
    network: forbidden_not_used
    local_files: forbidden_not_used
    downloads: forbidden_not_used
    pdf_rendering: not_claimed
    ocr: not_claimed
    camelot: not_claimed
    pymupdf: not_claimed
    file_writes: not_claimed
  warnings:
    - "All synthesis is limited to fixture-provided spans and anchors."
    - "J1 remains unresolved and must not receive invented guidance."
  open_questions:
    - "Whether the U1 table promotion should be included as a rendered markdown table or retained as a compact source note in the guide."
```

```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    component_key: "analog_devices_lt3045edd_1"
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    page_number: 2
    reason: "Revision history; no board layout content."
  - candidate_id: "U2_table_ds_p4_ordering"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    page_number: 4
    reason: "Ordering codes; not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Write U1 Layout Guide content from the three cited spans, then promote the cited figure and the layout-relevant table."
    - "Write U2 Layout Guide content from the two datasheet spans plus the approved supplemental app note, then promote the cited figure."
    - "Leave J1 in review_required and request manufacturer-backed identity before any layout guidance is authored."
```

Recommendation: proceed with U1 and U2 packet materialization, and keep J1 gated until a verified part identity is supplied.