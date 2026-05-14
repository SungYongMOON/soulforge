**profile**
```yaml
model: gpt-5.4-mini
reasoning_effort: high
species: elf
class: archivist
```

**parts_binding_and_inventory**
```yaml
portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
component_keys:
  - analog_devices_lt3045edd_1
  - microchip_mcp73831t_2aci_ot
  - usb_c_receptacle_unresolved
expected_component_folders:
  - DATA Sheet
  - EVAL
  - Layout Guide
source_docs:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    docs:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        cache_status: "new_index_required"
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        cache_status: "new_index_required"
      - source_file: "EVAL/DC2222A_design_files.zip"
        source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        cache_status: "inspect_archive_manifest_only"
        archive_entries:
          - entry_name: "README_layout_notes.txt"
            candidate_doc: true
          - entry_name: "gerbers/top_copper.gbr"
            candidate_doc: false
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    docs:
      - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
        source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        cache_status: "existing_index_reusable"
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        cache_status: "mock_saved"
        official_or_owner_approved: true
  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    docs: []
cache_status:
  existing_index_reusable: 1
  new_index_required: 2
  inspect_archive_manifest_only: 1
  mock_saved: 1
review_required_components:
  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    reason: "No manufacturer-backed identity or approved source evidence."
```

**per_component_layout_guides**
```yaml
components:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    identity_status: source_backed
    layout_guide_md:
      path: "Layout Guide/layout_guide.md"
      sections:
        - title: "Placement and Decoupling"
          output_path: "layout_guide.md#placement-and-decoupling"
          source_bound_findings:
            - finding: "Input and output capacitors should be placed close to the regulator pins with short, low-impedance routing."
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
              note: "Use this as the primary decoupling placement rule."
          open_questions:
            - "Whether the archive text note should be promoted after manifest inspection."
        - title: "Thermal and Exposed-Pad Handling"
          output_path: "layout_guide.md#thermal-and-exposed-pad-handling"
          source_bound_findings:
            - finding: "Tie the exposed pad and nearby copper into the thermal/ground plane with multiple vias for heat spreading."
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 24
              span_id: "U1_DS_p24_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
              note: "Use this for exposed-pad and thermal-via guidance."
          open_questions: []
        - title: "Grounding and Reference Layout"
          output_path: "layout_guide.md#grounding-and-reference-layout"
          source_bound_findings:
            - finding: "Keep the regulator, input/output capacitors, and sense points compact around a continuous ground area."
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
              note: "Use this as the evaluation-board reference-layout constraint."
          open_questions: []
        - title: "Board Setup Note"
          output_path: "layout_guide.md#board-setup-note"
          source_bound_findings:
            - finding: "Retain board-setup context for jumper/load-connector notes so the reference board setup stays layout-relevant."
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 7
              span_id: "U1_table_eval_p7_jumpers"
              bounded_excerpt_anchor: "U1_TABLE_EVAL_P7_JUMPERS"
              note: "This supports the layout-only table promotion."
          open_questions: []
      promoted_assets:
        figures:
          - "figures/U1_fig_ds_p24.png"
        tables:
          - "tables/U1_table_eval_p7_jumpers.md"
      source_docs:
        - "DATA Sheet/LT3045_datasheet.pdf"
        - "EVAL/DC2222A_user_guide.pdf"
        - "EVAL/DC2222A_design_files.zip"
    readiness: "ready"

  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    identity_status: source_backed
    coverage_gap:
      local_eval_material_status: "none_found"
      gap: "No local EVAL guide or board drawing is present."
    layout_guide_md:
      path: "Layout Guide/layout_guide.md"
      sections:
        - title: "Placement, Decoupling, and Ground Return"
          output_path: "layout_guide.md#placement-decoupling-and-ground-return"
          source_bound_findings:
            - finding: "Place the input capacitor close, keep the ground return clean, and keep battery connector routing short."
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
              note: "Approved supplemental layout guidance closes the local gap."
            - finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 14
              span_id: "U2_DS_p14_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
              note: "Use this for thermal copper sizing."
            - finding: "Keep battery and input capacitor routing short, and keep sense and charge paths clear of noisy switching nodes."
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 17
              span_id: "U2_DS_p17_power_path"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
              note: "Use this for power-path routing discipline."
          open_questions: []
        - title: "Final Readiness Note"
          output_path: "layout_guide.md#final-readiness-note"
          source_bound_findings:
            - finding: "The component is ready for final layout guidance because the approved supplemental app note covers the missing local EVAL material."
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
              note: "Use this as the readiness citation."
          open_questions: []
      promoted_assets:
        figures:
          - "figures/U2_fig_sup_p3.png"
        tables: []
      source_docs:
        - "DATA Sheet/MCP73831_family_datasheet.pdf"
        - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    readiness: "ready"

  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    identity_status: review_required
    layout_guide_md: null
    source_docs: []
    promoted_assets: { figures: [], tables: [] }
    open_questions:
      - "Need manufacturer-backed part identity and approved source evidence before any layout guidance can be drafted."
    readiness: "blocked"
```

