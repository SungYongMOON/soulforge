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
  runtime_absolute_paths_forbidden: true
  expected_component_folders:
    - "DATA Sheet"
    - "EVAL"
    - "Layout Guide"

  components:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      identity_status: "source_backed"
      source_docs:
        - "DATA Sheet/LT3045_datasheet.pdf"
        - "EVAL/DC2222A_user_guide.pdf"
        - "EVAL/DC2222A_design_files.zip"
      cache_status:
        datasheet: "new_index_required"
        eval_guide: "new_index_required"
        eval_archive: "inspect_archive_manifest_only"
      review_required: false

    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      identity_status: "source_backed"
      source_docs:
        - "DATA Sheet/MCP73831_family_datasheet.pdf"
        - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      cache_status:
        datasheet: "existing_index_reusable"
        supplemental_app_note: "mock_saved"
      local_eval_material_status: "none_found"
      review_required: false

    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      identity_status: "review_required"
      source_docs: []
      cache_status: {}
      review_required: true
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    output_path: "Layout Guide/layout_guide.md"
    intended_sections:
      - section: "Component"
        content:
          refdes: "U1"
          status: "source_backed"

      - section: "Placement And Decoupling"
        findings:
          - finding: "Place input and output capacitors close to the regulator pins with short, low-impedance routing."
            cite:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"

      - section: "Thermal Pad, Vias, And Ground Plane"
        findings:
          - finding: "Tie the exposed pad and nearby copper into the ground/thermal plane using multiple vias for heat spreading."
            cite:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 24
              span_id: "U1_DS_p24_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          - finding: "Promote the cited page-24 layout/thermal figure as a full-page reference render."
            cite:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 24
              anchor: "U1_fig_ds_p24"

      - section: "Grounding And Reference Layout"
        findings:
          - finding: "Use the evaluation board as a compact placement reference: regulator, input/output capacitors, and measurement sense points are grouped around a continuous ground area."
            cite:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"

      - section: "Board Setup Context"
        findings:
          - finding: "Retain the page-7 jumper/load connector table only as reference-board setup context, not as generalized layout law."
            cite:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 7
              anchor: "U1_table_eval_p7_jumpers"

      - section: "Open Questions"
        open_questions:
          - "Confirm final board current, copper area, via count, and thermal target against the actual schematic and mechanical constraints."
          - "Confirm whether evaluation-board sense-point placement is applicable to the target measurement strategy."

  microchip_mcp73831t_2aci_ot:
    output_path: "Layout Guide/layout_guide.md"
    intended_sections:
      - section: "Component"
        content:
          refdes: "U2"
          status: "source_backed"
          local_eval_material_status: "none_found"
          supplemental_source_status: "approved_mock_source_used"

      - section: "Thermal And Ground Plane"
        findings:
          - finding: "Account for package-to-board heat spreading; copper area and ground-plane connection affect thermal behavior."
            cite:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 14
              span_id: "U2_DS_p14_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"

      - section: "Power, Battery, And Decoupling Routing"
        findings:
          - finding: "Keep battery and input-capacitor routing short; keep sense and charge paths clear of noisy switching nodes."
            cite:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 17
              span_id: "U2_DS_p17_power_path"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          - finding: "Use the approved supplemental app note for final layout readiness: close input capacitor placement, clean ground return, and short battery connector routing."
            cite:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
          - finding: "Promote the cited supplemental page-3 charger-board placement drawing as a full-page reference render."
            cite:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              anchor: "U2_fig_sup_p3"

      - section: "Open Questions"
        open_questions:
          - "No local EVAL guide or board drawing was present; keep the approved supplemental source with checksum evidence."
          - "Confirm target charge current, copper area, connector placement, and thermal margin against the actual board constraints."

  usb_c_receptacle_unresolved:
    output_path: "Layout Guide/layout_guide.md"
    intended_sections:
      - section: "Review Required"
        findings: []
        status: "blocked"
        reason: "No manufacturer-backed identity or owner-approved source evidence is available."
        prohibited_actions:
          - "Do not invent datasheets."
          - "Do not infer layout guidance."
          - "Do not promote figures or tables."
        open_questions:
          - "Provide manufacturer part number and owner-approved datasheet or layout source."
```

```yaml
source_map_summary:
  - component_key: "analog_devices_lt3045edd_1"
    output_path: "Layout Guide/layout_guide.md"
    finding_key: "U1.decoupling.close_caps"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "candidate_span_synthesis"

  - component_key: "analog_devices_lt3045edd_1"
    output_path: "Layout Guide/layout_guide.md"
    finding_key: "U1.thermal.exposed_pad_vias"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "candidate_span_synthesis"

  - component_key: "analog_devices_lt3045edd_1"
    output_path: "Layout Guide/figures/U1_fig_ds_p24_page24_full.png"
    finding_key: "U1.figure.ds_p24_thermal_layout"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    anchor: "U1_fig_ds_p24"
    extraction_promotion_method: "promote_cited_unique_full_page_render"

  - component_key: "analog_devices_lt3045edd_1"
    output_path: "Layout Guide/layout_guide.md"
    finding_key: "U1.eval.reference_layout"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "candidate_span_synthesis"

  - component_key: "analog_devices_lt3045edd_1"
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    finding_key: "U1.table.eval_p7_board_setup_context"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    anchor: "U1_table_eval_p7_jumpers"
    extraction_promotion_method: "promote_layout_context_table_with_quality_metrics"

  - component_key: "microchip_mcp73831t_2aci_ot"
    output_path: "Layout Guide/layout_guide.md"
    finding_key: "U2.thermal.copper_area"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "reused_cache_candidate_span_synthesis"

  - component_key: "microchip_mcp73831t_2aci_ot"
    output_path: "Layout Guide/layout_guide.md"
    finding_key: "U2.routing.battery_input_paths"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "reused_cache_candidate_span_synthesis"

  - component_key: "microchip_mcp73831t_2aci_ot"
    output_path: "Layout Guide/layout_guide.md"
    finding_key: "U2.supplemental.final_layout_readiness"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved_mock_supplemental_span_synthesis"

  - component_key: "microchip_mcp73831t_2aci_ot"
    output_path: "Layout Guide/figures/U2_fig_sup_p3_page3_full.png"
    finding_key: "U2.figure.sup_p3_example_layout"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    anchor: "U2_fig_sup_p3"
    extraction_promotion_method: "promote_cited_unique_full_page_render"
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
      - "U1_fig_ds_p24"

  - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"

  - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p7"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    citation_anchors:
      - "U1_table_eval_p7_jumpers"

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
      - "U2_fig_sup_p3"
