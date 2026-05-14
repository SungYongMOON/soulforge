**profile**
```yaml
model: gpt-5.4-mini
reasoning_effort: low
species: elf
class: archivist
```

**parts_binding_and_inventory**
```yaml
portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
portable_only: true
cache_status:
  U1:
    datasheet: new_index_required
    eval_guide: new_index_required
    eval_zip: inspect_archive_manifest_only
  U2:
    datasheet: existing_index_reusable
    supplemental_app_note: mock_saved
review_required_components:
  - J1

component_keys:
  - analog_devices_lt3045edd_1
  - microchip_mcp73831t_2aci_ot
  - usb_c_receptacle_unresolved

source_docs:
  U1:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
  U2:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  J1: []

notes:
  - "U1 uses datasheet + eval guide + archive-manifest-only inspection."
  - "U2 reuses datasheet cache and includes approved supplemental official app note."
  - "J1 has no manufacturer-backed identity or source evidence and remains review_required."
```

**per_component_layout_guides**
```yaml
analog_devices_lt3045edd_1:
  refdes: U1
  status: source_backed
  layout_guide_md:
    sections:
      - heading: "Source Scope"
        findings:
          - "Use LT3045 datasheet pages 22 and 24 plus DC2222A user guide page 6 as layout evidence."
        citations:
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      - heading: "Layout Guidance"
        findings:
          - "Keep input and output capacitors close to regulator pins with short, low-impedance traces."
          - "Tie exposed pad and nearby copper into the ground/thermal plane with multiple vias for heat spreading."
          - "Mirror the reference-board pattern: compact placement around a continuous ground area with nearby measurement sense points."
        citations:
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      - heading: "Open Questions"
        findings:
          - "Confirm whether the archive note in DC2222A_design_files.zip adds any board-specific routing constraint before final placement."
        citations:
          - source_file: "EVAL/DC2222A_design_files.zip"
            source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
            page_number: null
            span_id: "archive_manifest_only"
            anchor: "README_layout_notes.txt"
        note: "Archive inspection is manifest-only; no rendered source text is assumed."
  figures_to_promote:
    - "Layout Guide/figures/U1_fig_ds_p24.png"
  tables_to_promote:
    - "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
  context_only_items: []
  review_required: false

microchip_mcp73831t_2aci_ot:
  refdes: U2
  status: source_backed
  layout_guide_md:
    sections:
      - heading: "Source Scope"
        findings:
          - "Use MCP73831 datasheet pages 14 and 17 plus the approved supplemental layout app note page 3."
          - "Local EVAL coverage is absent; final readiness depends on the approved supplemental source."
        citations:
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      - heading: "Layout Guidance"
        findings:
          - "Thermal performance depends on copper area and package-to-board heat spreading."
          - "Keep battery and input capacitor routing short and isolate sense/charge paths from noisy switching nodes."
          - "Place the input capacitor close, keep a clean ground return, and route the battery connector short."
        citations:
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      - heading: "Open Questions"
        findings:
          - "No local EVAL guide or board drawing is present."
          - "Final placement should be checked against the approved supplemental app note before release."
        citations:
          - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
  figures_to_promote:
    - "Layout Guide/figures/U2_fig_sup_p3.png"
  tables_to_promote: []
  context_only_items: []
  review_required: false

usb_c_receptacle_unresolved:
  refdes: J1
  status: review_required
  layout_guide_md:
    sections:
      - heading: "Identity Review"
        findings:
          - "No manufacturer part number or owner-approved source identity is available."
          - "Do not invent datasheets, EVAL material, or layout guidance."
        citations: []
      - heading: "Open Questions"
        findings:
          - "Need manufacturer-backed identity and source evidence before any layout guide can be drafted."
        citations: []
  figures_to_promote: []
  tables_to_promote: []
  context_only_items: []
  review_required: true
```

