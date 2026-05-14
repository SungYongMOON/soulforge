**profile**
```yaml
model: gpt-5.4-mini
reasoning_effort: low
species: dwarf
class: administrator
```

**parts_binding_and_inventory**
```yaml
portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
portable_only: true
cache_status:
  analog_devices_lt3045edd_1: new_index_required
  microchip_mcp73831t_2aci_ot: existing_index_reusable
  usb_c_receptacle_unresolved: not_applicable
component_keys:
  - analog_devices_lt3045edd_1
  - microchip_mcp73831t_2aci_ot
  - usb_c_receptacle_unresolved
source_docs:
  analog_devices_lt3045edd_1:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
  microchip_mcp73831t_2aci_ot:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  usb_c_receptacle_unresolved: []
review_required_components:
  - usb_c_receptacle_unresolved
notes:
  - "J1 remains review_required with no source identity."
  - "U2 uses approved supplemental official guidance because local EVAL coverage is absent."
```

**per_component_layout_guides**
```yaml
analog_devices_lt3045edd_1:
  refdes: U1
  identity_status: source_backed
  layout_guide:
    source_docs:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      - source_file: "EVAL/DC2222A_design_files.zip"
        source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        archive_manifest_scope: "README_layout_notes.txt only"
    sections:
      - heading: "Layout intent"
        findings:
          - "Place input and output capacitors close to the regulator pins with short, low-impedance traces."
          - "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias."
          - "Keep the evaluation-board-style placement compact around a continuous ground area."
        evidence:
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
        open_questions:
          - "No explicit layout-via count is given in the fixture; keep the note qualitative."
      - heading: "Grounding and thermal"
        findings:
          - "Use a continuous ground area around the regulator and measurement points."
          - "Use the exposed pad as a heat-spreading path into the board copper."
        evidence:
          - source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
        open_questions:
          - "Board-specific thermal budget is not provided."
      - heading: "Reference-layout guidance"
        findings:
          - "The evaluation layout is the preferred placement pattern for compact routing and sense-point proximity."
        evidence:
          - source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
        open_questions:
          - "The synthetic fixture does not provide the exact figure callout or dimensioned placement."
    figures_to_promote:
      - "Layout Guide/figures/U1_DS_p24.png"
    tables_to_promote:
      - "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    context_only_items:
      - "EVAL/DC2222A_design_files.zip::README_layout_notes.txt"
    review_required: false

microchip_mcp73831t_2aci_ot:
  refdes: U2
  identity_status: source_backed
  layout_guide:
    source_docs:
      - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
        source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
        official_or_owner_approved: true
    sections:
      - heading: "Layout intent"
        findings:
          - "Use short battery and input-capacitor routing."
          - "Keep the ground return clean and direct."
          - "Place the battery connector close to the intended routing path."
        evidence:
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
        open_questions:
          - "No local EVAL guide exists; supplemental official guidance is the final readiness basis."
      - heading: "Thermal and copper area"
        findings:
          - "Thermal performance depends on copper area and package-to-board heat spreading."
          - "Provide enough copper for heat spreading around the package."
        evidence:
          - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
        open_questions:
          - "The fixture does not specify a target copper area."
    figures_to_promote:
      - "Layout Guide/figures/U2_fig_sup_p3.png"
    tables_to_promote: []
    context_only_items: []
    review_required: false

usb_c_receptacle_unresolved:
  refdes: J1
  identity_status: review_required
  layout_guide:
    source_docs: []
    sections: []
    figures_to_promote: []
    tables_to_promote: []
    context_only_items: []
    review_required: true
    reason: "Connector placeholder has no manufacturer part number or owner-approved source identity. Do not invent datasheets, EVAL material, or layout guidance."
```

**source_map_summary**
```yaml
entries:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_or_anchor: "U1_DS_p22_decoupling | SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_or_promotion_method: "source-backed layout finding -> layout_guide.md"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_or_anchor: "U1_DS_p24_thermal | SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_or_promotion_method: "source-backed layout finding -> layout_guide.md + full-page figure promotion"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_or_anchor: "U1_EVAL_p6_reference_layout | SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_or_promotion_method: "reference-layout finding -> layout_guide.md"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_or_anchor: "U1_table_eval_p7_jumpers"
    extraction_or_promotion_method: "layout-context table promotion"
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_or_anchor: "U2_DS_p14_thermal | SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_or_promotion_method: "source-backed thermal finding -> layout_guide.md"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_or_anchor: "U2_DS_p17_power_path | SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_or_promotion_method: "source-backed routing finding -> layout_guide.md"
    output_path: "Layout Guide/layout_guide.md"
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_or_anchor: "U2_SUP_p3_layout | SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_or_promotion_method: "approved supplemental layout guidance -> layout_guide.md + figure promotion"
    output_path: "Layout Guide/layout_guide.md"
```

