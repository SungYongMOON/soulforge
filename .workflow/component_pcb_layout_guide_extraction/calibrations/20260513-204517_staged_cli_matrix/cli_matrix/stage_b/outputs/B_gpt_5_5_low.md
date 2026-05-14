**Workflow Output Packet**

```yaml
profile:
  model: gpt-5.5
  reasoning_effort: low
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
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      identity_status: source_backed
      cache_status:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          status: new_index_required
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          status: new_index_required
        - source_file: "EVAL/DC2222A_design_files.zip"
          sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          status: inspect_archive_manifest_only
      review_required: false

    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      identity_status: source_backed
      cache_status:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          status: existing_index_reusable
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          status: mock_saved
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          official_or_owner_approved: true
      local_eval_material_status: none_found
      review_required: false

    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      identity_status: review_required
      source_docs: []
      review_required: true
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      source_basis:
        - "Datasheet and EVAL guide are source-backed synthetic inputs."
        - "Design ZIP is inspected only at archive-manifest level; CAD/runtime files are not AI text sources."
      placement_and_decoupling:
        finding: "Place input and output capacitors close to regulator pins and route them with short, low-impedance connections."
        citation:
          source_file: "DATA Sheet/LT3045_datasheet.pdf"
          page_number: 22
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          span_id: U1_DS_p22_decoupling
          anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
      thermal_and_exposed_pad:
        finding: "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias for heat spreading."
        citation:
          source_file: "DATA Sheet/LT3045_datasheet.pdf"
          page_number: 24
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          span_id: U1_DS_p24_thermal
          anchor: SYNTHETIC_U1_DS_P24_THERMAL
      grounding_and_reference_layout:
        finding: "Use the EVAL layout as a compact reference for regulator, capacitor, measurement sense point, and continuous ground-area coordination."
        citation:
          source_file: "EVAL/DC2222A_user_guide.pdf"
          page_number: 6
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          span_id: U1_EVAL_p6_reference_layout
          anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      promoted_figures:
        - "figures/U1_fig_ds_p24_page_24.png"
      promoted_tables:
        - "tables/U1_table_eval_p7_jumpers.md"
      open_questions:
        - "Confirm final PCB stackup copper area and via count satisfy thermal intent."
        - "Confirm measurement sense-point routing in the project PCB follows the compact EVAL reference intent."

  microchip_mcp73831t_2aci_ot:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      source_basis:
        - "Datasheet cache is reusable."
        - "No local EVAL guide was found."
        - "Approved mocked supplemental layout app note is included under Layout Guide/source_docs and used for final readiness."
      thermal_and_ground_plane:
        finding: "Provide enough copper area and board heat-spreading path for thermal behavior."
        citation:
          source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          page_number: 14
          sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          span_id: U2_DS_p14_thermal
          anchor: SYNTHETIC_U2_DS_P14_THERMAL
      power_and_battery_routing:
        finding: "Keep battery and input capacitor routing short, and keep sense and charge paths away from noisy switching nodes."
        citation:
          source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          page_number: 17
          sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          span_id: U2_DS_p17_power_path
          anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
      supplemental_layout_readiness:
        finding: "Use close input-capacitor placement, clean ground return, and short battery connector routing as the final layout-readiness guidance."
        citation:
          source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          page_number: 3
          sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          span_id: U2_SUP_p3_layout
          anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      promoted_figures:
        - "figures/U2_fig_sup_p3_page_3.png"
      promoted_tables: []
      open_questions:
        - "Confirm the final board avoids nearby noisy switching nodes on sense and charge routing."
        - "Confirm supplemental app-note source remains owner-approved for release packaging."

  usb_c_receptacle_unresolved:
    output_path: "Layout Guide/layout_guide.md"
    status: review_required
    sections:
      source_basis:
        - "No manufacturer-backed identity or owner-approved source evidence is available."
      layout_guidance:
        - "No layout guidance generated."
      open_questions:
        - "Owner must provide manufacturer part number and approved datasheet/mechanical drawing before extraction."
```