```

```yaml
figure_table_extraction_summary:
  promoted_full_page_figures:
    - component_key: "analog_devices_lt3045edd_1"
      candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      reason: "Cited by final layout guide for thermal/exposed-pad layout."
      output_path: "Layout Guide/figures/U1_fig_ds_p24_page24_full.png"

    - component_key: "microchip_mcp73831t_2aci_ot"
      candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      reason: "Cited by final layout guide for charger-board placement readiness."
      output_path: "Layout Guide/figures/U2_fig_sup_p3_page3_full.png"

  promoted_layout_tables:
    - component_key: "analog_devices_lt3045edd_1"
      candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
      reason: "Board setup table tied to reference-board jumper/load connector context; retained as context, not generalized guidance."
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"

  context_only_items:
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      archive_entry: "README_layout_notes.txt"
      reason: "Candidate archive document identified by name only; archive manifest inspection only."
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      archive_entry: "gerbers/top_copper.gbr"
      reason: "CAD/runtime reference file, not AI text source."

  missing_tool_or_low_confidence_notes:
    - "No actual rendering, OCR, Camelot, PyMuPDF, archive extraction, download, or file writing is claimed in this synthetic packet."
    - "All promotion paths are runner targets derived from fixture candidates."
```

```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  calibration_id: "20260513-204517_staged_cli_matrix"
  fixture_type: "public_safe_synthetic"

  processed_docs:
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_count: 44
      cache_status: "new_index_required"
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_count: 12
      cache_status: "new_index_required"
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: "inspect_archive_manifest_only"
    - component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_count: 32
      cache_status: "existing_index_reusable"
    - component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      page_count: 8
      cache_status: "mock_saved"

  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"

  cache_misses:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"

  candidate_span_count:
    total: 6
    by_component:
      analog_devices_lt3045edd_1: 3
      microchip_mcp73831t_2aci_ot: 3
      usb_c_receptacle_unresolved: 0

  supplemental_docs:
    - component_key: "microchip_mcp73831t_2aci_ot"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      official_or_owner_approved: true
      status: "used"

  figure_table_counts:
    full_page_figure_candidates: 2
    full_page_figures_promoted: 2
    table_candidates: 3
    tables_promoted: 1
    rejected_candidates: 2

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
    - "U2 has no local EVAL material; approved mocked supplemental app note is required for final layout readiness."
    - "J1 remains review_required with no source-backed layout guidance."
    - "Archive entries are not extracted; only fixture-provided archive manifest metadata is used."

  open_questions:
    - "U1: confirm target thermal limits, via count, copper area, and measurement/sense strategy."
    - "U2: confirm charge current, copper area, ground return, and battery connector placement."
    - "J1: provide manufacturer part number and approved source documentation."
```

```yaml
rejected_visual_table_candidates:
  - component_key: "analog_devices_lt3045edd_1"
    candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    camelot_accuracy: 96.0
    camelot_whitespace: 18.5
    rejection_reason: "Revision history is not board layout guidance."

  - component_key: "microchip_mcp73831t_2aci_ot"
    candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    camelot_accuracy: 99.1
    camelot_whitespace: 12.0
    rejection_reason: "Ordering-code table is not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  boundary_notes:
    - "Uses only synthetic fixture paths, checksums, source URLs, page numbers, spans, anchors, and candidate IDs."
    - "No runtime absolute paths, customer data, copied vendor text, credentials, cookies, downloads, or command output are included."
    - "No actual network, file, rendering, OCR, Camelot, PyMuPDF, or write activity is claimed."

  ready_components:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      readiness: "ready_for_runner_output"
      basis:
        - "Source-backed datasheet spans cover decoupling and thermal/exposed-pad guidance."
        - "EVAL span covers compact reference layout and grounding."
        - "Cited full-page figure and layout-context table have promotion targets."

    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      readiness: "ready_for_runner_output_with_supplemental_source"
      basis:
        - "Datasheet cache is reusable."
        - "Local EVAL is none_found."
        - "Approved mocked supplemental app note supplies final layout-readiness evidence."

  blocked_or_review_components:
    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      readiness: "blocked_review_required"
      reason: "No manufacturer part number or owner-approved source identity."

  next_owner_actions:
    - "Runner may write U1 and U2 Layout Guide packets from this manifest."
    - "Runner should promote only the cited unique full-page figure renders and the single accepted layout-context table."
    - "Owner must resolve J1 identity before any layout guide extraction."
```

Recommendation: proceed with runner materialization for U1 and U2 only; keep J1 blocked until a manufacturer-backed source packet is supplied.