**Workflow Output Packet**
```yaml
profile:
  model: gpt-5.5
  reasoning_effort: xhigh
  species: elf
  class: archivist

parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  expected_component_folders:
    - "DATA Sheet"
    - "EVAL"
    - "Layout Guide"
  components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      identity_status: source_backed
      cache_status: new_index_required
      source_docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_count: 44
          cache_status: new_index_required
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_count: 12
          cache_status: new_index_required
        - source_file: "EVAL/DC2222A_design_files.zip"
          source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          cache_status: inspect_archive_manifest_only
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      identity_status: source_backed
      cache_status: existing_index_reusable
      source_docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_count: 32
          cache_status: existing_index_reusable
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          official_or_owner_approved: true
          page_count: 8
          cache_status: mock_saved
      coverage_gap: "Local EVAL material none_found; approved supplemental app note used for final layout readiness."
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      identity_status: review_required
      source_docs: []
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
  review_required_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      identity_and_source_status:
        status: source_backed
        findings:
          - "Use LT3045 datasheet and DC2222A user guide as source-bound layout evidence."
      decoupling_and_power_routing:
        findings:
          - summary: "Place input and output capacitors close to regulator pins using short, low-impedance routing."
            citation_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            span_id: U1_DS_p22_decoupling
      thermal_exposed_pad_and_ground:
        findings:
          - summary: "Tie the exposed pad and nearby copper to the ground/thermal plane with multiple vias for heat spreading."
            citation_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
            span_id: U1_DS_p24_thermal
      eval_reference_layout:
        findings:
          - summary: "Use the evaluation layout as a compact placement reference around the regulator, capacitors, sense points, and continuous ground area."
            citation_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            span_id: U1_EVAL_p6_reference_layout
      figures_and_tables:
        cited_figures:
          - output_path: "figures/LT3045_datasheet_p24_full_page.png"
            source_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
        promoted_tables:
          - output_path: "tables/DC2222A_user_guide_p7_jumpers.csv"
            reason: "Board setup connector/jumper context retained; accuracy 98.2, whitespace 21.0."
      open_questions:
        - "Confirm whether README_layout_notes.txt from the ZIP should be owner-approved as an AI text source before use."

  microchip_mcp73831t_2aci_ot:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      identity_and_source_status:
        status: source_backed
        findings:
          - "Datasheet cache is reusable; no local EVAL material found."
          - "Approved supplemental app note is included under Layout Guide/source_docs for final layout readiness."
      thermal_and_ground:
        findings:
          - summary: "Size copper and ground heat-spreading area with thermal behavior in mind."
            citation_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
            span_id: U2_DS_p14_thermal
      power_battery_and_decoupling_routing:
        findings:
          - summary: "Keep battery and input capacitor routing short and keep sense/charge paths clear of noisy switching nodes."
            citation_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            span_id: U2_DS_p17_power_path
      supplemental_layout_readiness:
        findings:
          - summary: "Use close input capacitor placement, clean ground return, and short battery connector routing from the approved supplemental app note."
            citation_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            span_id: U2_SUP_p3_layout
      figures_and_tables:
        cited_figures:
          - output_path: "figures/MCP73831_layout_app_note_p3_full_page.png"
            source_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
        promoted_tables: []
      open_questions:
        - "None blocking after approved supplemental source is included."

  usb_c_receptacle_unresolved:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      identity_and_source_status:
        status: review_required
        findings: []
      open_questions:
        - "Owner must provide manufacturer part number and owner-approved source evidence before layout guidance is generated."
```

```yaml
source_map_summary:
  analog_devices_lt3045edd_1:
    - finding: "U1 decoupling and power routing"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: U1_DS_p22_decoupling
      anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      extraction_promotion_method: "synthetic span promoted to layout_guide.md finding"
      output_path: "layout_guide.md"
    - finding: "U1 thermal exposed pad and ground vias"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: U1_DS_p24_thermal
      anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      extraction_promotion_method: "synthetic span promoted to layout_guide.md finding; cited page eligible for full-page figure promotion"
      output_path: "layout_guide.md"
    - finding: "U1 evaluation reference layout"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: U1_EVAL_p6_reference_layout
      anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      extraction_promotion_method: "synthetic span promoted to layout_guide.md finding"
      output_path: "layout_guide.md"
    - finding: "U1 thermal full-page figure"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: U1_DS_p24_thermal
      anchor: U1_fig_ds_p24
      extraction_promotion_method: "promote cited unique full-page render"
      output_path: "figures/LT3045_datasheet_p24_full_page.png"
    - finding: "U1 board setup/layout table"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      span_id: null
      anchor: U1_table_eval_p7_jumpers
      extraction_promotion_method: "promote layout-context table with quality metrics"
      output_path: "tables/DC2222A_user_guide_p7_jumpers.csv"

  microchip_mcp73831t_2aci_ot:
    - finding: "U2 thermal and ground heat spreading"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: U2_DS_p14_thermal
      anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      extraction_promotion_method: "cached synthetic span promoted to layout_guide.md finding"
      output_path: "layout_guide.md"
    - finding: "U2 battery, input capacitor, and charge-path routing"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: U2_DS_p17_power_path
      anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      extraction_promotion_method: "cached synthetic span promoted to layout_guide.md finding"
      output_path: "layout_guide.md"
    - finding: "U2 approved supplemental layout readiness"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: U2_SUP_p3_layout
      anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_promotion_method: "approved supplemental synthetic span promoted to layout_guide.md finding"
      output_path: "layout_guide.md"
    - finding: "U2 supplemental full-page figure"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: U2_SUP_p3_layout
      anchor: U2_fig_sup_p3
      extraction_promotion_method: "promote cited unique full-page render"
      output_path: "figures/MCP73831_layout_app_note_p3_full_page.png"

  usb_c_receptacle_unresolved: []
```