```yaml
source_map_summary:
  - component_key: analog_devices_lt3045edd_1
    output_path: "Layout Guide/layout_guide.md"
    finding_key: U1_decoupling
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: U1_DS_p22_decoupling
    anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
    extraction_promotion_method: "synthetic span to cited layout finding"

  - component_key: analog_devices_lt3045edd_1
    output_path: "Layout Guide/layout_guide.md"
    finding_key: U1_thermal_exposed_pad
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: U1_DS_p24_thermal
    anchor: SYNTHETIC_U1_DS_P24_THERMAL
    extraction_promotion_method: "synthetic span to cited layout finding; cited page qualifies full-page figure promotion"

  - component_key: analog_devices_lt3045edd_1
    output_path: "Layout Guide/layout_guide.md"
    finding_key: U1_eval_reference_layout
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: U1_EVAL_p6_reference_layout
    anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
    extraction_promotion_method: "synthetic span to cited layout finding"

  - component_key: analog_devices_lt3045edd_1
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    finding_key: U1_eval_board_setup_table
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    anchor: U1_table_eval_p7_jumpers
    extraction_promotion_method: "layout-context table promotion with Camelot metrics"
    quality_metrics:
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0

  - component_key: analog_devices_lt3045edd_1
    output_path: "Layout Guide/figures/U1_fig_ds_p24_page_24.png"
    finding_key: U1_ds_p24_full_page_render
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    anchor: U1_fig_ds_p24
    extraction_promotion_method: "promote cited unique full-page figure candidate"

  - component_key: microchip_mcp73831t_2aci_ot
    output_path: "Layout Guide/layout_guide.md"
    finding_key: U2_thermal
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: U2_DS_p14_thermal
    anchor: SYNTHETIC_U2_DS_P14_THERMAL
    extraction_promotion_method: "reused cached synthetic span to cited layout finding"

  - component_key: microchip_mcp73831t_2aci_ot
    output_path: "Layout Guide/layout_guide.md"
    finding_key: U2_power_battery_routing
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: U2_DS_p17_power_path
    anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
    extraction_promotion_method: "reused cached synthetic span to cited layout finding"

  - component_key: microchip_mcp73831t_2aci_ot
    output_path: "Layout Guide/layout_guide.md"
    finding_key: U2_supplemental_layout
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: U2_SUP_p3_layout
    anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
    extraction_promotion_method: "approved supplemental synthetic span to cited layout finding; cited page qualifies full-page figure promotion"

  - component_key: microchip_mcp73831t_2aci_ot
    output_path: "Layout Guide/figures/U2_fig_sup_p3_page_3.png"
    finding_key: U2_sup_p3_full_page_render
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    anchor: U2_fig_sup_p3
    extraction_promotion_method: "promote cited unique full-page figure candidate"
```

```yaml
layout_guide_citation_map:
  - component_key: analog_devices_lt3045edd_1
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - SYNTHETIC_U1_DS_P22_DECOUPLING

  - component_key: analog_devices_lt3045edd_1
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - SYNTHETIC_U1_DS_P24_THERMAL
      - U1_fig_ds_p24

  - component_key: analog_devices_lt3045edd_1
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT

  - component_key: analog_devices_lt3045edd_1
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p7"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    citation_anchors:
      - U1_table_eval_p7_jumpers

  - component_key: microchip_mcp73831t_2aci_ot
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - SYNTHETIC_U2_DS_P14_THERMAL

  - component_key: microchip_mcp73831t_2aci_ot
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - SYNTHETIC_U2_DS_P17_POWER_PATH

  - component_key: microchip_mcp73831t_2aci_ot
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - SYNTHETIC_U2_SUP_P3_LAYOUT
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
      output_path: "Layout Guide/figures/U1_fig_ds_p24_page_24.png"
      reason: "Page is cited by final layout guide for thermal/exposed-pad guidance."

    - component_key: microchip_mcp73831t_2aci_ot
      candidate_id: U2_fig_sup_p3
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      output_path: "Layout Guide/figures/U2_fig_sup_p3_page_3.png"
      reason: "Approved supplemental page is cited by final layout guide for charger placement guidance."

  layout_tables_to_promote:
    - component_key: analog_devices_lt3045edd_1
      candidate_id: U1_table_eval_p7_jumpers
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      layout_context: "jumper/load connector table tied to reference board setup"
      quality_metrics:
        camelot_accuracy: 98.2
        camelot_whitespace: 21.0

  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      archive_entry: "README_layout_notes.txt"
      reason: "Candidate document by filename only; no synthetic excerpt span provided."
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      archive_entry: "gerbers/top_copper.gbr"
      reason: "CAD/runtime reference file, not AI text source."

  missing_tool_or_low_confidence_notes:
    - "No actual rendering, OCR, Camelot, PyMuPDF, command execution, downloads, or file writes were performed."
    - "Figure and table outputs are packet-intended promotions only."
```

