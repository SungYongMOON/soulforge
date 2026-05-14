```yaml
profile:
  model: gpt-5.4
  reasoning_effort: medium
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
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          cache_status: new_index_required
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
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          cache_status: mock_saved
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          official_or_owner_approved: true
      coverage_gap:
        local_eval_material_status: none_found
        gap: "No local EVAL guide or board drawing is present, so supplemental official guidance should be checked before final readiness."
      review_required: false
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      identity_status: review_required
      source_docs: []
      review_required: true
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity. Do not invent datasheets, EVAL material, or layout guidance."
  review_required_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      reason: "missing manufacturer-backed identity and source evidence"
```

```yaml
per_component_layout_guides:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    output_path: "analog_devices_lt3045edd_1/Layout Guide/layout_guide.md"
    sections:
      - heading: Overview
        findings:
          - text: "Guide is source-backed by the datasheet plus evaluation-board reference material; emphasis is compact regulator support placement, quiet grounding, and thermal pad integration."
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
      - heading: Placement And Decoupling
        findings:
          - text: "Place input and output capacitors close to the regulator pins and keep those connections short and low impedance."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 22
                span_id: U1_DS_p22_decoupling
                anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
          - text: "Keep the regulator, capacitors, and sense/measurement points compact so the support network stays tightly coupled around the device."
            citations:
              - source_file: "EVAL/DC2222A_user_guide.pdf"
                source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                page_number: 6
                span_id: U1_EVAL_p6_reference_layout
                anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      - heading: Grounding And Routing
        findings:
          - text: "Route power connections with short paths and maintain a continuous local ground area around the regulator support components."
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
      - heading: Thermal And Exposed Pad
        findings:
          - text: "Tie the exposed pad and nearby copper into the ground or thermal plane with multiple vias to spread heat."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 24
                span_id: U1_DS_p24_thermal
                anchor: SYNTHETIC_U1_DS_P24_THERMAL
      - heading: Reference Layout Figures
        findings:
          - text: "Include the cited datasheet layout/thermal page as the primary promoted figure because it is directly referenced by the final guide."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 24
                anchor: figure_candidate:U1_fig_ds_p24
      - heading: Open Questions
        findings:
          - text: "Archive manifest indicates a possible text note in the EVAL design ZIP, but no approved extracted content is available in the fixture."
          - text: "The EVAL jumper/setup table is not promoted because setup context does not establish reusable PCB layout rules by itself."

  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/layout_guide.md"
    sections:
      - heading: Overview
        findings:
          - text: "Guide is source-backed by the cached datasheet and an approved supplemental layout app note because no local EVAL material is present."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 14
                span_id: U2_DS_p14_thermal
                anchor: SYNTHETIC_U2_DS_P14_THERMAL
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: U2_SUP_p3_layout
                anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      - heading: Placement And Decoupling
        findings:
          - text: "Place the input capacitor close to the charger and keep battery connector routing short."
            citations:
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: U2_SUP_p3_layout
                anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
          - text: "Keep battery and input-capacitor routing short and prevent charge/sense paths from crossing noisy switching regions."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 17
                span_id: U2_DS_p17_power_path
                anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
      - heading: Ground Return And Power Path
        findings:
          - text: "Maintain a clean ground return and preserve clear low-noise charge and sense current paths."
            citations:
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: U2_SUP_p3_layout
                anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 17
                span_id: U2_DS_p17_power_path
                anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
      - heading: Thermal
        findings:
          - text: "Thermal performance depends on board copper area and package-to-board heat spreading, so copper allocation is part of layout readiness."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 14
                span_id: U2_DS_p14_thermal
                anchor: SYNTHETIC_U2_DS_P14_THERMAL
      - heading: Reference Layout Figures
        findings:
          - text: "Include the cited supplemental example board-placement page as the promoted figure because it supplies the missing local reference-layout context."
            citations:
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                anchor: figure_candidate:U2_fig_sup_p3
      - heading: Open Questions
        findings:
          - text: "No local EVAL board or drawing exists in the fixture; final package-specific review should confirm connector, battery, and thermal copper implementation against the approved supplemental guidance."

  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    output_path: "usb_c_receptacle_unresolved/Layout Guide/layout_guide.md"
    status: not_generated
    reason: "review_required with no manufacturer-backed identity or approved source evidence"
    sections:
      - heading: Blocked
        findings:
          - text: "No layout guide should be drafted. Identity and source packet must be resolved first."
```

