**profile**
```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: darkelf
  class: auditor
```

**parts_binding_and_inventory**
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
      data_sheet:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          cache_status: "new_index_required"
      eval:
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
    microchip_mcp73831t_2aci_ot:
      data_sheet:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          cache_status: "existing_index_reusable"
      supplemental_approved:
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          official_or_owner_approved: true
          download_status: "mock_saved"
    usb_c_receptacle_unresolved:
      source_docs: []
  review_required_components:
    - usb_c_receptacle_unresolved
  cache_status:
    reused:
      - "DATA Sheet/MCP73831_family_datasheet.pdf"
    new_index_required:
      - "DATA Sheet/LT3045_datasheet.pdf"
      - "EVAL/DC2222A_user_guide.pdf"
    inspect_archive_manifest_only:
      - "EVAL/DC2222A_design_files.zip"
  readiness_summary:
    source_backed:
      - analog_devices_lt3045edd_1
      - microchip_mcp73831t_2aci_ot
    review_required:
      - usb_c_receptacle_unresolved
```

**per_component_layout_guides**
```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    layout_guide:
      sections:
        - title: "Source-Bound Findings"
          items:
            - finding: "Input and output capacitors should be close to the regulator pins with short, low-impedance traces."
              citation:
                source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 22
                span_id: "U1_DS_p22_decoupling"
                bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
                method: "layout guidance extraction"
              output_path: "Layout Guide/layout_guide.md"
            - finding: "Exposed pad and nearby copper should tie into the ground/thermal plane with multiple vias for heat spreading."
              citation:
                source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 24
                span_id: "U1_DS_p24_thermal"
                bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
                method: "layout guidance extraction"
              output_path: "Layout Guide/layout_guide.md"
            - finding: "Evaluation board layout keeps the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
              citation:
                source_file: "EVAL/DC2222A_user_guide.pdf"
                source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                page_number: 6
                span_id: "U1_EVAL_p6_reference_layout"
                bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
                method: "reference-layout extraction"
              output_path: "Layout Guide/layout_guide.md"
        - title: "Layout Implications"
          items:
            - item: "Treat decoupling and power routing as placement-critical, not post-route cleanup."
            - item: "Use thermal via stitching beneath or near the exposed pad to couple to the plane."
            - item: "Preserve a compact continuous ground region around the regulator and sense points."
        - title: "Open Questions"
          items:
            - item: "No unresolved source identity issues for U1."
            - item: "Confirm board stackup and copper weight during implementation if thermal margin is tight."
    figures:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        page_number: 24
        candidate_id: "U1_fig_ds_p24"
        promote_to: "Layout Guide/figures/U1_fig_ds_p24.png"
        reason: "cited by layout guide and contains recommended layout plus thermal pad drawing"
    tables:
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        page_number: 7
        candidate_id: "U1_table_eval_p7_jumpers"
        promote_to: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
        reason: "board setup context retained; layout-adjacent jumper/load connector information"
    review_status: "source_backed"

  microchip_mcp73831t_2aci_ot:
    refdes: U2
    layout_guide:
      sections:
        - title: "Source-Bound Findings"
          items:
            - finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
              citation:
                source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 14
                span_id: "U2_DS_p14_thermal"
                bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
                method: "layout guidance extraction"
              output_path: "Layout Guide/layout_guide.md"
            - finding: "Battery and input capacitor routing should be short, with sense and charge paths kept clear of noisy switching nodes."
              citation:
                source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 17
                span_id: "U2_DS_p17_power_path"
                bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
                method: "layout guidance extraction"
              output_path: "Layout Guide/layout_guide.md"
            - finding: "The app note emphasizes close placement of the input capacitor, a clean ground return, and short battery connector routing."
              citation:
                source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: "U2_SUP_p3_layout"
                bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
                method: "approved supplemental layout extraction"
              output_path: "Layout Guide/layout_guide.md"
        - title: "Layout Implications"
          items:
            - item: "Use generous local copper for thermal spreading at the charger package."
            - item: "Keep battery and input capacitor routes short and direct."
            - item: "Preserve a clean return path and avoid noisy-node crossings."
        - title: "Open Questions"
          items:
            - item: "No local EVAL material was found; final readiness depends on the approved supplemental app note."
            - item: "No additional board-specific constraints are present in the fixture."
    figures:
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        page_number: 3
        candidate_id: "U2_fig_sup_p3"
        promote_to: "Layout Guide/figures/U2_fig_sup_p3.png"
        reason: "approved supplemental source cited by the layout guide"
    tables: []
    review_status: "source_backed"

  usb_c_receptacle_unresolved:
    refdes: J1
    layout_guide:
      sections:
        - title: "Review Status"
          items:
            - item: "Identity remains unresolved."
            - item: "No manufacturer part number or owner-approved source evidence is available."
        - title: "Open Questions"
          items:
            - item: "Acquire manufacturer-backed identity before any layout guidance is drafted."
            - item: "Do not infer footprint, pinout, or placement rules from this fixture."
    figures: []
    tables: []
    review_status: "review_required"
