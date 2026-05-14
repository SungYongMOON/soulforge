```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: darkelf
  class: administrator
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
        official_or_owner_approved: true
        cache_status: "mock_saved"
    usb_c_receptacle_unresolved: []
  review_required_components:
    - usb_c_receptacle_unresolved
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    source_backed: true
    layout_guide_md:
      sections:
        - heading: "Source Docs"
          findings:
            - "Datasheet page 22 supports decoupling and short, low-impedance input/output capacitor placement near regulator pins."
            - "Datasheet page 24 supports thermal/exposed-pad grounding with multiple vias into the ground/thermal plane."
            - "EVAL guide page 6 supports compact regulator, capacitor, and sense-point placement around a continuous ground area."
          cited_excerpt_anchors:
            - "SYNTHETIC_U1_DS_P22_DECOUPLING"
            - "SYNTHETIC_U1_DS_P24_THERMAL"
            - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
          open_questions: []
        - heading: "Layout Guidance"
          findings:
            - "Place input and output capacitors close to the regulator pins."
            - "Keep power routing short and low impedance."
            - "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias."
            - "Keep the regulator, capacitors, and measurement sense points compact around continuous ground."
          cited_excerpt_anchors:
            - "SYNTHETIC_U1_DS_P22_DECOUPLING"
            - "SYNTHETIC_U1_DS_P24_THERMAL"
            - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
          open_questions: []
        - heading: "Figures and Tables"
          findings:
            - "Promote the full-page thermal/recommended layout render from datasheet page 24."
            - "Promote the board-setup jumper/load-connector table from EVAL page 7 because it retains board layout context."
          cited_excerpt_anchors:
            - "SYNTHETIC_U1_DS_P24_THERMAL"
            - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
          open_questions: []
        - heading: "Open Questions"
          findings: []
          cited_excerpt_anchors: []
          open_questions:
            - "No unresolved source-bound layout question remains for U1 in this fixture."
  microchip_mcp73831t_2aci_ot:
    refdes: U2
    source_backed: true
    layout_guide_md:
      sections:
        - heading: "Source Docs"
          findings:
            - "Existing datasheet index is reusable."
            - "Approved supplemental app note is required for final readiness because local EVAL material is none_found."
          cited_excerpt_anchors:
            - "SYNTHETIC_U2_DS_P14_THERMAL"
            - "SYNTHETIC_U2_DS_P17_POWER_PATH"
            - "SYNTHETIC_U2_SUP_P3_LAYOUT"
          open_questions: []
        - heading: "Layout Guidance"
          findings:
            - "Use copper area and package-to-board heat spreading to manage thermal behavior."
            - "Keep battery and input capacitor routing short."
            - "Keep sense and charge paths clear of noisy switching nodes."
            - "Place the input capacitor close, maintain a clean ground return, and route the battery connector short."
          cited_excerpt_anchors:
            - "SYNTHETIC_U2_DS_P14_THERMAL"
            - "SYNTHETIC_U2_DS_P17_POWER_PATH"
            - "SYNTHETIC_U2_SUP_P3_LAYOUT"
          open_questions: []
        - heading: "Figures and Tables"
          findings:
            - "Promote the full-page charger board placement drawing from the approved supplemental app note page 3."
            - "Reject datasheet ordering-code table as non-layout."
          cited_excerpt_anchors:
            - "SYNTHETIC_U2_SUP_P3_LAYOUT"
          open_questions: []
        - heading: "Open Questions"
          findings: []
          cited_excerpt_anchors: []
          open_questions:
            - "Local EVAL material is absent; the approved supplemental source covers final layout readiness."
  usb_c_receptacle_unresolved:
    refdes: J1
    review_required: true
    source_backed: false
    layout_guide_md:
      sections:
        - heading: "Source Docs"
          findings:
            - "No manufacturer-backed identity or source evidence is available."
          cited_excerpt_anchors: []
          open_questions:
            - "Need owner-approved manufacturer part number or equivalent source identity before any layout guidance can be written."
        - heading: "Layout Guidance"
          findings: []
          cited_excerpt_anchors: []
          open_questions:
            - "Do not invent datasheets, EVAL material, or placement guidance."
        - heading: "Figures and Tables"
          findings: []
          cited_excerpt_anchors: []
          open_questions: []
        - heading: "Open Questions"
          findings:
            - "Component identity remains unresolved."
          cited_excerpt_anchors: []
          open_questions:
            - "Await source identity review."
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
    extraction_promotion_method: "layout_finding"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "layout_finding"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "layout_finding"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_fig_ds_p24"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "full_page_render_promoted"
    output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_id: "U1_table_eval_p7_jumpers"
    bounded_excerpt_anchor: "board_setup_context_retained"
    extraction_promotion_method: "layout_only_table_promoted"
    output_path: "Layout Guide/tables/U1_table_eval_p7.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "layout_finding"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "layout_finding"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "layout_finding"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_fig_sup_p3"
    bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "full_page_render_promoted"
    output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    source_file: null
    source_file_sha256: null
    page_number: null
    span_id: null
    bounded_excerpt_anchor: null
    extraction_promotion_method: "none"
    output_path: "Layout Guide/layout_guide.md"
```

```yaml
layout_guide_citation_map:
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
  - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      candidate_id: "U1_fig_ds_p24"
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
      reason: "Cited by final layout guide; thermal/recommended layout page."
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      candidate_id: "U2_fig_sup_p3"
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
      reason: "Approved supplemental app note and cited for final readiness."
  layout_only_tables_to_promote:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      candidate_id: "U1_table_eval_p7_jumpers"
      output_path: "Layout Guide/tables/U1_table_eval_p7.md"
      reason: "Board/setup context retained and tied to layout guidance."
  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      candidate_id: "README_layout_notes.txt"
      handling: "inspect_archive_manifest_only"
      reason: "Archive note only; not a promoted visual/table item."
  missing_tool_or_low_confidence_notes:
    - "No actual PDF rendering or OCR was performed; all promotion decisions are fixture-bound."
    - "U2 local EVAL material is none_found, so approved supplemental app note was used."
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
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
  candidate_span_count: 6
  supplemental_docs:
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  figure_count:
    rendered_promoted: 2
    context_only: 0
  table_count:
    layout_promoted: 1
    rejected: 2
  rejected_candidates: 2
  tool_use_status:
    network: "not_used"
    local_files: "not_used"
    pdf_rendering: "not_used"
    ocr: "not_used"
    camelot: "not_used"
    writes: "not_used"
  warnings:
    - "J1 remains unresolved and must not receive inferred guidance."
    - "U2 local EVAL material is absent; final readiness depends on the approved supplemental app note."
  open_questions:
    - "Provide a manufacturer-backed identity for J1 before any layout work."
```

```yaml
rejected_visual_table_candidates:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "Revision history is not board/layout guidance."
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "Ordering codes are not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  readiness_status:
    ready_components:
      - refdes: U1
        component_key: analog_devices_lt3045edd_1
      - refdes: U2
        component_key: microchip_mcp73831t_2aci_ot
    blocked_or_review_components:
      - refdes: J1
        component_key: usb_c_receptacle_unresolved
        status: review_required
  next_owner_actions:
    - "Promote the cited U1 and U2 figures and the single U1 layout-context table into their component Layout Guide outputs."
    - "Keep J1 in review_required until owner-approved identity evidence exists."
    - "Do not add any uncited or non-fixture source material."
```

Recommendation: write U1 and U2 guides from the cited spans above, promote only the two cited figures plus the single U1 layout-context table, and leave J1 blocked for identity review.