```yaml
source_map_summary:
  cited_findings:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      finding_id: U1_F1
      finding: "Capacitors close to regulator pins; short low-impedance connections."
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: U1_DS_p22_decoupling
      anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
      method: "synthetic span extraction"
      output_path: "Layout Guide/layout_guide.md"
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      finding_id: U1_F2
      finding: "Compact regulator-capacitor-sense grouping over continuous ground area."
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: U1_EVAL_p6_reference_layout
      anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      method: "synthetic span extraction"
      output_path: "Layout Guide/layout_guide.md"
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      finding_id: U1_F3
      finding: "Exposed pad and nearby copper tied into ground/thermal plane with multiple vias."
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: U1_DS_p24_thermal
      anchor: SYNTHETIC_U1_DS_P24_THERMAL
      method: "synthetic span extraction"
      output_path: "Layout Guide/layout_guide.md"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      finding_id: U2_F1
      finding: "Thermal behavior depends on copper area and board heat spreading."
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: U2_DS_p14_thermal
      anchor: SYNTHETIC_U2_DS_P14_THERMAL
      method: "synthetic span extraction"
      output_path: "Layout Guide/layout_guide.md"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      finding_id: U2_F2
      finding: "Short battery/input routing; keep charge and sense paths clear of noisy nodes."
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: U2_DS_p17_power_path
      anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
      method: "synthetic span extraction"
      output_path: "Layout Guide/layout_guide.md"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      finding_id: U2_F3
      finding: "Close input capacitor placement, clean ground return, short battery connector routing."
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: U2_SUP_p3_layout
      anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      method: "approved supplemental synthetic span extraction"
      output_path: "Layout Guide/layout_guide.md"
  cited_figures:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: U1_fig_ds_p24
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      anchor: "figure_candidate:U1_fig_ds_p24"
      method: "full_page_figure_render candidate promoted because cited"
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      candidate_id: U2_fig_sup_p3
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      anchor: "figure_candidate:U2_fig_sup_p3"
      method: "full_page_figure_render candidate promoted because cited"
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
  supplemental_sources:
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
      purpose: "fills missing local evaluation/reference-layout coverage"
```

```yaml
layout_guide_citation_map:
  cited_source_page_pairs:
    - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa::22"
      component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      citation_anchors:
        - SYNTHETIC_U1_DS_P22_DECOUPLING
    - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa::24"
      component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      citation_anchors:
        - SYNTHETIC_U1_DS_P24_THERMAL
        - "figure_candidate:U1_fig_ds_p24"
    - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb::6"
      component_key: analog_devices_lt3045edd_1
      refdes: U1
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      citation_anchors:
        - SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
    - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd::14"
      component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      citation_anchors:
        - SYNTHETIC_U2_DS_P14_THERMAL
    - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd::17"
      component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      citation_anchors:
        - SYNTHETIC_U2_DS_P17_POWER_PATH
    - dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee::3"
      component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      citation_anchors:
        - SYNTHETIC_U2_SUP_P3_LAYOUT
        - "figure_candidate:U2_fig_sup_p3"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_promote:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: U1_fig_ds_p24
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      reason: "cited by final guide for thermal/recommended layout context"
      output_path: "analog_devices_lt3045edd_1/Layout Guide/figures/U1_fig_ds_p24.png"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      candidate_id: U2_fig_sup_p3
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      reason: "cited by final guide for supplemental reference placement"
      output_path: "microchip_mcp73831t_2aci_ot/Layout Guide/figures/U2_fig_sup_p3.png"
  layout_only_tables_to_promote: []
  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: U1_table_eval_p7_jumpers
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      quality_metrics:
        camelot_accuracy: 98.2
        camelot_whitespace: 21.0
      reason: "board setup/jumper context is useful background but not stable PCB layout guidance for promotion"
  missing_tool_or_low_confidence_notes:
    - "This packet records candidate promotion decisions only; no actual render, OCR, table extraction, or file generation is claimed."
    - "ZIP archive inspection is limited to fixture-provided manifest metadata; no promoted content comes from archive entries."
```

