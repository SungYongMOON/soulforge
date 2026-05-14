**profile**
```yaml
model: gpt-5.4-mini
reasoning_effort: low
species: elf
class: administrator
```

**parts_binding_and_inventory**
```yaml
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
review_required_components:
  - usb_c_receptacle_unresolved
cache_status:
  datasheet_cache_reuse:
    U1: false
    U2: true
  supplemental_source_approved:
    U2: true
```

**per_component_layout_guides**
```yaml
analog_devices_lt3045edd_1:
  refdes: "U1"
  identity_status: "source_backed"
  layout_guide_md:
    sections:
      - heading: "Source-Bound Findings"
        findings:
          - finding_id: "U1-F1"
            summary: "Input and output capacitors should be placed close to the regulator pins with short, low-impedance traces."
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            method: "layout_candidate_span"
          - finding_id: "U1-F2"
            summary: "The exposed pad and nearby copper should be tied into the ground/thermal plane with multiple vias for heat spreading."
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
            method: "layout_candidate_span"
          - finding_id: "U1-F3"
            summary: "The evaluation board layout keeps the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
            source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            method: "layout_candidate_span"
      - heading: "Layout Guidance"
        guidance:
          - "Place input/output capacitors adjacent to the regulator pins."
          - "Keep power traces short and low impedance."
          - "Connect exposed pad copper into the thermal/ground plane with multiple vias."
          - "Preserve a compact reference layout around a continuous ground area."
      - heading: "Figures and Tables"
        figures:
          - figure_id: "U1_fig_ds_p24"
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            status: "promote"
            reason: "Cited layout and thermal pad drawing"
            output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
        tables:
          - table_id: "U1_table_eval_p7_jumpers"
            source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 7
            status: "promote"
            reason: "Board setup table with retained layout context"
            output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      - heading: "Open Questions"
        items:
          - "Confirm whether the evaluation board jumper/load connector table needs any board-specific annotation beyond the retained setup context."
microchip_mcp73831t_2aci_ot:
  refdes: "U2"
  identity_status: "source_backed"
  layout_guide_md:
    sections:
      - heading: "Source-Bound Findings"
        findings:
          - finding_id: "U2-F1"
            summary: "Thermal behavior depends on copper area and package-to-board heat spreading."
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
            method: "layout_candidate_span"
          - finding_id: "U2-F2"
            summary: "Battery and input capacitor routing should be short, with the sense and charge paths kept clear of noisy switching nodes."
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            method: "layout_candidate_span"
          - finding_id: "U2-F3"
            summary: "The approved supplemental app note emphasizes close placement of the input capacitor, a clean ground return, and short battery connector routing."
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            method: "approved_mock_supplemental_span"
      - heading: "Layout Guidance"
        guidance:
          - "Use copper area to improve thermal performance."
          - "Keep battery and input capacitor routing short."
          - "Maintain clean ground return paths."
          - "Keep charge and sense routing away from noisy switching nodes."
          - "Use the approved supplemental app note as final layout readiness support."
      - heading: "Figures and Tables"
        figures:
          - figure_id: "U2_fig_sup_p3"
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            status: "promote"
            reason: "Cited charger board placement drawing"
            output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
        tables:
          - table_id: "U2_table_ds_p4_ordering"
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 4
            status: "reject"
            reason: "Ordering codes, not layout guidance"
      - heading: "Open Questions"
        items:
          - "No local EVAL guide exists; final readiness depends on the approved supplemental app note only."
usb_c_receptacle_unresolved:
  refdes: "J1"
  identity_status: "review_required"
  layout_guide_md:
    sections:
      - heading: "Source-Bound Findings"
        findings: []
      - heading: "Layout Guidance"
        guidance:
          - "No guidance may be authored until manufacturer-backed identity is resolved."
      - heading: "Figures and Tables"
        figures: []
        tables: []
      - heading: "Open Questions"
        items:
          - "Manufacturer part number is missing."
          - "No owner-approved source identity is available."
          - "Do not invent datasheets, EVAL material, or layout guidance."
```

