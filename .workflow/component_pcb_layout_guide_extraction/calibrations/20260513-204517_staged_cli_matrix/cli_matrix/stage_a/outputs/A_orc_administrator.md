```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: orc
  class: administrator
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
  review_required_components:
    - usb_c_receptacle_unresolved
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    status: source_backed
    layout_guide_sections:
      - section: "Source-doc inventory"
        findings:
          - "Primary datasheet plus evaluation-board user guide are available; design ZIP only contributes archive-manifest inspection, not text extraction."
      - section: "Layout findings"
        findings:
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            method: "layout_candidate_span"
            finding: "Input and output capacitors should be close to the regulator pins with short, low-impedance traces."
            synth_topic_tags: ["decoupling", "bypass capacitor placement", "power routing"]
            output_path: "Layout Guide/layout_guide.md"
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
            method: "layout_candidate_span"
            finding: "Exposed pad and nearby copper should tie into the ground/thermal plane with multiple vias for heat spreading."
            synth_topic_tags: ["thermal", "exposed pad", "vias", "ground plane"]
            output_path: "Layout Guide/layout_guide.md"
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            method: "layout_candidate_span"
            finding: "Evaluation-board layout keeps regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
            synth_topic_tags: ["evaluation board layout", "grounding", "reference layout"]
            output_path: "Layout Guide/layout_guide.md"
      - section: "Promoted figures"
        findings:
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            candidate_id: "U1_fig_ds_p24"
            method: "promote_cited_unique_full_page_render"
            output_path: "Layout Guide/figures/"
            note: "Promote because page 24 is cited and is the recommended layout/thermal-pad drawing."
      - section: "Promoted tables"
        findings:
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 7
            candidate_id: "U1_table_eval_p7_jumpers"
            method: "promote_layout_only_table"
            output_path: "Layout Guide/tables/"
            note: "Retain because it is board-setup context tied to reference-board layout."
      - section: "Open questions"
        findings:
          - "No unresolved identity issue for U1."
          - "Archive entry README_layout_notes.txt may be inspected if needed, but no content is provided in the fixture."
    cited_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
      - "SYNTHETIC_U1_DS_P24_THERMAL"
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
  microchip_mcp73831t_2aci_ot:
    refdes: U2
    status: source_backed
    layout_guide_sections:
      - section: "Source-doc inventory"
        findings:
          - "Datasheet cache is reusable."
          - "Local EVAL material is absent; supplemental approved app note is present and should be cited for final readiness."
      - section: "Layout findings"
        findings:
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
            method: "layout_candidate_span"
            finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
            synth_topic_tags: ["thermal", "ground plane"]
            output_path: "Layout Guide/layout_guide.md"
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            method: "layout_candidate_span"
            finding: "Battery and input capacitor routing should be short, with sense and charge paths kept clear of noisy switching nodes."
            synth_topic_tags: ["battery trace", "power routing", "decoupling"]
            output_path: "Layout Guide/layout_guide.md"
          - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            method: "approved_supplemental_span"
            finding: "Close placement of input capacitor, clean ground return, and short battery connector routing are emphasized."
            synth_topic_tags: ["decoupling", "ground return", "battery connector placement"]
            output_path: "Layout Guide/layout_guide.md"
      - section: "Promoted figures"
        findings:
          - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            candidate_id: "U2_fig_sup_p3"
            method: "promote_cited_unique_full_page_render"
            output_path: "Layout Guide/figures/"
            note: "Promote because the approved supplemental app note is cited and provides final layout-readiness grounding."
      - section: "Promoted tables"
        findings: []
      - section: "Open questions"
        findings:
          - "No local EVAL guide or board drawing is present; the approved supplemental app note closes the readiness gap."
    cited_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
  usb_c_receptacle_unresolved:
    refdes: J1
    status: review_required
    layout_guide_sections:
      - section: "Identity review"
        findings:
          - "No manufacturer part number or owner-approved source identity is available."
      - section: "Layout findings"
        findings: []
      - section: "Open questions"
        findings:
          - "Do not invent datasheets, EVAL material, or layout guidance."
    cited_anchors: []
```

