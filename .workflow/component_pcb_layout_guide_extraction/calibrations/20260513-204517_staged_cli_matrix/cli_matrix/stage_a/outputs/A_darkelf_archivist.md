```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: darkelf
  class: archivist
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
  cache_status:
    U1: "mixed new_index_required + inspect_archive_manifest_only"
    U2: "existing_index_reusable + approved mock supplemental"
    J1: "no sources"
  review_required_components:
    - usb_c_receptacle_unresolved
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    status: source_backed
    layout_guide_sections:
      - section: "Source-Bound Findings"
        findings:
          - finding: "Place input and output capacitors close to the regulator pins with short, low-impedance traces."
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            method: "source-bound synthesis"
            output_path: "Layout Guide/sections/source_bound_findings.md"
          - finding: "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias for heat spreading."
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
            method: "source-bound synthesis"
            output_path: "Layout Guide/sections/source_bound_findings.md"
          - finding: "Keep the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
            source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            method: "source-bound synthesis"
            output_path: "Layout Guide/sections/reference_layout_notes.md"
      - section: "Thermal and Grounding"
        notes:
          - "Use the thermal pad / via field as the primary heat-spreading boundary."
          - "Preserve a continuous ground region beneath the functional cluster."
        source_binding: "All notes above are directly source-backed."
        output_path: "Layout Guide/sections/thermal_grounding.md"
      - section: "Decoupling and Power Routing"
        notes:
          - "Keep bypass capacitors tight to the pins."
          - "Shorten power loops and avoid avoidable impedance in the feed path."
        source_binding: "U1_DS_p22_decoupling"
        output_path: "Layout Guide/sections/decoupling_power.md"
      - section: "Open Questions"
        questions:
          - "Whether the final board stack-up adds constraints beyond the reference layout."
          - "Whether any package-specific keepout rules are needed beyond the cited spans."
        output_path: "Layout Guide/sections/open_questions.md"
    figures_to_promote:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        page_number: 24
        candidate_id: "U1_fig_ds_p24"
        output_path: "Layout Guide/figures/U1_fig_ds_p24_page24.png"
        reason: "Cited by final layout guide; full-page thermal pad / recommended layout drawing."
    tables_to_promote:
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        page_number: 7
        candidate_id: "U1_table_eval_p7_jumpers"
        output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
        reason: "Layout-adjacent board setup context retained; board/reuse setup relevant."
    open_questions:
      - "No further source evidence was provided for alternate board variants."
  microchip_mcp73831t_2aci_ot:
    refdes: U2
    status: source_backed
    layout_guide_sections:
      - section: "Source-Bound Findings"
        findings:
          - finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
            method: "source-bound synthesis"
            output_path: "Layout Guide/sections/source_bound_findings.md"
          - finding: "Battery and input capacitor routing should be short, with the sense and charge paths kept clear of noisy switching nodes."
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            method: "source-bound synthesis"
            output_path: "Layout Guide/sections/source_bound_findings.md"
          - finding: "The app note emphasizes close placement of the input capacitor, a clean ground return, and short battery connector routing."
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            method: "approved supplemental synthesis"
            output_path: "Layout Guide/sections/final_layout_readiness.md"
      - section: "Final Layout Readiness"
        notes:
          - "Local EVAL coverage is none_found, so the approved supplemental app note is used for readiness."
          - "This component is ready for layout guidance because supplemental official guidance resolves the coverage gap."
        source_binding: "U2_SUP_p3_layout + U2_DS_p14_thermal + U2_DS_p17_power_path"
        output_path: "Layout Guide/sections/final_layout_readiness.md"
      - section: "Open Questions"
        questions:
          - "No local EVAL board drawing exists; confirm any project-specific connector or battery-placement constraints."
        output_path: "Layout Guide/sections/open_questions.md"
    figures_to_promote:
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        page_number: 3
        candidate_id: "U2_fig_sup_p3"
        output_path: "Layout Guide/figures/U2_fig_sup_p3_page3.png"
        reason: "Cited by final layout guide; approved supplemental example charger board placement drawing."
    tables_to_promote: []
    open_questions:
      - "No local EVAL material was found; readiness depends on approved supplemental source only."
  usb_c_receptacle_unresolved:
    refdes: J1
    status: review_required
    layout_guide_sections: []
    open_questions:
      - "Manufacturer part number missing."
      - "No owner-approved source identity."
      - "Do not infer datasheets, EVAL material, or layout guidance."
```