**source_map_summary**
```yaml
entries:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id_or_anchor: "U1_DS_p22_decoupling / SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "source-bound layout guidance; cited in layout guide; promote cited full-page render only"
    output_path: "Layout Guide/sections/source_scope.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "U1_DS_p24_thermal / SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "source-bound thermal/exposed-pad guidance; cited in layout guide; promote cited full-page render"
    output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id_or_anchor: "U1_EVAL_p6_reference_layout / SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "reference-layout grounding and compact-placement evidence; cited in layout guide"
    output_path: "Layout Guide/sections/layout_guidance.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_design_files.zip"
    source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    page_number: null
    span_id_or_anchor: "archive_manifest_only / README_layout_notes.txt"
    extraction_promotion_method: "manifest-only archive inspection; used only as open question"
    output_path: "Layout Guide/sections/open_questions.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id_or_anchor: "U2_DS_p14_thermal / SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "source-bound thermal guidance; cited in layout guide"
    output_path: "Layout Guide/sections/source_scope.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id_or_anchor: "U2_DS_p17_power_path / SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "source-bound power-path and decoupling guidance; cited in layout guide"
    output_path: "Layout Guide/sections/layout_guidance.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved supplemental official guidance; cited in layout guide; promote cited full-page render"
    output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
```

**layout_guide_citation_map**
```yaml
citation_pairs:
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
      - "U1_DS_p22_decoupling"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
      - "U1_DS_p24_thermal"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      - "U1_EVAL_p6_reference_layout"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
      - "U2_DS_p14_thermal"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
      - "U2_DS_p17_power_path"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
  - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
      - "U2_SUP_p3_layout"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
```

**figure_table_extraction_summary**
```yaml
full_page_figures_to_render_promote:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    candidate_id: "U1_fig_ds_p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    destination: "Layout Guide/figures/U1_fig_ds_p24.png"
    reason: "cited by final layout guide; recommended layout and thermal pad drawing"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    candidate_id: "U2_fig_sup_p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    destination: "Layout Guide/figures/U2_fig_sup_p3.png"
    reason: "approved supplemental source and cited by final layout guide"

layout_only_tables_to_promote:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    candidate_id: "U1_table_eval_p7_jumpers"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    destination: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    reason: "board setup context retained; layout-related jumper/load connector table"

context_only_items: []

missing_tool_or_low_confidence_notes:
  - "U1 archive entry is manifest-only; no rendered content should be inferred from the zip."
  - "U2 local EVAL status is none_found; supplemental official app note is required for readiness."
```

**extraction_manifest**
```yaml
workflow_id: "component_pcb_layout_guide_extraction"
fixture_type: "public_safe_synthetic"
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
  - "EVAL/DC2222A_design_files.zip"
  - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
candidate_span_count: 6
supplemental_docs: 1
figure_count: 2
table_count: 1
rejected_candidate_count: 2
tool_use_status:
  network: "not used"
  local_file_reads: "not used"
  pdf_rendering: "not claimed"
  ocr: "not claimed"
  camelot: "not claimed"
  pypdfium_or_pymupdf: "not claimed"
warnings:
  - "Use only synthetic spans and approved supplemental source anchors."
  - "Do not invent J1 identity or layout guidance."
  - "Keep promoted figures limited to unique cited source-file checksum plus page pairs."
open_questions:
  - "Whether U1 archive layout notes add any routing or placement constraint."
  - "Whether any non-synthetic board-specific corroboration exists for U2 beyond the approved app note, if the runner later expands scope."
```

**rejected_visual_table_candidates**
```yaml
rejected:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "revision history is not board layout guidance"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "ordering codes are not layout guidance"
```

**boundary_and_readiness_review**
```yaml
public_private_boundary:
  verdict: pass
  notes:
    - "Only synthetic fixture data was used."
    - "No runtime absolute paths, secrets, credentials, or copied vendor text are included."
ready_components:
  - "U1"
  - "U2"
blocked_or_review_components:
  - "J1"
next_owner_actions:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    action: "Write Layout Guide markdown, cite pages 22, 24, and 6, then promote the cited U1 page-24 render and page-7 board-context table."
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    action: "Write Layout Guide markdown with datasheet plus approved app note, promote the cited page-3 render, and mark final readiness contingent on supplemental guidance."
  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    action: "Request manufacturer-backed identity and source evidence before any layout guide is drafted."
```

Recommendation: write the packet exactly from these blocks, then stop U1/U2 promotion at the cited source pairs and keep J1 gated until identity is resolved.