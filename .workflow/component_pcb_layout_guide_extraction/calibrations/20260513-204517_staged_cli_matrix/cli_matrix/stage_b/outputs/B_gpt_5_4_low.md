```yaml
profile:
  model: gpt-5.4
  reasoning_effort: low
  species: elf
  class: archivist
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  runtime_absolute_paths_forbidden: true
  components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      identity_status: source_backed
      source_docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          cache_status: new_index_required
          page_count: 44
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          cache_status: new_index_required
          page_count: 12
        - source_file: "EVAL/DC2222A_design_files.zip"
          source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          cache_status: inspect_archive_manifest_only
          archive_manifest_notes:
            - entry_name: "README_layout_notes.txt"
              candidate_doc: true
              reason: "layout keyword in entry name"
            - entry_name: "gerbers/top_copper.gbr"
              candidate_doc: false
              reason: "CAD/runtime reference file, not AI text source"
      review_required: false
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      identity_status: source_backed
      source_docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          cache_status: existing_index_reusable
          page_count: 32
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          cache_status: mock_saved
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          official_or_owner_approved: true
          page_count: 8
      local_eval_material_status: none_found
      review_required: false
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      identity_status: review_required
      source_docs: []
      review_required: true
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
  review_required_components:
    - J1
```

```yaml
per_component_layout_guides:
  U1:
    component_key: analog_devices_lt3045edd_1
    output_path: "analog_devices_lt3045edd_1/Layout Guide/layout_guide.md"
    sections:
      - section: Overview
        findings:
          - statement: "Layout guidance is source-backed by the regulator datasheet and reinforced by the local evaluation-board guide."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 22
                span_id: U1_DS_p22_decoupling
                anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
              - source_file: "EVAL/DC2222A_user_guide.pdf"
                source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                page_number: 6
                span_id: U1_EVAL_p6_reference_layout
                anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      - section: Placement And Decoupling
        findings:
          - statement: "Place input and output capacitors close to the regulator pins and keep their connections short and low impedance."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 22
                span_id: U1_DS_p22_decoupling
                anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
          - statement: "Keep the regulator, nearby capacitors, and sense/measurement nodes compact so the local current loop and observation points remain controlled."
            citations:
              - source_file: "EVAL/DC2222A_user_guide.pdf"
                source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                page_number: 6
                span_id: U1_EVAL_p6_reference_layout
                anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      - section: Grounding And Return Control
        findings:
          - statement: "Use a continuous local ground area around the regulator and adjacent support parts."
            citations:
              - source_file: "EVAL/DC2222A_user_guide.pdf"
                source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                page_number: 6
                span_id: U1_EVAL_p6_reference_layout
                anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      - section: Thermal And Exposed Pad
        findings:
          - statement: "Tie the exposed pad and adjacent copper into the ground or thermal plane with multiple vias to spread heat."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 24
                span_id: U1_DS_p24_thermal
                anchor: SYNTHETIC_U1_DS_P24_THERMAL
      - section: Reference Layout Figures
        findings:
          - statement: "Include the cited page-24 datasheet layout/thermal drawing as the primary promoted figure for this guide."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 24
                anchor: page_24_figure_context
      - section: Open Questions
        findings:
          - statement: "The archive manifest suggests README_layout_notes.txt may contain layout-relevant notes, but no approved synthetic span was provided for extraction."
            citations:
              - source_file: "EVAL/DC2222A_design_files.zip"
                source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
                anchor: archive_manifest_only

  U2:
    component_key: microchip_mcp73831t_2aci_ot
    output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/layout_guide.md"
    sections:
      - section: Overview
        findings:
          - statement: "The datasheet provides baseline routing and thermal guidance, and final layout readiness is reinforced by an approved supplemental app note because no local evaluation material is present."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 14
                span_id: U2_DS_p14_thermal
                anchor: SYNTHETIC_U2_DS_P14_THERMAL
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 17
                span_id: U2_DS_p17_power_path
                anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: U2_SUP_p3_layout
                anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      - section: Placement And Decoupling
        findings:
          - statement: "Keep the input capacitor close and route battery and charge paths with short, direct connections."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 17
                span_id: U2_DS_p17_power_path
                anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: U2_SUP_p3_layout
                anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      - section: Ground Return And Routing Hygiene
        findings:
          - statement: "Keep sense and charge paths clear of noisy nodes and maintain a clean ground return."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 17
                span_id: U2_DS_p17_power_path
                anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: U2_SUP_p3_layout
                anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      - section: Thermal
        findings:
          - statement: "Thermal performance depends on board copper area and package-to-board heat spreading, so copper allocation should be treated as a layout variable."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 14
                span_id: U2_DS_p14_thermal
                anchor: SYNTHETIC_U2_DS_P14_THERMAL
      - section: Supplemental Reference Figure
        findings:
          - statement: "Include the approved page-3 app-note placement drawing as the promoted figure supporting final layout readiness."
            citations:
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                anchor: page_3_figure_context
      - section: Open Questions
        findings:
          - statement: "No local EVAL board or drawing was present; if owner-specific charging-current or connector constraints exist, they still need project-side confirmation."
            citations:
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: U2_SUP_p3_layout
                anchor: SYNTHETIC_U2_SUP_P3_LAYOUT

  J1:
    component_key: usb_c_receptacle_unresolved
    output_path: "usb_c_receptacle_unresolved/Layout Guide/layout_guide.md"
    status: review_required
    sections:
      - section: Review Hold
        findings:
          - statement: "No manufacturer-backed identity or owner-approved source set is available. Do not create layout guidance."
            citations: []
```

