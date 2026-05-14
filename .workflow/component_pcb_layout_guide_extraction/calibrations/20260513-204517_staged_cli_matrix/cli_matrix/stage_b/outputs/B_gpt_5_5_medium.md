```yaml
profile:
  model: gpt-5.5
  reasoning_effort: medium
  species: elf
  class: archivist
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  runtime_absolute_paths_forbidden: true
  expected_component_folders:
    - "DATA Sheet"
    - "EVAL"
    - "Layout Guide"

  components:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      identity_status: "source_backed"
      cache_status:
        "DATA Sheet/LT3045_datasheet.pdf": "new_index_required"
        "EVAL/DC2222A_user_guide.pdf": "new_index_required"
        "EVAL/DC2222A_design_files.zip": "inspect_archive_manifest_only"
      source_docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_count: 44
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_count: 12
        - source_file: "EVAL/DC2222A_design_files.zip"
          sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          archive_manifest_only: true

    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      identity_status: "source_backed"
      cache_status:
        "DATA Sheet/MCP73831_family_datasheet.pdf": "existing_index_reusable"
      source_docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_count: 32
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          official_or_owner_approved: true
          download_status: "mock_saved"
          page_count: 8
      local_eval_material_status: "none_found"

    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      identity_status: "review_required"
      source_docs: []
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."

  review_required_components:
    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      reason: "No manufacturer-backed identity or source evidence available."
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    output_path: "Layout Guide/layout_guide.md"
    status: "ready_from_source_backed_local_material"
    sections:
      overview:
        findings:
          - "LT3045 layout guidance is source-backed by local datasheet and evaluation-board material."
      decoupling_and_power_routing:
        findings:
          - finding: "Place input and output capacitors close to regulator pins with short, low-impedance routing."
            cite:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      thermal_and_exposed_pad:
        findings:
          - finding: "Tie the exposed pad and nearby copper into the ground or thermal plane with multiple vias for heat spreading."
            cite:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 24
              span_id: "U1_DS_p24_thermal"
              anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      grounding_and_reference_layout:
        findings:
          - finding: "Use the evaluation board as a compact reference: regulator, input/output capacitors, and measurement sense points are kept close around a continuous ground area."
            cite:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      promoted_figures_and_tables:
        figures:
          - "figures/U1_fig_ds_p24_page24.png"
        tables:
          - "tables/U1_table_eval_p7_jumpers.md"
      open_questions:
        - "Confirm whether project board current, copper area, and airflow require additional thermal review beyond the cited exposed-pad guidance."

  microchip_mcp73831t_2aci_ot:
    output_path: "Layout Guide/layout_guide.md"
    status: "ready_with_approved_supplemental_source"
    sections:
      overview:
        findings:
          - "Local datasheet cache is reusable, but no local EVAL material was found; final readiness uses the approved mocked supplemental layout app note."
      thermal_and_ground_plane:
        findings:
          - finding: "Thermal performance depends on copper area and package-to-board heat spreading."
            cite:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 14
              span_id: "U2_DS_p14_thermal"
              anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      power_battery_and_decoupling_routing:
        findings:
          - finding: "Keep battery and input capacitor routing short, and keep sense and charge paths clear of noisy switching nodes."
            cite:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 17
              span_id: "U2_DS_p17_power_path"
              anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      supplemental_layout_readiness:
        findings:
          - finding: "Approved supplemental guidance supports close input-capacitor placement, clean ground return, and short battery connector routing."
            cite:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      promoted_figures_and_tables:
        figures:
          - "figures/U2_fig_sup_p3_page3.png"
        tables: []
      open_questions:
        - "Confirm actual charge current, copper pour area, connector placement, and thermal limits against the project board constraints."

  usb_c_receptacle_unresolved:
    output_path: "Layout Guide/layout_guide.md"
    status: "blocked_review_required"
    sections:
      review_required:
        findings: []
        note: "No layout guidance generated. Manufacturer part number or owner-approved source identity is required before extraction."
      open_questions:
        - "Provide manufacturer part number and approved connector datasheet or drawing."
```