```

**source_map_summary**
```yaml
source_map_summary:
  cited_findings:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id: "U1_DS_p22_decoupling"
      bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      extraction_method: "layout guidance extraction"
      promoted_to: "Layout Guide/layout_guide.md"
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id: "U1_DS_p24_thermal"
      bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      extraction_method: "layout guidance extraction"
      promoted_to: "Layout Guide/layout_guide.md"
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id: "U1_EVAL_p6_reference_layout"
      bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      extraction_method: "reference-layout extraction"
      promoted_to: "Layout Guide/layout_guide.md"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id: "U2_DS_p14_thermal"
      bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      extraction_method: "layout guidance extraction"
      promoted_to: "Layout Guide/layout_guide.md"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id: "U2_DS_p17_power_path"
      bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      extraction_method: "layout guidance extraction"
      promoted_to: "Layout Guide/layout_guide.md"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id: "U2_SUP_p3_layout"
      bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_method: "approved supplemental layout extraction"
      promoted_to: "Layout Guide/layout_guide.md"
  supplemental_sources:
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
  figures:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      candidate_id: "U1_fig_ds_p24"
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
      extraction_method: "render-and-promote"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      candidate_id: "U2_fig_sup_p3"
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
      extraction_method: "render-and-promote"
  tables:
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      candidate_id: "U1_table_eval_p7_jumpers"
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      extraction_method: "layout-context table promotion"
  rejected_or_not_promoted:
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 2
      candidate_id: "U1_table_eval_p2_revision_history"
      reason: "revision history is not layout guidance"
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 4
      candidate_id: "U2_table_ds_p4_ordering"
      reason: "ordering code table is not layout guidance"
```

**layout_guide_citation_map**
```yaml
layout_guide_citation_map:
  cited_page_pairs:
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
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
      reason: "cited by final layout guide; recommended layout and thermal pad drawing"
    - candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
      reason: "approved supplemental source cited by final layout guide"
  layout_only_tables_to_promote:
    - candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      reason: "board setup context retained; layout-adjacent"
  context_only_items:
    - source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      archive_entry: "README_layout_notes.txt"
      handling: "archive manifest inspection only"
  low_confidence_or_missing_tool_notes:
    - item: "No OCR, Camelot, or PDF rendering was actually performed; all extraction is synthetic and source-bound to fixture spans."
    - item: "No local EVAL material exists for U2; supplemental official app note is used instead."
```

**extraction_manifest**
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
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
  archive_manifest_only:
    - "EVAL/DC2222A_design_files.zip"
  candidate_span_count: 6
  supplemental_docs: 1
  figure_count: 2
  table_count: 1
  rejected_candidates: 2
  tool_use_status:
    network: "not used"
    local_filesystem_reads: "not used"
    downloads: "not used"
    pdf_rendering: "not used"
    ocr: "not used"
    camelot: "not used"
    pymupdf: "not used"
    file_writes: "not used"
  warnings:
    - "All content is fixture-synthetic and must not be treated as real document extraction."
    - "J1 remains unresolved and must not receive inferred layout guidance."
  open_questions:
    - "Confirm U1 thermal implementation details during board integration if copper area is constrained."
    - "Confirm U2 final board-ready constraints only against the approved supplemental app note."
    - "Obtain manufacturer-backed identity for J1 before any layout work."
```

**rejected_visual_table_candidates**
```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    candidate_type: "table"
    reason: "revision history is not board layout guidance"
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    candidate_type: "table"
    reason: "ordering codes are not layout guidance"
```

**boundary_and_readiness_review**
```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  rationale:
    - "Only fixture-provided synthetic spans, checksums, pages, and approved mock URLs were used."
    - "No runtime absolute paths, secrets, credentials, or project-private material were introduced."
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_or_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Write U1 and U2 Layout Guide markdown using the cited spans and promoted figure/table paths."
    - "Promote only the two cited full-page figures under Layout Guide/figures/."
    - "Promote only U1 table p7; reject the revision-history and ordering tables."
    - "Hold J1 pending manufacturer-backed identity and source evidence."
```

Use this packet as the runner input and keep J1 gated until identity evidence exists.