**source_map_summary**
```yaml
cited_findings:
  - finding_id: "U1-F1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    extraction_promotion_method: "layout_candidate_span -> layout guide finding"
    output_path: "Layout Guide/findings/U1-F1.md"
  - finding_id: "U1-F2"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    extraction_promotion_method: "layout_candidate_span -> layout guide finding"
    output_path: "Layout Guide/findings/U1-F2.md"
  - finding_id: "U1-F3"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    extraction_promotion_method: "layout_candidate_span -> layout guide finding"
    output_path: "Layout Guide/findings/U1-F3.md"
  - finding_id: "U2-F1"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    extraction_promotion_method: "layout_candidate_span -> layout guide finding"
    output_path: "Layout Guide/findings/U2-F1.md"
  - finding_id: "U2-F2"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    extraction_promotion_method: "layout_candidate_span -> layout guide finding"
    output_path: "Layout Guide/findings/U2-F2.md"
  - finding_id: "U2-F3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    extraction_promotion_method: "approved_mock_supplemental_span -> layout guide finding"
    output_path: "Layout Guide/findings/U2-F3.md"
supplemental_sources:
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    output_path: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
figures:
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    figure_id: "U1_fig_ds_p24"
    extraction_promotion_method: "cited full-page figure render"
    output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    figure_id: "U2_fig_sup_p3"
    extraction_promotion_method: "cited full-page figure render"
    output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
tables:
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    table_id: "U1_table_eval_p7_jumpers"
    extraction_promotion_method: "layout-context retained table promotion"
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
```

**layout_guide_citation_map**
```yaml
unique_citations:
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
  - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
```

**figure_table_extraction_summary**
```yaml
full_page_figures_to_render_promote:
  - figure_id: "U1_fig_ds_p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    page_number: 24
    destination: "Layout Guide/figures/U1_fig_ds_p24.png"
    status: "promote"
  - figure_id: "U2_fig_sup_p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    page_number: 3
    destination: "Layout Guide/figures/U2_fig_sup_p3.png"
    status: "promote"
layout_only_tables_to_promote:
  - table_id: "U1_table_eval_p7_jumpers"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    page_number: 7
    destination: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    status: "promote"
context_only_items: []
missing_tool_or_low_confidence_notes:
  - "No actual OCR, PDF rendering, or Camelot execution is claimed; all decisions are fixture-bound."
  - "U2 uses an approved supplemental mock app note because local EVAL material is absent."
```

**extraction_manifest**
```yaml
workflow_id: "component_pcb_layout_guide_extraction"
processed_docs:
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    status: "processed_from_fixture_spans"
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    status: "processed_from_fixture_spans"
  - source_file: "EVAL/DC2222A_design_files.zip"
    source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    status: "archive_manifest_only"
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    status: "processed_from_fixture_spans"
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    status: "processed_from_approved_mock_supplemental_span"
cache_hits:
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    cache_status: "existing_index_reusable"
cache_misses:
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    cache_status: "new_index_required"
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    cache_status: "new_index_required"
candidate_span_count: 6
supplemental_docs_count: 1
figure_count: 2
table_count: 1
rejected_candidates_count: 2
tool_use_status:
  network: "not used"
  local_file_reads: "not used"
  pdf_rendering: "not claimed"
  ocr: "not claimed"
  camelot: "not claimed"
  writes: "not claimed"
warnings:
  - "J1 has no manufacturer-backed identity and remains review_required."
  - "U2 local EVAL material is absent; readiness depends on the approved supplemental source."
open_questions:
  - "Whether U1 requires any further board-specific annotations beyond the cited reference layout."
  - "Whether U2 should remain supplemented only by the approved app note or gain a local EVAL guide later."
```

**rejected_visual_table_candidates**
```yaml
rejected:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    page_number: 2
    reason: "Revision history is not board layout guidance."
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    page_number: 4
    reason: "Ordering codes are not layout guidance."
```

**boundary_and_readiness_review**
```yaml
boundary_verdict: "public_safe and source-bound"
ready_components:
  - "analog_devices_lt3045edd_1"
  - "microchip_mcp73831t_2aci_ot"
blocked_or_review_components:
  - "usb_c_receptacle_unresolved"
next_owner_actions:
  - component_key: "analog_devices_lt3045edd_1"
    action: "Write the Layout Guide artifacts and promote only the cited figure and layout-context table."
  - component_key: "microchip_mcp73831t_2aci_ot"
    action: "Write the Layout Guide artifacts, keep the approved supplemental app note in source_docs, and mark final readiness from the cited evidence."
  - component_key: "usb_c_receptacle_unresolved"
    action: "Resolve manufacturer identity before any datasheet, layout guide, or figure/table work."
```

Proceed with U1 and U2 only; keep J1 blocked until identity is sourced.