```yaml
source_map_summary:
  - finding: "U1 decoupling and bypass capacitors should be placed close with short low-impedance traces."
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id_or_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING / U1_DS_p22_decoupling"
    extraction_promotion_method: "layout_candidate_span -> cited finding"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md"
  - finding: "U1 exposed pad and nearby copper should tie into ground/thermal plane with multiple vias."
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "SYNTHETIC_U1_DS_P24_THERMAL / U1_DS_p24_thermal"
    extraction_promotion_method: "layout_candidate_span -> cited finding"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md"
  - finding: "U1 evaluation layout keeps regulator, capacitors, and sense points compact around continuous ground."
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id_or_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT / U1_EVAL_p6_reference_layout"
    extraction_promotion_method: "layout_candidate_span -> cited finding"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md"
  - finding: "U1 full-page recommended layout and thermal pad drawing."
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "U1_fig_ds_p24"
    extraction_promotion_method: "promote_cited_unique_full_page_render"
    output_path_relative_to_layout_guide: "Layout Guide/figures/"
  - finding: "U1 jumper/load connector table tied to reference board setup."
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_id_or_anchor: "U1_table_eval_p7_jumpers"
    extraction_promotion_method: "promote_layout_only_table"
    output_path_relative_to_layout_guide: "Layout Guide/tables/"
  - finding: "U2 thermal behavior depends on copper area and heat spreading."
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id_or_anchor: "SYNTHETIC_U2_DS_P14_THERMAL / U2_DS_p14_thermal"
    extraction_promotion_method: "layout_candidate_span -> cited finding"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md"
  - finding: "U2 battery and input capacitor routing should be short, with sense and charge paths kept clear."
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id_or_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH / U2_DS_p17_power_path"
    extraction_promotion_method: "layout_candidate_span -> cited finding"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md"
  - finding: "U2 close input capacitor placement, clean ground return, and short battery connector routing."
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT / U2_SUP_p3_layout"
    extraction_promotion_method: "approved_supplemental_span -> cited finding"
    output_path_relative_to_layout_guide: "Layout Guide/layout_guide.md"
  - finding: "U2 example charger board placement drawing."
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "U2_fig_sup_p3"
    extraction_promotion_method: "promote_cited_unique_full_page_render"
    output_path_relative_to_layout_guide: "Layout Guide/figures/"
```

```yaml
layout_guide_citation_map:
  U1:
    checksum_page_pairs_cited:
      - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        page_number: 22
        citation_anchors:
          - "SYNTHETIC_U1_DS_P22_DECOUPLING"
        dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
      - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        page_number: 24
        citation_anchors:
          - "SYNTHETIC_U1_DS_P24_THERMAL"
          - "U1_fig_ds_p24"
        dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
      - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        page_number: 6
        citation_anchors:
          - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
        dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
  U2:
    checksum_page_pairs_cited:
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
          - "U2_fig_sup_p3"
        dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_promote:
    - candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      reason: "Cited layout guide figure; recommended layout and thermal pad drawing."
      output_path: "Layout Guide/figures/"
    - candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      reason: "Cited approved supplemental layout figure; final readiness support."
      output_path: "Layout Guide/figures/"
  layout_only_tables_to_promote:
    - candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
      reason: "Board setup / jumper table with layout context retained."
      output_path: "Layout Guide/tables/"
  context_only_items:
    - candidate_id: "U1_table_eval_p2_revision_history"
      reason: "Revision history; not board layout guidance."
    - candidate_id: "U2_table_ds_p4_ordering"
      reason: "Ordering codes; not layout guidance."
  missing_tool_or_low_confidence_notes:
    - "No actual rendering/OCR/Camelot/PyMuPDF was performed; all promotion decisions are fixture-bound."
    - "U1 design ZIP contributes only archive-manifest inspection; no text extraction from CAD/runtime files."
```

```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  processed_docs:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  cache_hits:
    - "U2 datasheet: existing_index_reusable"
  cache_misses:
    - "U1 datasheet: new_index_required"
    - "U1 user guide: new_index_required"
  candidate_span_count: 5
  supplemental_docs:
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      official_or_owner_approved: true
  figure_count: 2
  table_count: 2
  promoted_figure_count: 2
  promoted_table_count: 1
  rejected_candidates: 2
  tool_use_status:
    network: "not_used"
    local_files: "not_read"
    downloads: "not_claimed"
    pdf_rendering: "not_claimed"
    ocr: "not_claimed"
    camelot: "not_claimed"
    pymupdf: "not_claimed"
    file_writes: "not_claimed"
  warnings:
    - "All findings are synthetic and limited to provided spans and approved supplemental spans."
    - "No runtime absolute paths are included."
  open_questions:
    - "Whether to inspect README_layout_notes.txt from the U1 archive manifest in a later run, if allowed by the runner."
```

```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "Revision history is not layout guidance and should not be promoted."
  - candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "Ordering codes are not board/layout context."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_or_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Write U1 Layout Guide from cited spans; promote page-24 figure and page-7 table as indicated."
    - "Write U2 Layout Guide using datasheet spans plus the approved supplemental app note; promote page-3 figure."
    - "Leave J1 in review_required until a manufacturer-backed identity and source evidence are provided."
```

Brief recommendation: generate the U1 and U2 `Layout Guide/` artifacts exactly from the cited anchors above, and keep J1 isolated until identity is resolved.