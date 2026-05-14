```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: orc
  class: archivist
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  cache_status:
    U1:
      DATA Sheet/LT3045_datasheet.pdf: new_index_required
      EVAL/DC2222A_user_guide.pdf: new_index_required
      EVAL/DC2222A_design_files.zip: inspect_archive_manifest_only
    U2:
      DATA Sheet/MCP73831_family_datasheet.pdf: existing_index_reusable
      Layout Guide/source_docs/MCP73831_layout_app_note.pdf: mock_saved
    J1: no_source_docs
  component_keys:
    - analog_devices_lt3045edd_1
    - microchip_mcp73831t_2aci_ot
    - usb_c_receptacle_unresolved
  review_required_components:
    - usb_c_receptacle_unresolved
  source_docs_by_component:
    analog_devices_lt3045edd_1:
      - source_file: DATA Sheet/LT3045_datasheet.pdf
        source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        page_count: 44
      - source_file: EVAL/DC2222A_user_guide.pdf
        source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
        page_count: 12
      - source_file: EVAL/DC2222A_design_files.zip
        source_file_sha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
        archive_manifest_only: true
    microchip_mcp73831t_2aci_ot:
      - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
        source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
        page_count: 32
      - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
        source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
        source_url: https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf
        approved: true
        page_count: 8
    usb_c_receptacle_unresolved: []
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    status: source_backed
    layout_guide_md:
      sections:
        - heading: Overview
          findings:
            - "Use close input/output capacitor placement and short, low-impedance power traces around the regulator."
            - "Treat the exposed pad as a thermal and grounding feature tied to copper/ground with multiple vias."
            - "Use the eval-board layout as the compact placement reference for regulator, capacitors, and sense points."
          citations:
            - source_file: DATA Sheet/LT3045_datasheet.pdf
              source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
              page_number: 22
              span_id: U1_DS_p22_decoupling
              bounded_excerpt_anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
            - source_file: DATA Sheet/LT3045_datasheet.pdf
              source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
              page_number: 24
              span_id: U1_DS_p24_thermal
              bounded_excerpt_anchor: SYNTHETIC_U1_DS_P24_THERMAL
            - source_file: EVAL/DC2222A_user_guide.pdf
              source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
              page_number: 6
              span_id: U1_EVAL_p6_reference_layout
              bounded_excerpt_anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
          open_questions: []
        - heading: Placement Guidance
          findings:
            - "Place input and output capacitors immediately adjacent to the regulator pins."
            - "Keep the regulator and sense/measurement points compact around a continuous ground area."
          citations:
            - source_file: DATA Sheet/LT3045_datasheet.pdf
              source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
              page_number: 22
              span_id: U1_DS_p22_decoupling
              bounded_excerpt_anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
            - source_file: EVAL/DC2222A_user_guide.pdf
              source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
              page_number: 6
              span_id: U1_EVAL_p6_reference_layout
              bounded_excerpt_anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
          open_questions: []
        - heading: Thermal and Grounding
          findings:
            - "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias."
            - "Preserve continuous ground area under the compact reference layout."
          citations:
            - source_file: DATA Sheet/LT3045_datasheet.pdf
              source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
              page_number: 24
              span_id: U1_DS_p24_thermal
              bounded_excerpt_anchor: SYNTHETIC_U1_DS_P24_THERMAL
            - source_file: EVAL/DC2222A_user_guide.pdf
              source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
              page_number: 6
              span_id: U1_EVAL_p6_reference_layout
              bounded_excerpt_anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
          open_questions: []
        - heading: Figures and Tables to Promote
          findings:
            - "Promote the full-page thermal/recommended-layout drawing from page 24."
            - "Promote the jumper/load-connector table only if board-setup context is preserved."
          citations:
            - source_file: DATA Sheet/LT3045_datasheet.pdf
              source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
              page_number: 24
              anchor: U1_fig_ds_p24
              method: full_page_figure_render
              output_path: Layout Guide/figures/U1_fig_ds_p24.png
            - source_file: EVAL/DC2222A_user_guide.pdf
              source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
              page_number: 7
              anchor: U1_table_eval_p7_jumpers
              method: layout_only_table_promotion
              output_path: Layout Guide/tables/U1_table_eval_p7_jumpers.md
          open_questions:
            - "If the jumper/load-connector table is trimmed, keep enough setup context to avoid misrouting the board configuration."
  microchip_mcp73831t_2aci_ot:
    refdes: U2
    status: source_backed
    layout_guide_md:
      sections:
        - heading: Overview
          findings:
            - "Reuse the existing datasheet index."
            - "Local EVAL material is absent, so rely on the approved supplemental app note for final readiness."
            - "Keep input capacitor, ground return, and battery connector routing compact."
          citations:
            - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
              source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
              page_number: 14
              span_id: U2_DS_p14_thermal
              bounded_excerpt_anchor: SYNTHETIC_U2_DS_P14_THERMAL
            - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
              source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
              page_number: 17
              span_id: U2_DS_p17_power_path
              bounded_excerpt_anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
            - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
              source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
              page_number: 3
              span_id: U2_SUP_p3_layout
              bounded_excerpt_anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
          open_questions: []
        - heading: Placement Guidance
          findings:
            - "Place the input capacitor close to the charger."
            - "Keep battery and input routing short."
            - "Maintain a clean ground return and avoid noisy switching-node coupling."
          citations:
            - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
              source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
              page_number: 17
              span_id: U2_DS_p17_power_path
              bounded_excerpt_anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
            - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
              source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
              page_number: 3
              span_id: U2_SUP_p3_layout
              bounded_excerpt_anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
          open_questions: []
        - heading: Thermal and Grounding
          findings:
            - "Thermal behavior depends on copper area and package-to-board heat spreading."
            - "Use copper area and grounding to support heat spreading."
          citations:
            - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
              source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
              page_number: 14
              span_id: U2_DS_p14_thermal
              bounded_excerpt_anchor: SYNTHETIC_U2_DS_P14_THERMAL
          open_questions: []
        - heading: Figures and Tables to Promote
          findings:
            - "Promote the approved example charger board placement drawing."
            - "Reject the ordering-codes table."
          citations:
            - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
              source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
              page_number: 3
              anchor: U2_fig_sup_p3
              method: full_page_figure_render
              output_path: Layout Guide/figures/U2_fig_sup_p3.png
          open_questions: []
    coverage_gap:
      local_eval_material_status: none_found
      final_readiness_note: "Approved supplemental source closes the local gap for layout readiness."
  usb_c_receptacle_unresolved:
    refdes: J1
    status: review_required
    layout_guide_md:
      sections:
        - heading: Identity Review
          findings:
            - "No manufacturer-backed identity is available."
            - "Do not invent datasheets, EVAL material, or layout guidance."
          citations: []
          open_questions:
            - "Need manufacturer part number or owner-approved source identity before any layout guide can be authored."
```

