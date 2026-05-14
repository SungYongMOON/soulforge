```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: dwarf
  class: archivist

parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
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
        cache_status: "mock_saved"
        official_or_owner_approved: true
    usb_c_receptacle_unresolved: []
  review_required_components:
    - usb_c_receptacle_unresolved
  cache_status_summary:
    new_index_required:
      - "DATA Sheet/LT3045_datasheet.pdf"
      - "EVAL/DC2222A_user_guide.pdf"
    existing_index_reusable:
      - "DATA Sheet/MCP73831_family_datasheet.pdf"
    inspect_archive_manifest_only:
      - "EVAL/DC2222A_design_files.zip"
    mock_saved:
      - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"

per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    identity_status: source_backed
    layout_guide_sections:
      overview:
        findings:
          - finding: "Use source-backed layout guidance only from the datasheet and eval user guide."
            citation:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#overview"
          - finding: "The evaluation board layout provides a compact reference around a continuous ground area."
            citation:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#overview"
        open_questions: []
      placement_and_routing:
        findings:
          - finding: "Place input and output capacitors close to the regulator pins with short, low-impedance traces."
            citation:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#placement-and-routing"
          - finding: "Keep sense and power routing compact and tied to the board's grounding strategy."
            citation:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#placement-and-routing"
        open_questions: []
      thermal_and_exposed_pad:
        findings:
          - finding: "Tie the exposed pad and nearby copper into the ground/thermal plane using multiple vias for heat spreading."
            citation:
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 24
              span_id: "U1_DS_p24_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#thermal-and-exposed-pad"
          - finding: "Use the eval-board reference layout as the thermal and grounding baseline."
            citation:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#thermal-and-exposed-pad"
        open_questions: []
      grounding_and_reference_layout:
        findings:
          - finding: "The layout guide should preserve a continuous ground area around the regulator, capacitors, and sense points."
            citation:
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#grounding-and-reference-layout"
        open_questions: []
    source_docs_used:
      - "DATA Sheet/LT3045_datasheet.pdf"
      - "EVAL/DC2222A_user_guide.pdf"
      - "EVAL/DC2222A_design_files.zip"
    figures_to_promote:
      - candidate_id: "U1_fig_ds_p24"
        source_file: "DATA Sheet/LT3045_datasheet.pdf"
        page_number: 24
        reason: "Cited by thermal/exposed-pad guidance and unique full-page render candidate."
        output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    tables_to_promote:
      - candidate_id: "U1_table_eval_p7_jumpers"
        source_file: "EVAL/DC2222A_user_guide.pdf"
        page_number: 7
        reason: "Layout/setup context retained; board setup table can support guide if cited."
        output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    open_questions:
      - "Confirm whether the README_layout_notes.txt inside the design ZIP is needed for the final guide or remains archive-manifest-only."
  microchip_mcp73831t_2aci_ot:
    refdes: U2
    identity_status: source_backed
    layout_guide_sections:
      overview:
        findings:
          - finding: "Use datasheet thermal and power-path guidance as the base layout source."
            citation:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 14
              span_id: "U2_DS_p14_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#overview"
          - finding: "The approved supplemental app note closes the local EVAL gap and supports final readiness."
            citation:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
              method: "approved_supplemental_source"
            output_path: "Layout Guide/layout_guide.md#overview"
        open_questions: []
      placement_and_routing:
        findings:
          - finding: "Keep battery and input capacitor routing short and avoid noisy switching-node exposure."
            citation:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 17
              span_id: "U2_DS_p17_power_path"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#placement-and-routing"
          - finding: "Place the input capacitor close, keep a clean ground return, and route the battery connector short."
            citation:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
              method: "approved_supplemental_source"
            output_path: "Layout Guide/layout_guide.md#placement-and-routing"
        open_questions: []
      thermal_and_grounding:
        findings:
          - finding: "Allocate copper area for heat spreading and tie package heat into the board ground plane."
            citation:
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 14
              span_id: "U2_DS_p14_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
              method: "source_span_extraction"
            output_path: "Layout Guide/layout_guide.md#thermal-and-grounding"
          - finding: "Use the approved app note as final layout-readiness confirmation."
            citation:
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
              method: "approved_supplemental_source"
            output_path: "Layout Guide/layout_guide.md#thermal-and-grounding"
        open_questions: []
    source_docs_used:
      - "DATA Sheet/MCP73831_family_datasheet.pdf"
      - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    figures_to_promote:
      - candidate_id: "U2_fig_sup_p3"
        source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        page_number: 3
        reason: "Cited by the final guide and unique full-page render candidate."
        output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
    tables_to_promote: []
    open_questions: []
  usb_c_receptacle_unresolved:
    refdes: J1
    identity_status: review_required
    layout_guide_sections: []
    source_docs_used: []
    figures_to_promote: []
    tables_to_promote: []
    open_questions:
      - "No manufacturer-backed identity or source evidence is available."
      - "Do not invent datasheets, EVAL material, or layout guidance."

source_map_summary:
  entries:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_or_anchor: "U1_DS_p22_decoupling / SYNTHETIC_U1_DS_P22_DECOUPLING"
      extraction_promotion_method: "source_span_extraction"
      output_path: "Layout Guide/layout_guide.md#overview"
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_or_anchor: "U1_DS_p24_thermal / SYNTHETIC_U1_DS_P24_THERMAL"
      extraction_promotion_method: "source_span_extraction"
      output_path: "Layout Guide/layout_guide.md#thermal-and-exposed-pad"
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_or_anchor: "U1_EVAL_p6_reference_layout / SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      extraction_promotion_method: "source_span_extraction"
      output_path: "Layout Guide/layout_guide.md#grounding-and-reference-layout"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_or_anchor: "U2_DS_p14_thermal / SYNTHETIC_U2_DS_P14_THERMAL"
      extraction_promotion_method: "source_span_extraction"
      output_path: "Layout Guide/layout_guide.md#thermal-and-grounding"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_or_anchor: "U2_DS_p17_power_path / SYNTHETIC_U2_DS_P17_POWER_PATH"
      extraction_promotion_method: "source_span_extraction"
      output_path: "Layout Guide/layout_guide.md#placement-and-routing"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_promotion_method: "approved_supplemental_source"
      output_path: "Layout Guide/layout_guide.md#overview"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_promotion_method: "approved_supplemental_source"
      output_path: "Layout Guide/layout_guide.md#placement-and-routing"

layout_guide_citation_map:
  cited_source_page_pairs:
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

figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
      status: "promote"
    - candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
      status: "promote"
  layout_only_tables_to_promote:
    - candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      status: "promote"
      rationale: "Board/setup context retained; useful for layout guide."
  context_only_items:
    - candidate_id: "U1_table_eval_p2_revision_history"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      page_number: 2
      status: "reject"
      rationale: "Revision history is not board layout guidance."
    - candidate_id: "U2_table_ds_p4_ordering"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      page_number: 4
      status: "reject"
      rationale: "Ordering codes are not layout guidance."
  missing_tool_or_low_confidence_notes:
    - "No actual PDF rendering, OCR, or Camelot execution is claimed."
    - "Promotions are based only on synthetic page/context hints and citation coverage."
    - "No J1 source material exists, so no visual/table extraction is possible."

extraction_manifest:
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
    network: "not_used"
    local_files: "not_read"
    pdf_rendering: "not_claimed"
    ocr: "not_claimed"
    camelot: "not_claimed"
    pymupdf: "not_claimed"
    file_writes: "not_claimed"
  warnings:
    - "U1 ZIP archive is manifest-only; only README_layout_notes.txt is a candidate doc."
    - "J1 remains unresolved and must stay review_required."
    - "No runtime absolute paths included."
  open_questions: []

rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    page_number: 2
    reason: "Revision history is not board/layout guidance and should not be promoted."
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    page_number: 4
    reason: "Ordering codes are not layout guidance and should not be promoted."

boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_or_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Write U1 Layout Guide markdown with the cited decoupling, thermal, grounding, and eval-layout findings."
    - "Write U2 Layout Guide markdown using the datasheet plus approved supplemental app note, and mark final readiness supported."
    - "Promote only the cited unique full-page renders under Layout Guide/figures/ and the single layout-context table under Layout Guide/tables/."
    - "Leave J1 untouched except for review-required tracking until manufacturer-backed identity is supplied."
```

Brief recommendation: proceed with U1 and U2 guide generation as cited above, and keep J1 blocked pending identity evidence.