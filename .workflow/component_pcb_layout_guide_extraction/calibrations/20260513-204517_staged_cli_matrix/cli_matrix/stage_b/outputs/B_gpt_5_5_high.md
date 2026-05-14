## Workflow Output Packet

```yaml
profile:
  model: gpt-5.5
  reasoning_effort: high
  species: elf
  class: archivist
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  runtime_absolute_paths_included: false
  expected_component_folders:
    - "DATA Sheet"
    - "EVAL"
    - "Layout Guide"

  components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      identity_status: source_backed
      cache_status:
        "DATA Sheet/LT3045_datasheet.pdf": new_index_required
        "EVAL/DC2222A_user_guide.pdf": new_index_required
        "EVAL/DC2222A_design_files.zip": inspect_archive_manifest_only
      source_docs:
        - "DATA Sheet/LT3045_datasheet.pdf"
        - "EVAL/DC2222A_user_guide.pdf"
        - "EVAL/DC2222A_design_files.zip"
      review_required: false

    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      identity_status: source_backed
      cache_status:
        "DATA Sheet/MCP73831_family_datasheet.pdf": existing_index_reusable
        "Layout Guide/source_docs/MCP73831_layout_app_note.pdf": mock_saved
      source_docs:
        - "DATA Sheet/MCP73831_family_datasheet.pdf"
        - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      local_eval_material_status: none_found
      supplemental_source_used: true
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
    intended_sections:
      - section: "Identity And Source Scope"
        findings:
          - "U1 is source-backed by the LT3045 datasheet and DC2222A evaluation material."
      - section: "Decoupling And Power Routing"
        findings:
          - text: "Place input and output capacitors close to the regulator pins and route them with short, low-impedance connections."
            citation:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              page_number: 22
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              span_id: "U1_DS_p22_decoupling"
              anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      - section: "Thermal Pad And Ground Plane"
        findings:
          - text: "Tie the exposed pad and adjacent copper into the ground or thermal plane with multiple vias for heat spreading."
            citation:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              page_number: 24
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              span_id: "U1_DS_p24_thermal"
              anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      - section: "Grounding And Reference Layout"
        findings:
          - text: "Use the evaluation board as a placement reference: regulator, input/output capacitors, and measurement sense points remain compact around a continuous ground area."
            citation:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              page_number: 6
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              span_id: "U1_EVAL_p6_reference_layout"
              anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      - section: "Reference Board Context"
        findings:
          - text: "The jumper/load connector table may be retained only as reference-board setup context, not as standalone PCB layout guidance."
            citation:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              page_number: 7
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              table_candidate_id: "U1_table_eval_p7_jumpers"
    open_questions: []

  microchip_mcp73831t_2aci_ot:
    output_path: "Layout Guide/layout_guide.md"
    intended_sections:
      - section: "Identity And Source Scope"
        findings:
          - "U2 is source-backed by the MCP73831 family datasheet."
          - "No local EVAL guide or board drawing was found; approved supplemental app-note material is used for final layout readiness."
      - section: "Thermal And Ground Plane"
        findings:
          - text: "Provide copper area and package-to-board heat-spreading paths appropriate for the charger thermal behavior."
            citation:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              page_number: 14
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              span_id: "U2_DS_p14_thermal"
              anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      - section: "Battery, Input, And Charge Routing"
        findings:
          - text: "Keep battery and input capacitor routing short, and keep sense and charge paths clear of noisy switching nodes."
            citation:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              page_number: 17
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              span_id: "U2_DS_p17_power_path"
              anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      - section: "Supplemental Layout Readiness"
        findings:
          - text: "Use close input-capacitor placement, a clean ground return, and short battery connector routing per the approved supplemental app note."
            citation:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              page_number: 3
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
              span_id: "U2_SUP_p3_layout"
              anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    open_questions: []

  usb_c_receptacle_unresolved:
    output_path: "Layout Guide/layout_guide.md"
    status: review_required
    intended_sections:
      - section: "Review Required"
        findings:
          - "No manufacturer-backed identity or owner-approved source evidence is available."
          - "No datasheet, EVAL material, figures, tables, or layout guidance should be invented."
    open_questions:
      - "Provide manufacturer part number and owner-approved source document for J1."
```

```yaml
source_map_summary:
  analog_devices_lt3045edd_1:
    - finding_id: U1_decoupling_power_routing
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: "U1_DS_p22_decoupling"
      anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      extraction_promotion_method: "candidate span promoted into layout_guide.md"
      output_path: "layout_guide.md"

    - finding_id: U1_thermal_exposed_pad
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: "U1_DS_p24_thermal"
      anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      extraction_promotion_method: "candidate span promoted into layout_guide.md; cited page qualifies for full-page figure render"
      output_path: "layout_guide.md"
      promoted_figure_output_path: "figures/U1_fig_ds_p24_page_24.png"

    - finding_id: U1_eval_reference_layout
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: "U1_EVAL_p6_reference_layout"
      anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      extraction_promotion_method: "candidate span promoted into layout_guide.md"
      output_path: "layout_guide.md"

    - finding_id: U1_reference_board_context_table
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      anchor: "U1_table_eval_p7_jumpers"
      extraction_promotion_method: "layout-context table retained with quality metrics as board setup context"
      output_path: "tables/U1_table_eval_p7_jumpers.md"

  microchip_mcp73831t_2aci_ot:
    - finding_id: U2_thermal_ground_plane
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: "U2_DS_p14_thermal"
      anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      extraction_promotion_method: "reused cached candidate span promoted into layout_guide.md"
      output_path: "layout_guide.md"

    - finding_id: U2_power_path_decoupling
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: "U2_DS_p17_power_path"
      anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      extraction_promotion_method: "reused cached candidate span promoted into layout_guide.md"
      output_path: "layout_guide.md"

    - finding_id: U2_supplemental_layout_readiness
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      page_number: 3
      span_id: "U2_SUP_p3_layout"
      anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_promotion_method: "approved mocked supplemental source promoted into layout_guide.md; cited page qualifies for full-page figure render"
      output_path: "layout_guide.md"
      supplemental_source_output_path: "source_docs/MCP73831_layout_app_note.pdf"
      promoted_figure_output_path: "figures/U2_fig_sup_p3_page_3.png"

  usb_c_receptacle_unresolved: []
```