**layout_guide_citation_map**
```yaml
unique_cited_source_pairs:
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
figure_promotion_rules_applied:
  - "Promote only cited unique full-page renders under Layout Guide/figures/."
  - "Do not promote uncited or non-layout pages."
```

**figure_table_extraction_summary**
```yaml
full_page_figures_to_render_and_promote:
  - component_key: analog_devices_lt3045edd_1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    output_path: "Layout Guide/figures/U1_DS_p24.png"
    reason: "Cited thermal/exposed-pad layout page with board-copper relevance."
  - component_key: microchip_mcp73831t_2aci_ot
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
    reason: "Approved supplemental layout drawing cited for final readiness."
layout_only_tables_to_promote:
  - component_key: analog_devices_lt3045edd_1
    candidate_id: "U1_table_eval_p7_jumpers"
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    reason: "Board/setup context retained; layout-adjacent jumper/load connector table."
context_only_items:
  - component_key: analog_devices_lt3045edd_1
    item: "EVAL/DC2222A_design_files.zip::README_layout_notes.txt"
    reason: "Manifest note only; not a layout citation source."
missing_tool_or_low_confidence_notes:
  - "No actual rendering or OCR performed; promotion is inferred from cited synthetic spans only."
  - "U1 page 24 and U2 page 3 are the only full-page figures to promote."
```

**extraction_manifest**
```yaml
workflow_id: "component_pcb_layout_guide_extraction"
calibration_id: "20260513-204517_staged_cli_matrix"
fixture_type: "public_safe_synthetic"
processed_docs:
  - "DATA Sheet/LT3045_datasheet.pdf"
  - "EVAL/DC2222A_user_guide.pdf"
  - "EVAL/DC2222A_design_files.zip (manifest-only inspection)"
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
rejected_candidate_count: 2
tool_use_status:
  network: "not used"
  local_files: "not read"
  downloads: "not claimed"
  rendering_ocr_camelot_pymupdf: "not claimed"
warnings:
  - "J1 has no backed identity and must remain review_required."
  - "U2 local EVAL material is absent; final readiness depends on approved supplemental source."
open_questions:
  - "Should the runner emit a separate context_pages artifact for U1 README_layout_notes.txt, or keep it manifest-only?"
  - "Should U1 layout_guide.md include an explicit note that page 7 table promotion is layout-adjacent, not primary guidance?"
```

**rejected_visual_table_candidates**
```yaml
rejected:
  - component_key: analog_devices_lt3045edd_1
    candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    candidate_type: "table"
    reason: "Revision history is not board layout guidance."
  - component_key: microchip_mcp73831t_2aci_ot
    candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    candidate_type: "table"
    reason: "Ordering codes are not layout guidance."
```

**boundary_and_readiness_review**
```yaml
public_private_boundary_verdict: "pass"
ready_components:
  - "analog_devices_lt3045edd_1"
  - "microchip_mcp73831t_2aci_ot"
blocked_or_review_components:
  - "usb_c_receptacle_unresolved"
next_owner_actions:
  - component_key: "analog_devices_lt3045edd_1"
    owner_action: "Write Layout Guide markdown, cite U1 spans, and promote the cited U1 p24 figure plus the p7 layout-context table."
  - component_key: "microchip_mcp73831t_2aci_ot"
    owner_action: "Write Layout Guide markdown using the datasheet plus approved supplemental app note; promote the cited U2 p3 figure."
  - component_key: "usb_c_receptacle_unresolved"
    owner_action: "Resolve manufacturer identity and source evidence before any layout guidance is drafted."
readiness_note: "U1 and U2 are ready for Layout Guide generation from the synthetic evidence; J1 remains intentionally blocked."
```

Brief recommendation: keep the runner strict on citation dedupe and only emit the two cited full-page figures plus the single layout-context table promotion.