```yaml
source_map_summary:
  analog_devices_lt3045edd_1:
    - cited_finding: "Place input and output capacitors close to regulator pins with short, low-impedance routing."
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: "U1_DS_p22_decoupling"
      anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      extraction_promotion_method: "synthetic_span_to_markdown_citation"
      output_path: "layout_guide.md"

    - cited_finding: "Tie exposed pad and nearby copper into ground or thermal plane with multiple vias."
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: "U1_DS_p24_thermal"
      anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      extraction_promotion_method: "synthetic_span_to_markdown_citation; cited_full_page_figure_promoted"
      output_path: "layout_guide.md; figures/U1_fig_ds_p24_page24.png"

    - cited_finding: "Evaluation board keeps regulator, capacitors, sense points, and ground area compact."
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: "U1_EVAL_p6_reference_layout"
      anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      extraction_promotion_method: "synthetic_span_to_markdown_citation"
      output_path: "layout_guide.md"

    - cited_table: "Jumper/load connector board setup table"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      anchor: "U1_table_eval_p7_jumpers"
      extraction_promotion_method: "layout_context_table_promoted_with_quality_metrics"
      quality:
        camelot_accuracy: 98.2
        camelot_whitespace: 21.0
      output_path: "tables/U1_table_eval_p7_jumpers.md"

  microchip_mcp73831t_2aci_ot:
    - cited_finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: "U2_DS_p14_thermal"
      anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      extraction_promotion_method: "cache_reuse_synthetic_span_to_markdown_citation"
      output_path: "layout_guide.md"

    - cited_finding: "Battery and input capacitor routing should be short; sense and charge paths kept clear of noisy switching nodes."
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: "U2_DS_p17_power_path"
      anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      extraction_promotion_method: "cache_reuse_synthetic_span_to_markdown_citation"
      output_path: "layout_guide.md"

    - cited_finding: "Approved app note supports close input capacitor, clean ground return, and short battery connector routing."
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: "U2_SUP_p3_layout"
      anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_promotion_method: "approved_mock_supplemental_span_to_markdown_citation; cited_full_page_figure_promoted"
      output_path: "layout_guide.md; figures/U2_fig_sup_p3_page3.png"

  usb_c_receptacle_unresolved:
    source_map_entries: []
    reason: "No source-backed identity or cited findings."
```

```yaml
layout_guide_citation_map:
  cited_pairs:
    - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22"
      component_key: "analog_devices_lt3045edd_1"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      citation_anchors:
        - "SYNTHETIC_U1_DS_P22_DECOUPLING"
      span_ids:
        - "U1_DS_p22_decoupling"

    - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24"
      component_key: "analog_devices_lt3045edd_1"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      citation_anchors:
        - "SYNTHETIC_U1_DS_P24_THERMAL"
      span_ids:
        - "U1_DS_p24_thermal"
      promoted_full_page_render: "figures/U1_fig_ds_p24_page24.png"

    - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6"
      component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      citation_anchors:
        - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      span_ids:
        - "U1_EVAL_p6_reference_layout"

    - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p7"
      component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      citation_anchors:
        - "U1_table_eval_p7_jumpers"

    - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14"
      component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      citation_anchors:
        - "SYNTHETIC_U2_DS_P14_THERMAL"
      span_ids:
        - "U2_DS_p14_thermal"

    - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17"
      component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      citation_anchors:
        - "SYNTHETIC_U2_DS_P17_POWER_PATH"
      span_ids:
        - "U2_DS_p17_power_path"

    - dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3"
      component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      citation_anchors:
        - "SYNTHETIC_U2_SUP_P3_LAYOUT"
      span_ids:
        - "U2_SUP_p3_layout"
      promoted_full_page_render: "figures/U2_fig_sup_p3_page3.png"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_or_promote:
    - component_key: "analog_devices_lt3045edd_1"
      candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      reason: "Cited by final layout guide for thermal/exposed-pad guidance."
      output_path: "Layout Guide/figures/U1_fig_ds_p24_page24.png"

    - component_key: "microchip_mcp73831t_2aci_ot"
      candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      reason: "Cited approved supplemental layout source."
      output_path: "Layout Guide/figures/U2_fig_sup_p3_page3.png"

  layout_only_tables_to_promote:
    - component_key: "analog_devices_lt3045edd_1"
      candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      layout_context: "jumper/load connector table tied to reference board setup"
      quality:
        camelot_accuracy: 98.2
        camelot_whitespace: 21.0
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"

  context_only_items:
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_design_files.zip"
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      handling: "archive manifest inspected only"
      entries:
        - entry_name: "README_layout_notes.txt"
          candidate_doc: true
          note: "Candidate noted but no synthetic excerpt span supplied, so not cited."
        - entry_name: "gerbers/top_copper.gbr"
          candidate_doc: false
          note: "CAD/runtime reference file, not AI text source."

  missing_tool_or_low_confidence_notes:
    - "No actual rendering, OCR, Camelot, PyMuPDF, download, or file write occurred; this packet records intended synthetic promotions only."
    - "No low-confidence promoted table is present; promoted table has supplied quality metrics and board/setup context."
```