```yaml
source_map_summary:
  findings:
    - finding_id: U1_F1
      refdes: U1
      statement: "Capacitors close to regulator pins with short, low-impedance traces."
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: U1_DS_p22_decoupling
      anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
      extraction_or_promotion_method: synthetic_span_to_markdown
      output_path: "analog_devices_lt3045edd_1/Layout Guide/layout_guide.md"
    - finding_id: U1_F2
      refdes: U1
      statement: "Exposed pad and nearby copper tied into ground/thermal plane with multiple vias."
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: U1_DS_p24_thermal
      anchor: SYNTHETIC_U1_DS_P24_THERMAL
      extraction_or_promotion_method: synthetic_span_to_markdown
      output_path: "analog_devices_lt3045edd_1/Layout Guide/layout_guide.md"
    - finding_id: U1_F3
      refdes: U1
      statement: "Compact regulator-capacitor-sense arrangement over continuous ground area."
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: U1_EVAL_p6_reference_layout
      anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      extraction_or_promotion_method: synthetic_span_to_markdown
      output_path: "analog_devices_lt3045edd_1/Layout Guide/layout_guide.md"
    - finding_id: U2_F1
      refdes: U2
      statement: "Thermal behavior depends on copper area and board heat spreading."
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: U2_DS_p14_thermal
      anchor: SYNTHETIC_U2_DS_P14_THERMAL
      extraction_or_promotion_method: synthetic_span_to_markdown
      output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/layout_guide.md"
    - finding_id: U2_F2
      refdes: U2
      statement: "Keep battery and input capacitor routing short; keep sense and charge paths clear of noisy nodes."
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: U2_DS_p17_power_path
      anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
      extraction_or_promotion_method: synthetic_span_to_markdown
      output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/layout_guide.md"
    - finding_id: U2_F3
      refdes: U2
      statement: "Supplemental app note emphasizes close input capacitor placement, clean ground return, and short battery connector routing."
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: U2_SUP_p3_layout
      anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      extraction_or_promotion_method: synthetic_span_to_markdown
      output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/layout_guide.md"
  supplemental_sources:
    - refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: U2_SUP_p3_layout
      anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      extraction_or_promotion_method: approved_mock_supplemental_source
      output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  promoted_figures:
    - refdes: U1
      candidate_id: U1_fig_ds_p24
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      anchor: page_24_figure_context
      extraction_or_promotion_method: cited_full_page_figure_render
      output_path: "analog_devices_lt3045edd_1/Layout Guide/figures/U1_fig_ds_p24.png"
    - refdes: U2
      candidate_id: U2_fig_sup_p3
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      anchor: page_3_figure_context
      extraction_or_promotion_method: cited_full_page_figure_render
      output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/figures/U2_fig_sup_p3.png"
  promoted_tables: []
```

```yaml
layout_guide_citation_map:
  cited_source_file_page_pairs:
    - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa::22"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      citation_anchors:
        - SYNTHETIC_U1_DS_P22_DECOUPLING
    - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa::24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      citation_anchors:
        - SYNTHETIC_U1_DS_P24_THERMAL
        - page_24_figure_context
    - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb::6"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      citation_anchors:
        - SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
    - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd::14"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      citation_anchors:
        - SYNTHETIC_U2_DS_P14_THERMAL
    - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd::17"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      citation_anchors:
        - SYNTHETIC_U2_DS_P17_POWER_PATH
    - dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee::3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      citation_anchors:
        - SYNTHETIC_U2_SUP_P3_LAYOUT
        - page_3_figure_context
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_or_promote:
    - refdes: U1
      candidate_id: U1_fig_ds_p24
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      reason: "Unique cited datasheet page with recommended layout and thermal-pad drawing."
      output_path: "analog_devices_lt3045edd_1/Layout Guide/figures/U1_fig_ds_p24.png"
    - refdes: U2
      candidate_id: U2_fig_sup_p3
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      reason: "Unique cited approved supplemental placement drawing supporting final readiness."
      output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/figures/U2_fig_sup_p3.png"
  layout_only_tables_to_promote: []
  context_only_items:
    - refdes: U1
      candidate_id: U1_table_eval_p7_jumpers
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      reason: "High table quality but board setup/jumper context, not direct reusable layout guidance."
  missing_tool_or_low_confidence_notes:
    - "This packet records intended promotion/extraction only; no rendering, OCR, Camelot parse, or file generation is claimed."
    - "U1 archive manifest indicates a possible layout note file, but no approved span exists for evidence promotion."
```