```yaml
source_map_summary:
  cited_findings:
    - source_file: DATA Sheet/LT3045_datasheet.pdf
      source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      page_number: 22
      span_id: U1_DS_p22_decoupling
      extraction_promotion_method: cited_finding
      output_path: "Layout Guide/findings/U1_DS_p22_decoupling.md"
    - source_file: DATA Sheet/LT3045_datasheet.pdf
      source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      page_number: 24
      span_id: U1_DS_p24_thermal
      extraction_promotion_method: cited_finding
      output_path: "Layout Guide/findings/U1_DS_p24_thermal.md"
    - source_file: EVAL/DC2222A_user_guide.pdf
      source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      page_number: 6
      span_id: U1_EVAL_p6_reference_layout
      extraction_promotion_method: cited_finding
      output_path: "Layout Guide/findings/U1_EVAL_p6_reference_layout.md"
    - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
      source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
      page_number: 14
      span_id: U2_DS_p14_thermal
      extraction_promotion_method: cited_finding
      output_path: "Layout Guide/findings/U2_DS_p14_thermal.md"
    - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
      source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
      page_number: 17
      span_id: U2_DS_p17_power_path
      extraction_promotion_method: cited_finding
      output_path: "Layout Guide/findings/U2_DS_p17_power_path.md"
    - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      page_number: 3
      span_id: U2_SUP_p3_layout
      extraction_promotion_method: cited_finding
      output_path: "Layout Guide/findings/U2_SUP_p3_layout.md"
  supplemental_sources:
    - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      source_url: https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf
      page_number: 3
      span_id: U2_SUP_p3_layout
      extraction_promotion_method: approved_supplemental_source
      output_path: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  figures:
    - source_file: DATA Sheet/LT3045_datasheet.pdf
      source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      page_number: 24
      anchor: U1_fig_ds_p24
      extraction_promotion_method: full_page_figure_render
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      page_number: 3
      anchor: U2_fig_sup_p3
      extraction_promotion_method: full_page_figure_render
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
  tables:
    - source_file: EVAL/DC2222A_user_guide.pdf
      source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      page_number: 7
      anchor: U1_table_eval_p7_jumpers
      extraction_promotion_method: layout_only_table_promotion
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
```