```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  calibration_id: "20260513-204517_staged_cli_matrix"
  fixture_type: "public_safe_synthetic"

  processed_docs:
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      cache_status: "new_index_required"
      candidate_span_count: 2
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      cache_status: "new_index_required"
      candidate_span_count: 1
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_design_files.zip"
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: "inspect_archive_manifest_only"
      candidate_span_count: 0
    - component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      cache_status: "existing_index_reusable"
      candidate_span_count: 2

  supplemental_docs:
    - component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
      download_status: "mock_saved"
      candidate_span_count: 1

  counts:
    components_total: 3
    ready_components: 2
    review_required_components: 1
    candidate_spans_total: 6
    cited_span_findings_total: 6
    full_page_figure_candidates_total: 2
    full_page_figures_promoted_total: 2
    table_candidates_total: 3
    tables_promoted_total: 1
    rejected_visual_table_candidates_total: 2

  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"

  cache_misses_or_new_indexes_required:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"

  rejected_candidates:
    - "U1_table_eval_p2_revision_history"
    - "U2_table_ds_p4_ordering"

  tool_use_status:
    network_access: "not_used"
    local_project_file_reads: "not_used"
    command_execution: "not_used"
    pdf_rendering: "not_performed"
    ocr: "not_performed"
    camelot: "not_performed"
    pymupdf: "not_performed"
    file_writes: "not_performed"

  warnings:
    - "This is a synthetic calibration output packet; all actions are intended runner outputs, not performed actions."
    - "AI synthesis is limited to supplied layout_candidate_spans and approved supplemental spans."
    - "J1 remains blocked because source identity is unresolved."

  open_questions:
    - component_key: "analog_devices_lt3045edd_1"
      questions:
        - "Does the target PCB copper area satisfy thermal needs for the intended load?"
    - component_key: "microchip_mcp73831t_2aci_ot"
      questions:
        - "Does the project current setting and board copper area require extra thermal derating review?"
    - component_key: "usb_c_receptacle_unresolved"
      questions:
        - "What is the manufacturer part number and approved source document?"
```

```yaml
rejected_visual_table_candidates:
  - component_key: "analog_devices_lt3045edd_1"
    candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    quality:
      camelot_accuracy: 96.0
      camelot_whitespace: 18.5
    reason: "Revision history is not board layout guidance."

  - component_key: "microchip_mcp73831t_2aci_ot"
    candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    quality:
      camelot_accuracy: 99.1
      camelot_whitespace: 12.0
    reason: "Ordering codes are not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  basis:
    - "Only synthetic fixture data used."
    - "No network, command execution, local file read, runtime absolute path, credential, cookie, customer data, or real vendor text included."
    - "Portable parts binding retained exactly as fixture-safe string."

  ready_components:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      readiness: "ready"
      reason: "Local datasheet and EVAL spans support decoupling, thermal/exposed-pad, grounding, and reference-layout guidance."
    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      readiness: "ready_with_supplemental_source"
      reason: "Reusable datasheet cache plus approved mocked supplemental app note cover final layout readiness despite local EVAL none_found."

  blocked_or_review_components:
    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      readiness: "blocked_review_required"
      reason: "No manufacturer part number or owner-approved source identity; no guidance should be invented."

  next_owner_actions:
    - "Runner may write U1 and U2 Layout Guide packets from the cited synthetic evidence."
    - "Runner should promote only cited unique full-page figure renders directly under each component's Layout Guide/figures/."
    - "Runner should promote only U1_table_eval_p7_jumpers as a layout-context table."
    - "Owner must resolve J1 identity before any layout guide extraction."
```

Recommendation: proceed with U1 and U2 packet generation from these cited anchors, and hold J1 at review until an approved connector identity and source document are provided.