**Profile**
```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: elf
  class: auditor
```

**Parts Binding And Inventory**
```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  expected_component_folders:
    - "DATA Sheet"
    - "EVAL"
    - "Layout Guide"
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

**Per Component Layout Guides**
```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    status: source_backed
    layout_guide_sections:
      source_docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 22
          span_id: "U1_DS_p22_decoupling"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
          finding: "Place input and output capacitors close to the regulator pins with short, low-impedance traces."
          synthesis_focus:
            - decoupling
            - bypass capacitor placement
            - power routing
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 24
          span_id: "U1_DS_p24_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          finding: "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias for heat spreading."
          synthesis_focus:
            - thermal
            - exposed pad
            - vias
            - ground plane
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_number: 6
          span_id: "U1_EVAL_p6_reference_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
          finding: "The evaluation board layout keeps the regulator, capacitors, and measurement sense points compact around a continuous ground area."
          synthesis_focus:
            - evaluation board layout
            - grounding
            - reference layout
      figures_and_tables:
        - output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
          source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 24
          promotion_reason: "Full-page render is cited by the final layout guide and matches the thermal pad drawing."
        - output_path: "Layout Guide/tables/U1_table_eval_p7_jumper_layout_context.md"
          source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_number: 7
          promotion_reason: "Board setup context retained; jumper/load connector table supports reference-board usage."
      open_questions: []
  microchip_mcp73831t_2aci_ot:
    refdes: U2
    status: source_backed
    layout_guide_sections:
      source_docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 14
          span_id: "U2_DS_p14_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
          finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
          synthesis_focus:
            - thermal
            - ground plane
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 17
          span_id: "U2_DS_p17_power_path"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          finding: "Battery and input capacitor routing should be short, with the sense and charge paths kept clear of noisy switching nodes."
          synthesis_focus:
            - battery trace
            - power routing
            - decoupling
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          page_number: 3
          span_id: "U2_SUP_p3_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
          finding: "The app note emphasizes close placement of the input capacitor, a clean ground return, and short battery connector routing."
          synthesis_focus:
            - decoupling
            - ground return
            - battery connector placement
      figures_and_tables:
        - output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
          source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          page_number: 3
          promotion_reason: "Approved supplemental source is cited by the final layout guide and shows charger board placement."
      open_questions: []
  usb_c_receptacle_unresolved:
    refdes: J1
    status: review_required
    layout_guide_sections: []
    open_questions:
      - "Manufacturer part number is missing."
      - "No owner-approved source identity exists."
      - "No datasheet or EVAL source material may be invented."
```

**Source Map Summary**
```yaml
source_map_summary:
  cited_findings:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: "U1_DS_p22_decoupling"
      extraction_method: "synthetic_span_to_layout_guidance"
      output_path: "Layout Guide/layout_guide.md#u1-decoupling"
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: "U1_DS_p24_thermal"
      extraction_method: "synthetic_span_to_layout_guidance"
      output_path: "Layout Guide/layout_guide.md#u1-thermal"
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: "U1_EVAL_p6_reference_layout"
      extraction_method: "synthetic_span_to_layout_guidance"
      output_path: "Layout Guide/layout_guide.md#u1-reference-layout"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: "U2_DS_p14_thermal"
      extraction_method: "synthetic_span_to_layout_guidance"
      output_path: "Layout Guide/layout_guide.md#u2-thermal"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: "U2_DS_p17_power_path"
      extraction_method: "synthetic_span_to_layout_guidance"
      output_path: "Layout Guide/layout_guide.md#u2-power-path"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: "U2_SUP_p3_layout"
      extraction_method: "approved_supplemental_source_to_layout_guidance"
      output_path: "Layout Guide/layout_guide.md#u2-supplemental-layout"
  supplemental_sources:
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
      mapped_to_component: "microchip_mcp73831t_2aci_ot"
  figures:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      candidate_id: "U1_fig_ds_p24"
      extraction_method: "cited_full_page_render"
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      candidate_id: "U2_fig_sup_p3"
      extraction_method: "cited_full_page_render"
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
  tables:
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      candidate_id: "U1_table_eval_p7_jumpers"
      extraction_method: "layout_context_table_promotion"
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumper_layout_context.md"
```

**Layout Guide Citation Map**
```yaml
layout_guide_citation_map:
  cited_page_pairs:
    - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      citation_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#22"
    - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      citation_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#24"
    - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      citation_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb#6"
    - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      citation_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#14"
    - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      citation_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#17"
    - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      citation_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee#3"
```

**Figure Table Extraction Summary**
```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_promote:
    - candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
      reason: "Thermal pad and recommended layout are cited in U1 layout guidance."
    - candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
      reason: "Approved supplemental app note is cited in U2 layout guidance."
  layout_only_tables_to_promote:
    - candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumper_layout_context.md"
      reason: "Retains board setup context relevant to reference layout use."
  context_only_items:
    - source_file: "EVAL/DC2222A_design_files.zip"
      entry_name: "README_layout_notes.txt"
      reason: "Candidate doc inside archive manifest only; not promoted as figure or table."
  missing_tool_or_low_confidence_notes:
    - "No actual PDF rendering, OCR, Camelot, or PyMuPDF execution is claimed."
    - "All promotions are based only on synthetic spans and candidate metadata from the fixture."
```

**Extraction Manifest**
```yaml
extraction_manifest:
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
  figure_count: 2
  table_count: 1
  rejected_candidates: 2
  tool_use_status:
    network: "not used"
    local_file_reads: "not used"
    downloads: "not claimed"
    pdf_rendering: "not claimed"
    ocr: "not claimed"
    camelot: "not claimed"
    pymupdf: "not claimed"
    file_writes: "not claimed"
  warnings:
    - "J1 remains unresolved and must not receive fabricated layout guidance."
    - "Only synthetic excerpt anchors and mocked checksums were used."
  open_questions:
    - "None for U1 and U2."
    - "J1 requires manufacturer-approved identity before any layout guide can be generated."
```

**Rejected Visual Table Candidates**
```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    candidate_type: "table"
    rejection_reason: "Revision history is not board layout guidance and must not be promoted."
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    candidate_type: "table"
    rejection_reason: "Ordering codes are not layout guidance and must not be promoted."
```

**Boundary And Readiness Review**
```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_or_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Write U1 Layout Guide content from the cited decoupling, thermal, grounding, and EVAL reference-layout spans."
    - "Write U2 Layout Guide content from the datasheet spans plus the approved supplemental app note, and mark final layout readiness based on that source."
    - "Keep J1 in review_required until a manufacturer-backed identity and source evidence are supplied."
```

Recommendation: generate the Markdown files and promoted assets exactly from the cited source-file/page pairs above, and leave J1 untouched until identity is resolved.