```yaml
layout_guide_citation_map:
  - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|22"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"

  - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"

  - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|6"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"

  - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|7"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    anchors:
      - "U1_table_eval_p7_jumpers"

  - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd|14"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"

  - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd|17"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"

  - dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee|3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
    page_number: 3
    anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_promote:
    - candidate_id: U1_fig_ds_p24
      component_key: analog_devices_lt3045edd_1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      reason: "Page is cited by final layout guide for thermal/exposed-pad guidance."
      output_path: "Layout Guide/figures/U1_fig_ds_p24_page_24.png"

    - candidate_id: U2_fig_sup_p3
      component_key: microchip_mcp73831t_2aci_ot
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      reason: "Approved supplemental page is cited by final layout guide for placement and routing readiness."
      output_path: "Layout Guide/figures/U2_fig_sup_p3_page_3.png"

  layout_or_board_context_tables_to_promote:
    - candidate_id: U1_table_eval_p7_jumpers
      component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
      reason: "Retained only as reference-board setup context tied to the cited evaluation-board material."
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"

  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      page_number: 7
      note: "Do not convert jumper/load setup data into general layout rules."

  missing_tool_or_low_confidence_notes:
    - "No actual PDF rendering, OCR, Camelot, PyMuPDF, downloads, browser actions, command execution, or file writes were performed."
    - "Figure and table outputs are declared as synthetic runner targets only."
```

```yaml
extraction_manifest:
  calibration_id: "20260513-204517_staged_cli_matrix"
  workflow_id: "component_pcb_layout_guide_extraction"
  fixture_type: "public_safe_synthetic"
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
    - component_key: analog_devices_lt3045edd_1
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: inspect_archive_manifest_only
      candidate_span_count: 0
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

  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
  archive_manifest_only:
    - "EVAL/DC2222A_design_files.zip"

  total_candidate_span_count: 6
  supplemental_docs:
    - component_key: microchip_mcp73831t_2aci_ot
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
      status: used

  figure_counts:
    candidate_full_page_figures: 2
    promoted_full_page_figures: 2
    rejected_full_page_figures: 0

  table_counts:
    candidate_tables: 3
    promoted_tables: 1
    rejected_tables: 2

  rejected_candidates:
    - U1_table_eval_p2_revision_history
    - U2_table_ds_p4_ordering

  tool_use_status:
    network_access: not_used
    local_project_file_reads: not_used
    command_execution: not_used
    browser_actions: not_used
    downloads: not_performed
    pdf_rendering: not_performed
    ocr: not_performed
    camelot: not_performed
    pymupdf: not_performed
    file_writes: not_performed

  warnings:
    - "U2 has no local EVAL material; final readiness depends on the approved mocked supplemental app note."
    - "J1 remains review_required with no invented guidance."
    - "U1 archive was limited to manifest inspection; CAD/runtime files were not treated as AI text sources."

  open_questions:
    - component_key: usb_c_receptacle_unresolved
      question: "Provide a manufacturer part number and owner-approved source document for J1."
```

```yaml
rejected_visual_table_candidates:
  - candidate_id: U1_table_eval_p2_revision_history
    component_key: analog_devices_lt3045edd_1
    candidate_type: table
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    camelot_accuracy: 96.0
    camelot_whitespace: 18.5
    reason: "Revision history is not board layout guidance."

  - candidate_id: U2_table_ds_p4_ordering
    component_key: microchip_mcp73831t_2aci_ot
    candidate_type: table
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    camelot_accuracy: 99.1
    camelot_whitespace: 12.0
    reason: "Ordering-code table is not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: pass
  boundary_notes:
    - "Used only synthetic fixture content."
    - "No runtime absolute paths, project secrets, credentials, cookies, customer data, vendor text excerpts, or downloaded binaries included."
    - "Portable binding string retained exactly as fixture-provided."
    - "No claims of actual network access, command execution, browser use, rendering, OCR, Camelot, PyMuPDF, or file writes."

  ready_components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      readiness: ready_for_runner_output
      basis:
        - "Datasheet-backed decoupling and thermal guidance."
        - "Evaluation-board-backed grounding and reference-layout guidance."
        - "Cited page 24 figure promoted."
        - "Board-context table retained with quality metrics."

    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      readiness: ready_for_runner_output_with_supplemental_source
      basis:
        - "Datasheet cache reused."
        - "Local EVAL material absent and recorded."
        - "Approved mocked supplemental app note used for final layout readiness."
        - "Cited supplemental page 3 figure promoted."

  blocked_or_review_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      readiness: review_required
      reason: "No manufacturer-backed identity or owner-approved source evidence."

  next_owner_actions:
    - "Runner may write U1 and U2 Layout Guide artifacts from this packet."
    - "Runner should keep J1 blocked until source identity is supplied."
    - "Reviewer should confirm U1 table page 7 remains reference-board context and is not generalized into layout rules."
```

Recommendation: promote U1 and U2 only, keep J1 blocked, and require owner source identity before any connector layout guide is generated.