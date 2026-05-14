```yaml
profile:
  model: gpt-5.5
  reasoning_effort: xhigh
  species: human
  class: auditor

parts_binding_and_inventory:
  portable_parts_root: _workspaces/<project_code>/reference_materials/from_exp_xml/parts
  expected_component_folders:
    - DATA Sheet
    - EVAL
    - Layout Guide
  components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      identity_status: source_backed
      cache_status:
        DATA Sheet/LT3045_datasheet.pdf: new_index_required
        EVAL/DC2222A_user_guide.pdf: new_index_required
        EVAL/DC2222A_design_files.zip: inspect_archive_manifest_only
      source_docs:
        - source_file: DATA Sheet/LT3045_datasheet.pdf
          source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        - source_file: EVAL/DC2222A_user_guide.pdf
          source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
        - source_file: EVAL/DC2222A_design_files.zip
          source_file_sha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      identity_status: source_backed
      local_eval_material_status: none_found
      cache_status:
        DATA Sheet/MCP73831_family_datasheet.pdf: existing_index_reusable
        Layout Guide/source_docs/MCP73831_layout_app_note.pdf: mock_saved
      source_docs:
        - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
          source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
        - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
          source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
          source_url: https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf
          official_or_owner_approved: true
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      identity_status: review_required
      source_docs: []
      review_reason: Connector placeholder has no manufacturer part number or owner-approved source identity.
  review_required_components:
    - usb_c_receptacle_unresolved

per_component_layout_guides:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    output_path: Layout Guide/layout_guide.md
    status: runner_ready
    sections:
      source_bound_layout_findings:
        - guide_anchor: U1_LG_DECOUPLING
          finding: Place input and output capacitors close to regulator pins and route them with short, low-impedance paths.
          citation:
            source_file: DATA Sheet/LT3045_datasheet.pdf
            source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
            page_number: 22
            span_id: U1_DS_p22_decoupling
            bounded_excerpt_anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
        - guide_anchor: U1_LG_THERMAL_PAD
          finding: Tie the exposed pad and adjacent copper into the ground or thermal plane with multiple vias for heat spreading.
          citation:
            source_file: DATA Sheet/LT3045_datasheet.pdf
            source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
            page_number: 24
            span_id: U1_DS_p24_thermal
            bounded_excerpt_anchor: SYNTHETIC_U1_DS_P24_THERMAL
        - guide_anchor: U1_LG_EVAL_REFERENCE
          finding: Use the EVAL reference layout as grounding context: compact regulator/capacitor placement, nearby sense points, and continuous ground area.
          citation:
            source_file: EVAL/DC2222A_user_guide.pdf
            source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
            page_number: 6
            span_id: U1_EVAL_p6_reference_layout
            bounded_excerpt_anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
      promoted_assets:
        figures:
          - figures/U1_fig_ds_p24_full_page.png
        tables:
          - tables/U1_table_eval_p7_jumpers.md
      open_questions:
        - Confirm board-specific current, copper area, and package land-pattern constraints before final PCB release.

  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    output_path: Layout Guide/layout_guide.md
    status: runner_ready_with_approved_supplement
    sections:
      source_bound_layout_findings:
        - guide_anchor: U2_LG_THERMAL
          finding: Treat copper area and board heat spreading as layout-controlled thermal factors.
          citation:
            source_file: DATA Sheet/MCP73831_family_datasheet.pdf
            source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
            page_number: 14
            span_id: U2_DS_p14_thermal
            bounded_excerpt_anchor: SYNTHETIC_U2_DS_P14_THERMAL
        - guide_anchor: U2_LG_POWER_PATH
          finding: Keep battery and input capacitor routing short, and keep sense/charge paths away from noisy switching nodes.
          citation:
            source_file: DATA Sheet/MCP73831_family_datasheet.pdf
            source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
            page_number: 17
            span_id: U2_DS_p17_power_path
            bounded_excerpt_anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
        - guide_anchor: U2_LG_SUPPLEMENTAL_READY
          finding: The approved supplemental app note supports final layout readiness for close input capacitor placement, clean ground return, and short battery connector routing.
          citation:
            source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
            source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
            page_number: 3
            span_id: U2_SUP_p3_layout
            bounded_excerpt_anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
      promoted_assets:
        figures:
          - figures/U2_fig_sup_p3_full_page.png
        tables: []
      open_questions:
        - Local EVAL material remains none_found; final board review should confirm package option, charge current, and available copper.

  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    output_path: Layout Guide/layout_guide.md
    status: review_required
    sections:
      source_bound_layout_findings: []
      open_questions:
        - Owner must provide manufacturer part number or owner-approved source documents before any layout guidance is generated.

source_map_summary:
  - id: U1_LG_DECOUPLING
    component_key: analog_devices_lt3045edd_1
    type: cited_finding
    source_file: DATA Sheet/LT3045_datasheet.pdf
    source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    page_number: 22
    span_id: U1_DS_p22_decoupling
    anchor: SYNTHETIC_U1_DS_P22_DECOUPLING
    method: fixture_span_summary_synthesis
    output_path_relative_to_layout_guide: layout_guide.md
  - id: U1_LG_THERMAL_PAD
    component_key: analog_devices_lt3045edd_1
    type: cited_finding
    source_file: DATA Sheet/LT3045_datasheet.pdf
    source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    page_number: 24
    span_id: U1_DS_p24_thermal
    anchor: SYNTHETIC_U1_DS_P24_THERMAL
    method: fixture_span_summary_synthesis
    output_path_relative_to_layout_guide: layout_guide.md
  - id: U1_FIG_DS_P24
    component_key: analog_devices_lt3045edd_1
    type: promoted_full_page_figure
    source_file: DATA Sheet/LT3045_datasheet.pdf
    source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    page_number: 24
    anchor: U1_fig_ds_p24
    method: promote_full_page_render_intent_because_page_is_cited
    output_path_relative_to_layout_guide: figures/U1_fig_ds_p24_full_page.png
  - id: U1_LG_EVAL_REFERENCE
    component_key: analog_devices_lt3045edd_1
    type: cited_finding
    source_file: EVAL/DC2222A_user_guide.pdf
    source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 6
    span_id: U1_EVAL_p6_reference_layout
    anchor: SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT
    method: fixture_span_summary_synthesis
    output_path_relative_to_layout_guide: layout_guide.md
  - id: U1_TABLE_EVAL_P7
    component_key: analog_devices_lt3045edd_1
    type: promoted_layout_context_table
    source_file: EVAL/DC2222A_user_guide.pdf
    source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 7
    anchor: U1_table_eval_p7_jumpers
    method: promote_fixture_table_candidate_with_board_context_and_quality_metrics
    output_path_relative_to_layout_guide: tables/U1_table_eval_p7_jumpers.md
  - id: U2_LG_THERMAL
    component_key: microchip_mcp73831t_2aci_ot
    type: cited_finding
    source_file: DATA Sheet/MCP73831_family_datasheet.pdf
    source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 14
    span_id: U2_DS_p14_thermal
    anchor: SYNTHETIC_U2_DS_P14_THERMAL
    method: fixture_span_summary_synthesis_from_reusable_cache
    output_path_relative_to_layout_guide: layout_guide.md
  - id: U2_LG_POWER_PATH
    component_key: microchip_mcp73831t_2aci_ot
    type: cited_finding
    source_file: DATA Sheet/MCP73831_family_datasheet.pdf
    source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 17
    span_id: U2_DS_p17_power_path
    anchor: SYNTHETIC_U2_DS_P17_POWER_PATH
    method: fixture_span_summary_synthesis_from_reusable_cache
    output_path_relative_to_layout_guide: layout_guide.md
  - id: U2_SUPPLEMENTAL_SOURCE
    component_key: microchip_mcp73831t_2aci_ot
    type: approved_supplemental_source
    source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
    source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
    page_number: 3
    span_id: U2_SUP_p3_layout
    anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
    method: fixture_approved_mock_supplemental_source
    output_path_relative_to_layout_guide: source_docs/MCP73831_layout_app_note.pdf
  - id: U2_LG_SUPPLEMENTAL_READY
    component_key: microchip_mcp73831t_2aci_ot
    type: cited_finding
    source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
    source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
    page_number: 3
    span_id: U2_SUP_p3_layout
    anchor: SYNTHETIC_U2_SUP_P3_LAYOUT
    method: fixture_span_summary_synthesis_from_approved_supplement
    output_path_relative_to_layout_guide: layout_guide.md
  - id: U2_FIG_SUP_P3
    component_key: microchip_mcp73831t_2aci_ot
    type: promoted_full_page_figure
    source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
    source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
    page_number: 3
    anchor: U2_fig_sup_p3
    method: promote_full_page_render_intent_because_page_is_cited
    output_path_relative_to_layout_guide: figures/U2_fig_sup_p3_full_page.png

layout_guide_citation_map:
  - dedupe_key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22
    source_file: DATA Sheet/LT3045_datasheet.pdf
    source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    page_number: 22
    citation_anchors:
      - U1_LG_DECOUPLING
  - dedupe_key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24
    source_file: DATA Sheet/LT3045_datasheet.pdf
    source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    page_number: 24
    citation_anchors:
      - U1_LG_THERMAL_PAD
      - U1_FIG_DS_P24
  - dedupe_key: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6
    source_file: EVAL/DC2222A_user_guide.pdf
    source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 6
    citation_anchors:
      - U1_LG_EVAL_REFERENCE
  - dedupe_key: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p7
    source_file: EVAL/DC2222A_user_guide.pdf
    source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 7
    citation_anchors:
      - U1_TABLE_EVAL_P7
  - dedupe_key: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14
    source_file: DATA Sheet/MCP73831_family_datasheet.pdf
    source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 14
    citation_anchors:
      - U2_LG_THERMAL
  - dedupe_key: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17
    source_file: DATA Sheet/MCP73831_family_datasheet.pdf
    source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 17
    citation_anchors:
      - U2_LG_POWER_PATH
  - dedupe_key: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3
    source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
    source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
    page_number: 3
    citation_anchors:
      - U2_SUPPLEMENTAL_SOURCE
      - U2_LG_SUPPLEMENTAL_READY
      - U2_FIG_SUP_P3

figure_table_extraction_summary:
  full_page_figures_to_render_promote:
    - candidate_id: U1_fig_ds_p24
      component_key: analog_devices_lt3045edd_1
      source_file: DATA Sheet/LT3045_datasheet.pdf
      source_file_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      page_number: 24
      output_path_relative_to_layout_guide: figures/U1_fig_ds_p24_full_page.png
      reason: page cited by thermal/exposed-pad layout finding
    - candidate_id: U2_fig_sup_p3
      component_key: microchip_mcp73831t_2aci_ot
      source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      page_number: 3
      output_path_relative_to_layout_guide: figures/U2_fig_sup_p3_full_page.png
      reason: page cited by approved supplemental layout-readiness finding
  layout_context_tables_to_promote:
    - candidate_id: U1_table_eval_p7_jumpers
      component_key: analog_devices_lt3045edd_1
      source_file: EVAL/DC2222A_user_guide.pdf
      source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      page_number: 7
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
      output_path_relative_to_layout_guide: tables/U1_table_eval_p7_jumpers.md
      retained_context: reference board setup context only; not a generic regulator layout rule
  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      item: EVAL/DC2222A_design_files.zip::README_layout_notes.txt
      reason: archive manifest indicates layout keyword, but fixture provides no page span or extracted content
  missing_tool_or_low_confidence_notes:
    - No actual rendering, OCR, Camelot, PyMuPDF, archive extraction, network, or file writes are claimed by this synthetic packet.
    - Table promotion is limited to fixture-provided quality metrics and board/layout context.

extraction_manifest:
  workflow_id: component_pcb_layout_guide_extraction
  calibration_id: 20260513-204517_staged_cli_matrix
  fixture_type: public_safe_synthetic
  processed_docs:
    - source_file: DATA Sheet/LT3045_datasheet.pdf
      cache_status: new_index_required
      page_count: 44
    - source_file: EVAL/DC2222A_user_guide.pdf
      cache_status: new_index_required
      page_count: 12
    - source_file: EVAL/DC2222A_design_files.zip
      cache_status: inspect_archive_manifest_only
    - source_file: DATA Sheet/MCP73831_family_datasheet.pdf
      cache_status: existing_index_reusable
      page_count: 32
    - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      cache_status: mock_saved
      page_count: 8
  cache_hits:
    - DATA Sheet/MCP73831_family_datasheet.pdf
  cache_misses_or_new_indexes_required:
    - DATA Sheet/LT3045_datasheet.pdf
    - EVAL/DC2222A_user_guide.pdf
  candidate_span_count:
    datasheet_or_eval_spans: 5
    supplemental_spans: 1
    total: 6
  supplemental_docs:
    - source_file: Layout Guide/source_docs/MCP73831_layout_app_note.pdf
      source_file_sha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      source_url: https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf
      approved: true
  figure_table_counts:
    visual_table_candidates_total: 5
    promoted_full_page_figures: 2
    promoted_tables: 1
    rejected_candidates: 2
  rejected_candidates:
    - U1_table_eval_p2_revision_history
    - U2_table_ds_p4_ordering
  tool_use_status:
    network: not_used
    browser: not_used
    downloads: not_claimed
    pdf_rendering: not_claimed
    ocr: not_claimed
    camelot: not_claimed
    pymupdf: not_claimed
    file_writes: not_claimed
  warnings:
    - J1 remains review_required.
    - U2 has no local EVAL material; approved supplemental fixture source is used for final layout readiness.
    - U1 archive is manifest-only and is not used as cited source evidence.
  open_questions:
    - Supply manufacturer-backed identity and source material for J1.
    - Confirm component-specific board constraints before release routing.

rejected_visual_table_candidates:
  - candidate_id: U1_table_eval_p2_revision_history
    component_key: analog_devices_lt3045edd_1
    candidate_type: table
    source_file: EVAL/DC2222A_user_guide.pdf
    source_file_sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    page_number: 2
    camelot_accuracy: 96.0
    camelot_whitespace: 18.5
    reason: revision history is not board layout guidance
  - candidate_id: U2_table_ds_p4_ordering
    component_key: microchip_mcp73831t_2aci_ot
    candidate_type: table
    source_file: DATA Sheet/MCP73831_family_datasheet.pdf
    source_file_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
    page_number: 4
    camelot_accuracy: 99.1
    camelot_whitespace: 12.0
    reason: ordering codes are not layout guidance

boundary_and_readiness_review:
  public_private_boundary_verdict: public_safe
  boundary_checks:
    runtime_absolute_paths: absent
    real_project_data: absent
    secrets_credentials_cookies: absent
    copied_vendor_text: absent
    network_or_download_claims: absent
    workspace_material_leakage: absent
  ready_components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      readiness: ready_for_runner_markdown_and_asset_packet
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      readiness: ready_for_runner_markdown_and_asset_packet_with_approved_supplement
  blocked_or_review_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      status: review_required
      blocker: no manufacturer-backed identity or owner-approved source evidence
  next_owner_actions:
    - Runner may write U1 and U2 Layout Guide packets from cited fixture spans only.
    - Runner should promote only the cited full-page figure pairs and the U1 board-context table listed above.
    - Owner must provide J1 source identity before any connector layout guide is attempted.
```

Recommendation: treat U1 and U2 as runner-ready synthetic outputs, and keep J1 blocked until owner-approved connector evidence is supplied.