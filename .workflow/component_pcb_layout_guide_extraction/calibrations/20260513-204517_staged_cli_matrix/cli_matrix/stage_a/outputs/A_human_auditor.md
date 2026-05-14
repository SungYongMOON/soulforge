```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: auditor
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
        cache_status: "mock_saved"
        source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
        official_or_owner_approved: true
    usb_c_receptacle_unresolved: []
  review_required_components:
    - usb_c_receptacle_unresolved
  cache_status:
    reusable:
      - "DATA Sheet/MCP73831_family_datasheet.pdf"
    new_index_required:
      - "DATA Sheet/LT3045_datasheet.pdf"
      - "EVAL/DC2222A_user_guide.pdf"
    inspect_archive_manifest_only:
      - "EVAL/DC2222A_design_files.zip"
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    output_path: "Layout Guide/layout_guide.md"
    status: "source_backed"
    sections:
      - heading: "Source-Bound Findings"
        items:
          - finding: "Input and output capacitors should be placed close to the regulator pins with short, low-impedance traces."
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            method: "layout extraction"
            output_path: "Layout Guide/layout_guide.md"
          - finding: "The exposed pad and nearby copper should be tied into the ground/thermal plane with multiple vias for heat spreading."
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
            method: "layout extraction"
            output_path: "Layout Guide/layout_guide.md"
          - finding: "The evaluation board keeps the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
            source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            method: "reference-layout extraction"
            output_path: "Layout Guide/layout_guide.md"
      - heading: "Layout Implications"
        items:
          - implication: "Decoupling and power routing should be compact and pin-adjacent."
          - implication: "Thermal pad connectivity should prioritize via stitching into the ground/thermal plane."
          - implication: "Reference-layout geometry should remain compact around a continuous ground area."
      - heading: "Open Questions"
        items:
          - question: "No additional component-specific uncertainties are required beyond standard board-stackup validation."
    figures_to_promote:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        page_number: 24
        candidate_id: "U1_fig_ds_p24"
        reason: "Cited recommended layout and thermal pad drawing"
        output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    tables_to_promote:
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        page_number: 7
        candidate_id: "U1_table_eval_p7_jumpers"
        reason: "Board-setup / layout-context table retained for reference board configuration"
        output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    rejected_items:
      - candidate_id: "U1_table_eval_p2_revision_history"
        reason: "Revision history; not layout guidance"

  microchip_mcp73831t_2aci_ot:
    output_path: "Layout Guide/layout_guide.md"
    status: "source_backed"
    sections:
      - heading: "Source-Bound Findings"
        items:
          - finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
            method: "layout extraction"
            output_path: "Layout Guide/layout_guide.md"
          - finding: "Battery and input capacitor routing should be short, with the sense and charge paths kept clear of noisy switching nodes."
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            method: "layout extraction"
            output_path: "Layout Guide/layout_guide.md"
          - finding: "The app note emphasizes close placement of the input capacitor, a clean ground return, and short battery connector routing."
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            method: "approved supplemental layout extraction"
            output_path: "Layout Guide/layout_guide.md"
      - heading: "Layout Implications"
        items:
          - implication: "Charge-path copper should stay short and direct."
          - implication: "Ground return should be continuous and clean around the charger."
          - implication: "Battery connector placement should be short and uncluttered."
      - heading: "Open Questions"
        items:
          - question: "Local EVAL material is absent; final board-readiness depends on the approved supplemental app note rather than a local reference board."
    figures_to_promote:
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        page_number: 3
        candidate_id: "U2_fig_sup_p3"
        reason: "Cited example charger board placement drawing"
        output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
    tables_to_promote: []
    rejected_items:
      - candidate_id: "U2_table_ds_p4_ordering"
        reason: "Ordering codes; not layout guidance"

  usb_c_receptacle_unresolved:
    output_path: "Layout Guide/layout_guide.md"
    status: "review_required"
    sections:
      - heading: "Source-Bound Findings"
        items: []
      - heading: "Open Questions"
        items:
          - question: "Manufacturer part number and owner-approved identity are missing; no datasheet or layout guidance may be invented."
    figures_to_promote: []
    tables_to_promote: []
    rejected_items: []
```

```yaml
source_map_summary:
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "analog_devices_lt3045edd_1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_method: "layout extraction"
    promoted_as: "finding"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "analog_devices_lt3045edd_1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_method: "layout extraction"
    promoted_as: "finding"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "analog_devices_lt3045edd_1"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_method: "reference-layout extraction"
    promoted_as: "finding"
  - output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    component_key: "analog_devices_lt3045edd_1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_method: "citation-promoted full-page render"
    promoted_as: "figure"
  - output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    component_key: "analog_devices_lt3045edd_1"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_id: "U1_table_eval_p7_jumpers"
    anchor: "layout_context: jumper/load connector table"
    extraction_method: "layout-context table promotion"
    promoted_as: "table"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "microchip_mcp73831t_2aci_ot"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_method: "layout extraction"
    promoted_as: "finding"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "microchip_mcp73831t_2aci_ot"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_method: "layout extraction"
    promoted_as: "finding"
  - output_path: "Layout Guide/layout_guide.md"
    component_key: "microchip_mcp73831t_2aci_ot"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_method: "approved supplemental layout extraction"
    promoted_as: "finding"
  - output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
    component_key: "microchip_mcp73831t_2aci_ot"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_method: "citation-promoted full-page render"
    promoted_as: "figure"
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
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    citation_anchor: "layout_context: jumper/load connector table"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:7"
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
    - candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
      reason: "Cited by final layout guide; thermal pad and recommended layout are directly relevant"
    - candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
      reason: "Approved supplemental source cited by final layout guide"
  layout_only_tables_to_promote:
    - candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      reason: "Board setup context retained for layout/reference usage"
  context_only_items:
    - candidate_id: "U1_table_eval_p2_revision_history"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      page_number: 2
      reason: "Revision history; context only, not promotable"
    - candidate_id: "U2_table_ds_p4_ordering"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      page_number: 4
      reason: "Ordering codes; not board/layout context"
  missing_tool_or_low_confidence_notes:
    - "No real PDF rendering, OCR, Camelot, or PyMuPDF performed; all selections are fixture-bound."
    - "U2 local EVAL coverage is absent, so readiness relies on approved supplemental app note only."
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
  candidate_span_count: 6
  supplemental_docs:
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  figure_count: 2
  table_count: 1
  rejected_candidates: 2
  tool_use_status:
    network: "not used"
    local_files: "not read"
    rendering: "not performed"
    ocr: "not performed"
    camelot: "not performed"
    pymupdf: "not performed"
    writes: "not performed"
  warnings:
    - "J1 lacks manufacturer-backed identity and remains review_required."
    - "U2 has no local EVAL material; final guidance depends on approved supplemental source."
  open_questions:
    - "Confirm J1 manufacturer part number before any layout guidance work."
```

```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "Revision history; explicitly non-layout content"
  - candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "Ordering codes; explicitly reject"
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  notes:
    - "Only synthetic fixture content was used."
    - "No runtime absolute paths, vendor text, secrets, credentials, cookies, or project-private data were introduced."
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_or_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Write Layout Guide artifacts for U1 using the three cited spans, the one promoted table, and the one promoted figure."
    - "Write Layout Guide artifacts for U2 using the datasheet spans plus the approved supplemental app note."
    - "Hold J1 for owner identity resolution before any source-backed layout guide can be drafted."
```

Recommendation: proceed to materialize the two source-backed layout guides, and leave J1 gated until the owner supplies a manufacturer part number or approved source.