```yaml
extraction_manifest:
  processed_docs:
    - refdes: U1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      cache_status: new_index_required
    - refdes: U1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      cache_status: new_index_required
    - refdes: U1
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: inspect_archive_manifest_only
    - refdes: U2
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      cache_status: existing_index_reusable
    - refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      cache_status: mock_saved
  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses_or_new_index_required:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
  candidate_span_count:
    total: 6
    by_refdes:
      U1: 3
      U2: 3
      J1: 0
  supplemental_docs:
    - refdes: U2
      count: 1
      approved: 1
  figure_counts:
    candidates_total: 2
    promoted_total: 2
    context_only_total: 0
  table_counts:
    candidates_total: 3
    promoted_total: 0
    context_only_total: 1
    rejected_total: 2
  rejected_candidates:
    - U1_table_eval_p2_revision_history
    - U2_table_ds_p4_ordering
  tool_use_status:
    network_access: not_used
    local_file_reads: not_used
    browser_actions: not_used
    pdf_rendering: not_claimed
    ocr: not_claimed
    camelot_execution: not_claimed
    pymupdf_execution: not_claimed
    file_writes: not_claimed
  warnings:
    - "J1 remains blocked with no source identity."
    - "U2 has no local EVAL material; readiness depends on datasheet plus approved supplemental app-note evidence."
    - "U1 archive ZIP contains a candidate text entry by manifest only, without approved extractable span."
  open_questions:
    - "U1: whether README_layout_notes.txt adds actionable layout detail beyond current cited spans."
    - "U2: whether project-specific battery connector placement constraints require owner confirmation."
```

```yaml
rejected_visual_table_candidates:
  rejected:
    - refdes: U1
      candidate_id: U1_table_eval_p2_revision_history
      candidate_type: table
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 2
      reason: "Revision history is explicitly non-layout guidance."
    - refdes: U2
      candidate_id: U2_table_ds_p4_ordering
      candidate_type: table
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 4
      reason: "Ordering-code table is explicitly non-layout guidance."
  not_promoted_but_retained_as_context:
    - refdes: U1
      candidate_id: U1_table_eval_p7_jumpers
      candidate_type: table
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
      reason: "Board setup/jumper table is not strong standalone layout guidance; keep only as context."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict:
    status: pass
    notes:
      - "Only fixture-provided mocked files, checksums, URLs, page numbers, span IDs, and anchors were used."
      - "No runtime absolute paths, real project data, copied vendor text, credentials, or network/local reads were introduced."
  ready_components:
    - refdes: U1
      component_key: analog_devices_lt3045edd_1
      readiness: ready_with_source_backed_layout_guide
      basis:
        - datasheet decoupling span
        - datasheet thermal/exposed-pad span
        - local EVAL reference-layout span
    - refdes: U2
      component_key: microchip_mcp73831t_2aci_ot
      readiness: ready_with_supplemental_source_backed_layout_guide
      basis:
        - reusable datasheet index
        - datasheet thermal/routing spans
        - approved supplemental app-note span
        - local_eval_material_status none_found explicitly handled
  blocked_or_review_components:
    - refdes: J1
      component_key: usb_c_receptacle_unresolved
      readiness: blocked_review_required
      reason: "No manufacturer-backed identity or owner-approved source evidence."
  next_owner_actions:
    - "Write U1 and U2 layout_guide.md files from the cited findings and promote only the two cited unique figure pages under each component Layout Guide/figures/."
    - "Do not promote any tables for U1 or U2."
    - "Keep J1 on hold until a resolved manufacturer part and approved source set are supplied."
    - "If later authorized evidence appears for U1 archive README_layout_notes.txt, review it separately before updating citations."
```

Recommendation: proceed with runner writeout for `U1` and `U2`, and keep `J1` blocked pending source-backed identity resolution.