```yaml
extraction_manifest:
  processed_docs:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          cache_status: new_index_required
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          cache_status: new_index_required
        - source_file: "EVAL/DC2222A_design_files.zip"
          source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          cache_status: inspect_archive_manifest_only
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          cache_status: existing_index_reusable
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          cache_status: mock_saved
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      docs: []
  cache_hits: 1
  cache_misses_or_new_index_required: 2
  archive_manifest_only: 1
  candidate_span_count:
    total: 6
    by_component:
      U1: 3
      U2: 3
      J1: 0
  supplemental_docs:
    total: 1
    approved_and_used: 1
    details:
      - component_key: microchip_mcp73831t_2aci_ot
        refdes: U2
        source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  figure_candidate_count:
    total: 2
    promoted: 2
    rejected: 0
  table_candidate_count:
    total: 3
    promoted: 0
    context_only: 1
    rejected: 2
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
    - "U2 lacks local EVAL material; readiness depends on the approved supplemental app note already present in the fixture."
    - "J1 remains blocked due to unresolved part identity."
    - "Archive entry README_layout_notes.txt is only a manifest candidate; no extracted evidence is available."
  open_questions:
    - "Should U1 later incorporate approved content from the ZIP README if an owner-approved extracted packet is supplied?"
    - "For U2, is the approved app note sufficient for release, or is a package-specific board review still required by the next owner?"
```

```yaml
rejected_visual_table_candidates:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    candidate_id: U1_table_eval_p2_revision_history
    candidate_type: table
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "revision history is explicitly non-layout content"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    candidate_id: U1_table_eval_p7_jumpers
    candidate_type: table
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    quality_metrics:
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
    disposition: context_only_not_promoted
    reason: "setup/jumper table does not directly encode reusable PCB layout rules despite acceptable extraction metrics"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    candidate_id: U2_table_ds_p4_ordering
    candidate_type: table
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    quality_metrics:
      camelot_accuracy: 99.1
      camelot_whitespace: 12.0
    reason: "ordering table is explicitly non-layout content"
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict:
    status: pass
    notes:
      - "Uses only fixture-provided mocked files, checksums, page numbers, spans, and approved source URL."
      - "Contains no runtime absolute paths, secrets, customer data, copied vendor text, or local project file content."
      - "Makes no claim of actual downloads, rendering, OCR, table extraction, commands, or file writes."
  ready_components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      readiness: ready_for_layout_guide_packet
      basis: "datasheet plus local EVAL reference spans provide decoupling, grounding, and thermal guidance"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      readiness: ready_for_layout_guide_packet_with_supplemental_basis
      basis: "datasheet cache reused and approved supplemental app note closes local EVAL gap for final guide drafting"
  blocked_or_review_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      readiness: blocked_review_required
      basis: "no manufacturer-backed identity or approved source evidence"
  next_owner_actions:
    - "Write the two ready `layout_guide.md` files using the cited findings and anchors exactly as mapped."
    - "Promote only the two cited full-page figures under each component `Layout Guide/figures/`."
    - "Do not generate a guide for J1 until identity and approved source packet are supplied."
    - "If future owner-approved extracted evidence appears for U1 ZIP README or a local U2 EVAL board, treat it as a follow-on revision rather than backfilling unstated content now."
```

Proceed with U1 and U2 packet writing/promotions as mapped, and hold J1 at review gate until identity evidence exists.