```yaml
extraction_manifest:
  calibration_id: "20260513-204517_staged_cli_matrix"
  workflow_id: component_pcb_layout_guide_extraction
  fixture_type: public_safe_synthetic

  processed_docs:
    - component_key: analog_devices_lt3045edd_1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      pages: 44
      cache_status: new_index_required
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      pages: 12
      cache_status: new_index_required
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_design_files.zip"
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: inspect_archive_manifest_only
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      pages: 32
      cache_status: existing_index_reusable

  supplemental_docs:
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      pages: 8
      official_or_owner_approved: true
      download_status: mock_saved

  cache_summary:
    hits: 1
    misses_or_new_indexes_required: 2
    archive_manifest_only: 1

  candidate_span_count:
    U1: 3
    U2_datasheet: 2
    U2_supplemental: 1
    J1: 0
    total: 6

  figure_table_counts:
    full_page_figure_candidates: 2
    full_page_figures_promoted: 2
    table_candidates: 3
    tables_promoted: 1
    rejected_visual_table_candidates: 2

  rejected_candidates:
    - U1_table_eval_p2_revision_history
    - U2_table_ds_p4_ordering

  tool_use_status:
    network_access: not_used
    local_project_files: not_read
    browser_actions: not_used
    command_execution: not_used
    pdf_rendering: not_performed
    ocr: not_performed
    camelot: not_performed
    pymupdf: not_performed
    file_writes: not_performed

  warnings:
    - "Synthetic calibration packet only; no actual files were rendered, parsed, downloaded, or written."
    - "U2 local EVAL material is none_found; readiness depends on approved mocked supplemental source."
    - "J1 remains review_required."

  open_questions:
    - component_key: analog_devices_lt3045edd_1
      questions:
        - "Confirm board thermal copper and via implementation."
        - "Confirm reference-layout sense-point routing intent is preserved."
    - component_key: microchip_mcp73831t_2aci_ot
      questions:
        - "Confirm final PCB routing keeps charge/sense paths away from noisy switching nodes."
        - "Confirm supplemental app-note approval is retained for release."
    - component_key: usb_c_receptacle_unresolved
      questions:
        - "Provide manufacturer part number and approved source documents."
```

```yaml
rejected_visual_table_candidates:
  - component_key: analog_devices_lt3045edd_1
    candidate_id: U1_table_eval_p2_revision_history
    candidate_type: table
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    quality_metrics:
      camelot_accuracy: 96.0
      camelot_whitespace: 18.5
    rejection_reason: "Revision history is not board layout guidance."

  - component_key: microchip_mcp73831t_2aci_ot
    candidate_id: U2_table_ds_p4_ordering
    candidate_type: table
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    quality_metrics:
      camelot_accuracy: 99.1
      camelot_whitespace: 12.0
    rejection_reason: "Ordering-code table is not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: pass
  boundary_notes:
    - "Only synthetic fixture filenames, checksums, source URLs, page numbers, spans, anchors, and candidate metadata are used."
    - "No runtime absolute paths, project-private data, credentials, cookies, vendor copied text, or _workspaces material beyond the portable binding string are included."
    - "No actual network, local reads, downloads, rendering, OCR, command execution, Camelot, PyMuPDF, or writes are claimed."

  ready_components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      readiness: ready_with_open_board_implementation_questions
      reason: "Datasheet and EVAL layout spans support decoupling, thermal/exposed-pad, grounding, and reference-layout guidance."

    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      readiness: ready_with_approved_supplemental_source
      reason: "Datasheet cache plus approved mocked supplemental app note cover thermal, routing, decoupling, ground return, and battery connector placement."

  blocked_or_review_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      readiness: blocked_review_required
      reason: "No manufacturer-backed identity or approved source evidence."

  next_owner_actions:
    - "Write U1 and U2 Layout Guide packets from the cited findings only."
    - "Promote only cited unique full-page figure renders and the one board-layout-context table listed above."
    - "Keep J1 blocked until owner supplies manufacturer part identity and approved source documents."
```

Recommendation: proceed with U1 and U2 guide/material generation from this packet, and hold J1 at review gate until source identity is provided.