```yaml
source_map_summary:
  findings:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: "U1_DS_p22_decoupling"
      extraction_method: "source-bound synthesis"
      output_path: "Layout Guide/sections/decoupling_power.md"
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: "U1_DS_p24_thermal"
      extraction_method: "source-bound synthesis"
      output_path: "Layout Guide/sections/thermal_grounding.md"
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: "U1_EVAL_p6_reference_layout"
      extraction_method: "source-bound synthesis"
      output_path: "Layout Guide/sections/reference_layout_notes.md"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: "U2_DS_p14_thermal"
      extraction_method: "source-bound synthesis"
      output_path: "Layout Guide/sections/source_bound_findings.md"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: "U2_DS_p17_power_path"
      extraction_method: "source-bound synthesis"
      output_path: "Layout Guide/sections/source_bound_findings.md"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: "U2_SUP_p3_layout"
      extraction_method: "approved supplemental synthesis"
      output_path: "Layout Guide/sections/final_layout_readiness.md"
  supplemental_sources:
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
      output_path: "Layout Guide/source_docs/"
  figures:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      candidate_id: "U1_fig_ds_p24"
      extraction_method: "promote cited full-page render"
      output_path: "Layout Guide/figures/U1_fig_ds_p24_page24.png"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      candidate_id: "U2_fig_sup_p3"
      extraction_method: "promote cited full-page render"
      output_path: "Layout Guide/figures/U2_fig_sup_p3_page3.png"
  tables:
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      candidate_id: "U1_table_eval_p7_jumpers"
      extraction_method: "promote layout-context table"
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
```

```yaml
layout_guide_citation_map:
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22"
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17"
  - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      output_path: "Layout Guide/figures/U1_fig_ds_p24_page24.png"
      reason: "cited by layout guide"
    - candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      output_path: "Layout Guide/figures/U2_fig_sup_p3_page3.png"
      reason: "cited by layout guide"
  layout_only_tables_to_promote:
    - candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      reason: "board/setup context retained"
  context_only_items:
    - candidate_id: "U1_table_eval_p2_revision_history"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 2
      reason: "revision history; not layout guidance"
    - candidate_id: "U2_table_ds_p4_ordering"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 4
      reason: "ordering codes; not layout guidance"
  missing_tool_or_low_confidence_notes:
    - "No actual rendering or OCR was performed; this is synthetic promotion guidance only."
    - "U2 supplemental source is approved mock content; use only the cited span."
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
  supplemental_docs: 1
  figure_count: 2
  table_count: 1
  rejected_candidates: 2
  tool_use_status:
    network_access: "not used"
    local_file_reads: "not used"
    pdf_rendering: "not claimed"
    ocr: "not claimed"
    camelot: "not claimed"
    pymupdf: "not claimed"
    file_writes: "not claimed"
  warnings:
    - "J1 has no identity evidence and must remain review_required."
    - "Only mocked spans and approved supplemental content were used."
    - "No runtime absolute paths included."
  open_questions:
    - "Whether any project-specific constraints alter U1 reference-layout interpretation."
    - "Whether J1 receives a manufacturer-backed identity in a later review pass."
```

```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "revision history; explicitly non-layout guidance"
  - candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "ordering codes; explicitly non-layout guidance"
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  ready_components:
    - refdes: U1
      component_key: "analog_devices_lt3045edd_1"
      readiness: "ready"
      basis: "datasheet + eval guide spans are source-backed; cited figure/table promotions are bounded"
    - refdes: U2
      component_key: "microchip_mcp73831t_2aci_ot"
      readiness: "ready_with_supplement"
      basis: "datasheet spans plus approved supplemental app note resolve local EVAL gap"
  blocked_components:
    - refdes: J1
      component_key: "usb_c_receptacle_unresolved"
      readiness: "review_required"
      basis: "no manufacturer-backed identity or source evidence"
  next_owner_actions:
    - "Write U1 Layout Guide files from the cited spans and promote only the cited page-24 figure plus page-7 layout-context table."
    - "Write U2 Layout Guide files using the datasheet spans and the approved supplemental page-3 layout span; promote the cited full-page render."
    - "Leave J1 untouched except for review gating and identity resolution."
```

Recommendation: write the packet exactly from the cited spans, promote only the two cited figures and the one layout-context table, and keep J1 gated until identity evidence exists.