```yaml
layout_guide_citation_map:
  - source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    page_number: 22
    citation_anchors:
      - U1_DS_p22_decoupling
    dedupe_key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22
  - source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    page_number: 24
    citation_anchors:
      - U1_DS_p24_thermal
      - U1_fig_ds_p24
    dedupe_key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24
  - source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 6
    citation_anchors:
      - U1_EVAL_p6_reference_layout
    dedupe_key: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6
  - source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 7
    citation_anchors:
      - U1_table_eval_p7_jumpers
    dedupe_key: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p7
  - source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 14
    citation_anchors:
      - U2_DS_p14_thermal
    dedupe_key: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14
  - source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 17
    citation_anchors:
      - U2_DS_p17_power_path
    dedupe_key: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17
  - source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
    page_number: 3
    citation_anchors:
      - U2_SUP_p3_layout
      - U2_fig_sup_p3
    dedupe_key: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - component_key: analog_devices_lt3045edd_1
      candidate_id: U1_fig_ds_p24
      source_file: DATA Sheet/LT3045_datasheet.pdf
      source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      page_number: 24
      output_path: Layout Guide/figures/U1_fig_ds_p24.png
      reason: cited layout/thermal pad drawing
    - component_key: microchip_mcp73831t_2aci_ot
      candidate_id: U2_fig_sup_p3
      source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      page_number: 3
      output_path: Layout Guide/figures/U2_fig_sup_p3.png
      reason: cited example charger board placement drawing
  layout_only_tables_to_promote:
    - component_key: analog_devices_lt3045edd_1
      candidate_id: U1_table_eval_p7_jumpers
      source_file: EVAL/DC2222A_user_guide.pdf
      source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      page_number: 7
      output_path: Layout Guide/tables/U1_table_eval_p7_jumpers.md
      reason: board setup context retained
  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      candidate_id: U1_table_eval_p2_revision_history
      source_file: EVAL/DC2222A_user_guide.pdf
      page_number: 2
      reason: revision history, not layout guidance
    - component_key: microchip_mcp73831t_2aci_ot
      candidate_id: U2_table_ds_p4_ordering
      source_file: DATA Sheet/MCP73831_family_datasheet.pdf
      page_number: 4
      reason: ordering codes, not layout guidance
  low_confidence_or_missing_tool_notes:
    - "No real OCR/Camelot/PyMuPDF was used; all promotions are fixture-driven."
    - "U2 local EVAL material is missing, so final readiness depends on the approved supplemental app note."
```

```yaml
extraction_manifest:
  workflow_id: component_pcb_layout_guide_extraction
  fixture_type: public_safe_synthetic
  processed_docs:
    - component_key: analog_devices_lt3045edd_1
      source_file: DATA Sheet/LT3045_datasheet.pdf
      cache_status: new_index_required
    - component_key: analog_devices_lt3045edd_1
      source_file: EVAL/DC2222A_user_guide.pdf
      cache_status: new_index_required
    - component_key: analog_devices_lt3045edd_1
      source_file: EVAL/DC2222A_design_files.zip
      cache_status: inspect_archive_manifest_only
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: DATA Sheet/MCP73831_family_datasheet.pdf
      cache_status: existing_index_reusable
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      cache_status: mock_saved
  cache_hits:
    - DATA Sheet/MCP73831_family_datasheet.pdf
  cache_misses:
    - DATA Sheet/LT3045_datasheet.pdf
    - EVAL/DC2222A_user_guide.pdf
  candidate_span_count: 6
  supplemental_docs: 1
  figure_count: 2
  table_count: 2
  rejected_candidates: 2
  tool_use_status:
    network: not_used
    local_files: not_used
    pdf_rendering: not_used
    ocr: not_used
    camelot: not_used
    pymupdf: not_used
    file_writes: not_used
  warnings:
    - "J1 has no approved identity or source evidence."
    - "Only fixture-provided spans and candidates were used."
    - "U2 local EVAL coverage gap was closed by an approved supplemental app note."
  open_questions:
    - "Resolve J1 manufacturer identity before any layout guidance is drafted."
```

```yaml
rejected_visual_table_candidates:
  - component_key: analog_devices_lt3045edd_1
    candidate_id: U1_table_eval_p2_revision_history
    candidate_type: table
    source_file: EVAL/DC2222A_user_guide.pdf
    source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 2
    reason: revision history is not board layout guidance
  - component_key: microchip_mcp73831t_2aci_ot
    candidate_id: U2_table_ds_p4_ordering
    candidate_type: table
    source_file: DATA Sheet/MCP73831_family_datasheet.pdf
    source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 4
    reason: ordering codes are not layout guidance
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: pass
  notes:
    - "No runtime absolute paths, customer data, secrets, cookies, or non-fixture source material included."
    - "No claims of downloads, browsing, rendering, OCR, or file writes."
  ready_components:
    - analog_devices_lt3045edd_1
    - microchip_mcp73831t_2aci_ot
  blocked_or_review_components:
    - usb_c_receptacle_unresolved
  next_owner_actions:
    - "Promote U1 cited findings, page 24 figure, and page 7 layout-only table into Layout Guide."
    - "Mark U2 ready using datasheet spans plus approved supplemental app note citation."
    - "Resolve J1 identity before any further extraction or guide drafting."
```

Recommendation: write the packet exactly from these citations, then stop on J1 until owner identity is approved.