```yaml
layout_guide_citation_map:
  - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
  - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
      - U1_fig_ds_p24
  - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
  - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
  - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
  - dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
      - U2_fig_sup_p3
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_promote:
    - component_key: analog_devices_lt3045edd_1
      candidate_id: U1_fig_ds_p24
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      reason: "Cited by final layout guide for thermal/exposed-pad guidance."
      output_path: "Layout Guide/figures/LT3045_datasheet_p24_full_page.png"
    - component_key: microchip_mcp73831t_2aci_ot
      candidate_id: U2_fig_sup_p3
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      reason: "Cited by final layout guide for supplemental placement guidance."
      output_path: "Layout Guide/figures/MCP73831_layout_app_note_p3_full_page.png"
  layout_tables_to_promote:
    - component_key: analog_devices_lt3045edd_1
      candidate_id: U1_table_eval_p7_jumpers
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
      reason: "Board setup connector/jumper context retained."
      output_path: "Layout Guide/tables/DC2222A_user_guide_p7_jumpers.csv"
  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      note: "Archive manifest inspected only; README_layout_notes.txt is a candidate doc but not promoted without owner approval."
  missing_tool_or_low_confidence_notes:
    - "No actual rendering, Camelot extraction, OCR, PyMuPDF, browser, network, or file writes were performed; this packet records synthetic intended promotions only."
```

```yaml
extraction_manifest:
  processed_docs:
    - component_key: analog_devices_lt3045edd_1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      cache_status: new_index_required
      candidate_span_count: 2
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      cache_status: new_index_required
      candidate_span_count: 1
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      cache_status: existing_index_reusable
      candidate_span_count: 2
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      cache_status: mock_saved
      candidate_span_count: 1
      supplemental: true
  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
  supplemental_docs:
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
  totals:
    candidate_span_count: 6
    full_page_figure_candidates: 2
    full_page_figures_promoted: 2
    table_candidates: 3
    tables_promoted: 1
    rejected_candidates: 2
    review_required_components: 1
  tool_use_status:
    network_access: not_used
    local_project_file_reads: not_used
    command_execution: not_used
    pdf_rendering: not_performed
    ocr: not_performed
    camelot: not_performed
    pymupdf: not_performed
    file_writes: not_performed
  warnings:
    - "J1 remains review_required with no layout guidance."
    - "U2 had no local EVAL material; final readiness depends on the approved mocked supplemental source."
    - "U1 ZIP entries are not used as AI text sources unless separately approved."
  open_questions:
    - "Provide manufacturer-backed identity and source package for J1."
    - "Decide whether U1 README_layout_notes.txt should be approved for a later source-bound pass."
```

```yaml
rejected_visual_table_candidates:
  - component_key: analog_devices_lt3045edd_1
    candidate_id: U1_table_eval_p2_revision_history
    candidate_type: table
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    camelot_accuracy: 96.0
    camelot_whitespace: 18.5
    reason: "Revision history is not board layout guidance."
  - component_key: microchip_mcp73831t_2aci_ot
    candidate_id: U2_table_ds_p4_ordering
    candidate_type: table
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    camelot_accuracy: 99.1
    camelot_whitespace: 12.0
    reason: "Ordering codes are not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: pass
  boundary_notes:
    - "Packet uses only fixture-provided mocked files, checksums, URLs, page numbers, spans, anchors, and candidates."
    - "No runtime absolute paths, credentials, secrets, customer data, downloads, command output, or real vendor text included."
  ready_components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      readiness: ready_for_runner_write
      basis:
        - "Source-backed datasheet and EVAL spans cover decoupling, thermal/exposed pad, grounding, and reference layout."
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      readiness: ready_for_runner_write_with_supplemental_source
      basis:
        - "Reusable datasheet cache plus approved mocked supplemental app note cover thermal, routing, decoupling, ground return, and battery connector placement."
  blocked_or_review_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      readiness: blocked_review_required
      reason: "No manufacturer-backed identity or owner-approved source evidence."
  next_owner_actions:
    - "Write U1 and U2 Layout Guide artifacts from this packet."
    - "Keep J1 blocked until source identity is supplied."
    - "Approve or reject U1 ZIP README_layout_notes.txt before any future use as text evidence."
```

Recommendation: proceed with U1 and U2 guide generation from the cited synthetic spans only, and hold J1 until the owner provides a manufacturer-backed source package.