**source_map_summary**
```yaml
records:
  - kind: finding
    component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id_or_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "layout_finding_from_span"
    output_path: "layout_guide.md#placement-and-decoupling"
  - kind: finding
    component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "layout_finding_from_span"
    output_path: "layout_guide.md#thermal-and-exposed-pad-handling"
  - kind: finding
    component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id_or_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "layout_finding_from_span"
    output_path: "layout_guide.md#grounding-and-reference-layout"
  - kind: figure
    component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "U1_fig_ds_p24"
    extraction_promotion_method: "figure_promote_full_page"
    output_path: "figures/U1_fig_ds_p24.png"
  - kind: table
    component_key: analog_devices_lt3045edd_1
    refdes: U1
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_id_or_anchor: "U1_table_eval_p7_jumpers"
    extraction_promotion_method: "table_promote_layout_only"
    output_path: "tables/U1_table_eval_p7_jumpers.md"
  - kind: supplemental_source
    component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved_supplemental_source_catalog_entry"
    output_path: "source_docs/MCP73831_layout_app_note.pdf"
  - kind: finding
    component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id_or_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "layout_finding_from_span"
    output_path: "layout_guide.md#placement-decoupling-and-ground-return"
  - kind: finding
    component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id_or_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "layout_finding_from_span"
    output_path: "layout_guide.md#placement-decoupling-and-ground-return"
  - kind: figure
    component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "U2_fig_sup_p3"
    extraction_promotion_method: "figure_promote_full_page"
    output_path: "figures/U2_fig_sup_p3.png"
```

**layout_guide_citation_map**
```yaml
citations:
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
    used_by:
      - "U1 / Placement and Decoupling"
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
    used_by:
      - "U1 / Thermal and Exposed-Pad Handling"
      - "U1 / figure U1_fig_ds_p24"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
    used_by:
      - "U1 / Grounding and Reference Layout"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    citation_anchors:
      - "U1_TABLE_EVAL_P7_JUMPERS"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:7"
    used_by:
      - "U1 / Board Setup Note"
      - "U1 / table U1_table_eval_p7_jumpers"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
    used_by:
      - "U2 / Placement, Decoupling, and Ground Return"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
    used_by:
      - "U2 / Placement, Decoupling, and Ground Return"
  - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
    used_by:
      - "U2 / Placement, Decoupling, and Ground Return"
      - "U2 / Final Readiness Note"
      - "U2 / figure U2_fig_sup_p3"
```

**figure_table_extraction_summary**
```yaml
full_page_figures_to_render_promote:
  - candidate_id: "U1_fig_ds_p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    promotion_reason: "Cited in the layout guide and contains the recommended layout and thermal pad drawing."
    output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
  - candidate_id: "U2_fig_sup_p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    promotion_reason: "Approved supplemental source, cited by the final layout guide, and provides the charger board placement drawing."
    output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
layout_only_tables_to_promote:
  - candidate_id: "U1_table_eval_p7_jumpers"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    camelot_accuracy: 98.2
    camelot_whitespace: 21.0
    promotion_reason: "Board-setup and jumper context is retained, so the table stays layout-relevant."
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
context_only_items:
  - item: "U1 archive manifest entry README_layout_notes.txt"
    source_file: "EVAL/DC2222A_design_files.zip"
    source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    reason: "Manifest-visible text candidate, but not yet part of the cited layout guide set."
missing_tool_or_low_confidence_notes:
  - "None in the fixture; all selections are source-bound and metadata-driven."
```

**extraction_manifest**
```yaml
workflow_id: "component_pcb_layout_guide_extraction"
fixture_type: "public_safe_synthetic"
processed_docs:
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    cache_status: "new_index_required"
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    cache_status: "new_index_required"
  - source_file: "EVAL/DC2222A_design_files.zip"
    source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    cache_status: "inspect_archive_manifest_only"
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    cache_status: "existing_index_reusable"
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    cache_status: "mock_saved"
cache_summary:
  hits: 1
  misses: 2
  manifest_only: 1
  mock_saved: 1
candidate_span_count: 6
supplemental_docs_count: 1
figure_candidate_count: 2
table_candidate_count: 3
promoted_figure_count: 2
promoted_table_count: 1
rejected_candidate_count: 2
tool_use_status: "synthetic-only packet; no live OCR, PDF rendering, Camelot, or filesystem writes represented"
warnings:
  - "U2 local EVAL material status is none_found, so approved supplemental guidance is required for readiness."
  - "J1 must remain review_required because identity and source evidence are missing."
open_questions:
  - "Whether the U1 archive text note should be promoted after extraction from the manifest-visible archive entry."
```

**rejected_visual_table_candidates**
```yaml
rejections:
  - candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    camelot_accuracy: 96.0
    camelot_whitespace: 18.5
    reason: "Revision history is not board-layout guidance."
  - candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    camelot_accuracy: 99.1
    camelot_whitespace: 12.0
    reason: "Ordering codes are not layout guidance."
```

**boundary_and_readiness_review**
```yaml
public_private_boundary:
  verdict: "public-safe synthetic only; no private runtime paths, secrets, credentials, cookies, or project data were used"
ready_components:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    status: ready
  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    status: ready
blocked_or_review_components:
  - refdes: J1
    component_key: usb_c_receptacle_unresolved
    status: review_required
    reason: "No manufacturer-backed identity or approved source evidence."
next_owner_actions:
  - "Write U1 and U2 Layout Guide markdown plus promoted figure/table assets from the cited pages only."
  - "Keep J1 in review until a manufacturer part number or owner-approved source packet exists."
  - "Do not promote any uncited assets or archive entries beyond the manifest-visible text note."
```

Recommendation: emit the U1 and U2 layout guides and promoted assets now, and keep J1 blocked until its identity is backed by approved source evidence.