```yaml
profile:
  model: gpt-5.4
  reasoning_effort: xhigh
  species: elf
  class: archivist

parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  runtime_absolute_paths_forbidden: true
  component_keys:
    - analog_devices_lt3045edd_1
    - microchip_mcp73831t_2aci_ot
    - usb_c_receptacle_unresolved
  source_inventory:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      identity_status: source_backed
      source_docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          cache_status: new_index_required
          page_count: 44
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          cache_status: new_index_required
          page_count: 12
        - source_file: "EVAL/DC2222A_design_files.zip"
          source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          cache_status: inspect_archive_manifest_only
          archive_candidate_docs:
            - "README_layout_notes.txt"
      review_required: false
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      identity_status: source_backed
      source_docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          cache_status: existing_index_reusable
          page_count: 32
      supplemental_sources:
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          official_or_owner_approved: true
          download_status: mock_saved
      local_eval_material_status: none_found
      review_required: false
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      identity_status: review_required
      source_docs: []
      review_required: true
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
  review_required_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      reason: "No manufacturer-backed identity or approved source evidence; do not invent layout guidance."

per_component_layout_guides:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    output_path: "layout_guide.md"
    status: ready_for_layout_guide_write
    cited_full_page_figures:
      - "figures/LT3045_datasheet_p24_fullpage.png"
    sections:
      - heading: "Placement and Decoupling"
        findings:
          - statement: "Place input and output capacitors close to the regulator pins and keep those connections short and low impedance."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 22
                span_id: "U1_DS_p22_decoupling"
                anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
      - heading: "Thermal and Exposed Pad"
        findings:
          - statement: "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias to spread heat."
            citations:
              - source_file: "DATA Sheet/LT3045_datasheet.pdf"
                source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                page_number: 24
                span_id: "U1_DS_p24_thermal"
                anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      - heading: "Grounding and Reference Layout"
        findings:
          - statement: "Keep the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
            citations:
              - source_file: "EVAL/DC2222A_user_guide.pdf"
                source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                page_number: 6
                span_id: "U1_EVAL_p6_reference_layout"
                anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    open_questions:
      - "Confirm the required heat dissipation so copper area and via density around the exposed pad can be sized."
      - "Confirm whether the final PCB needs measurement sense/test points analogous to the compact EVAL reference placement."
      - "If owner wants more than datasheet plus EVAL evidence, decide whether README_layout_notes.txt from the design ZIP should be separately reviewed."

  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    output_path: "layout_guide.md"
    status: ready_for_layout_guide_write
    local_eval_material_status: none_found
    approved_supplemental_source_in_use: "source_docs/MCP73831_layout_app_note.pdf"
    cited_full_page_figures:
      - "figures/MCP73831_layout_app_note_p3_fullpage.png"
    sections:
      - heading: "Thermal and Copper Area"
        findings:
          - statement: "Thermal behavior depends on copper area and package-to-board heat spreading."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 14
                span_id: "U2_DS_p14_thermal"
                anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
      - heading: "Power Routing and Decoupling"
        findings:
          - statement: "Keep battery and input-capacitor routing short, and keep the sense and charge paths clear of noisy switching nodes."
            citations:
              - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
                source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                page_number: 17
                span_id: "U2_DS_p17_power_path"
                anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
      - heading: "Supplemental Layout Readiness"
        findings:
          - statement: "Use the approved supplemental layout note to keep the input capacitor close, maintain a clean ground return, and keep battery connector routing short."
            citations:
              - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
                source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                page_number: 3
                span_id: "U2_SUP_p3_layout"
                anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    open_questions:
      - "Confirm charger current and board copper budget so the thermal recommendation can be sized to the actual use case."
      - "Confirm final battery connector location so the short-routing recommendation can be translated into placement constraints."

  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    output_path: "layout_guide.md"
    status: review_required_no_guide_content
    cited_full_page_figures: []
    sections:
      - heading: "Blocked"
        findings: []
        note: "No layout guide content should be authored until a manufacturer-backed identity and source packet are supplied."
    open_questions:
      - "What is the exact manufacturer part number?"
      - "What owner-approved datasheet, footprint, and connector-layout source set should bind J1?"

source_map_summary:
  cited_findings:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      finding_key: "U1_decoupling_close_caps"
      guide_section: "Placement and Decoupling"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      span_id_or_anchor: "U1_DS_p22_decoupling / SYNTHETIC_U1_DS_P22_DECOUPLING"
      extraction_or_promotion_method: "fixture_layout_candidate_span_synthesis"
      output_path_relative_to_layout_guide: "layout_guide.md"
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      finding_key: "U1_exposed_pad_thermal_vias"
      guide_section: "Thermal and Exposed Pad"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id_or_anchor: "U1_DS_p24_thermal / SYNTHETIC_U1_DS_P24_THERMAL"
      extraction_or_promotion_method: "fixture_layout_candidate_span_synthesis"
      output_path_relative_to_layout_guide: "layout_guide.md"
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      finding_key: "U1_compact_ground_reference_layout"
      guide_section: "Grounding and Reference Layout"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      span_id_or_anchor: "U1_EVAL_p6_reference_layout / SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
      extraction_or_promotion_method: "fixture_layout_candidate_span_synthesis"
      output_path_relative_to_layout_guide: "layout_guide.md"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      finding_key: "U2_thermal_copper_area"
      guide_section: "Thermal and Copper Area"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      span_id_or_anchor: "U2_DS_p14_thermal / SYNTHETIC_U2_DS_P14_THERMAL"
      extraction_or_promotion_method: "fixture_layout_candidate_span_synthesis"
      output_path_relative_to_layout_guide: "layout_guide.md"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      finding_key: "U2_short_battery_input_routing"
      guide_section: "Power Routing and Decoupling"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      span_id_or_anchor: "U2_DS_p17_power_path / SYNTHETIC_U2_DS_P17_POWER_PATH"
      extraction_or_promotion_method: "fixture_layout_candidate_span_synthesis"
      output_path_relative_to_layout_guide: "layout_guide.md"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      finding_key: "U2_supplemental_clean_ground_return"
      guide_section: "Supplemental Layout Readiness"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_or_promotion_method: "fixture_layout_candidate_span_synthesis"
      output_path_relative_to_layout_guide: "layout_guide.md"
  supplemental_sources:
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: null
      span_id_or_anchor: "source_catalog_entry"
      extraction_or_promotion_method: "approved_fixture_supplemental_source_reference"
      output_path_relative_to_layout_guide: "source_docs/MCP73831_layout_app_note.pdf"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
  figures:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      span_id_or_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      extraction_or_promotion_method: "promote_planned_from_cited_full_page_candidate"
      output_path_relative_to_layout_guide: "figures/LT3045_datasheet_p24_fullpage.png"
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      span_id_or_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      extraction_or_promotion_method: "promote_planned_from_cited_full_page_candidate"
      output_path_relative_to_layout_guide: "figures/MCP73831_layout_app_note_p3_fullpage.png"
  tables:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      span_id_or_anchor: "candidate_only_no_span"
      extraction_or_promotion_method: "fixture_candidate_review_context_only"
      output_path_relative_to_layout_guide: null
      disposition: context_only
      quality_metrics:
        fixture_accuracy: 98.2
        fixture_whitespace: 21.0
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_table_eval_p2_revision_history"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 2
      span_id_or_anchor: "candidate_only_no_span"
      extraction_or_promotion_method: "fixture_candidate_review_rejected"
      output_path_relative_to_layout_guide: null
      disposition: rejected
      quality_metrics:
        fixture_accuracy: 96.0
        fixture_whitespace: 18.5
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      candidate_id: "U2_table_ds_p4_ordering"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 4
      span_id_or_anchor: "candidate_only_no_span"
      extraction_or_promotion_method: "fixture_candidate_review_rejected"
      output_path_relative_to_layout_guide: null
      disposition: rejected
      quality_metrics:
        fixture_accuracy: 99.1
        fixture_whitespace: 12.0

layout_guide_citation_map:
  unique_pair_count: 6
  unique_source_page_pairs_cited:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 22
      citation_anchors: ["SYNTHETIC_U1_DS_P22_DECOUPLING"]
      cited_in_sections: ["Placement and Decoupling"]
      promoted_figure_output: null
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      citation_anchors: ["SYNTHETIC_U1_DS_P24_THERMAL"]
      cited_in_sections: ["Thermal and Exposed Pad"]
      promoted_figure_output: "figures/LT3045_datasheet_p24_fullpage.png"
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      citation_anchors: ["SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"]
      cited_in_sections: ["Grounding and Reference Layout"]
      promoted_figure_output: null
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 14
      citation_anchors: ["SYNTHETIC_U2_DS_P14_THERMAL"]
      cited_in_sections: ["Thermal and Copper Area"]
      promoted_figure_output: null
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_number: 17
      citation_anchors: ["SYNTHETIC_U2_DS_P17_POWER_PATH"]
      cited_in_sections: ["Power Routing and Decoupling"]
      promoted_figure_output: null
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      citation_anchors: ["SYNTHETIC_U2_SUP_P3_LAYOUT"]
      cited_in_sections: ["Supplemental Layout Readiness"]
      promoted_figure_output: "figures/MCP73831_layout_app_note_p3_fullpage.png"

figure_table_extraction_summary:
  full_page_figures_to_promote:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      output_path_relative_to_layout_guide: "figures/LT3045_datasheet_p24_fullpage.png"
      reason: "Page is cited by the thermal/exposed-pad section."
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      output_path_relative_to_layout_guide: "figures/MCP73831_layout_app_note_p3_fullpage.png"
      reason: "Page is cited by the supplemental layout-readiness section."
  layout_only_tables_to_promote: []
  context_only_items:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      page_number: 7
      reason: "Board setup context exists, but the content is setup-centric rather than standalone PCB layout guidance."
      quality_metrics:
        fixture_accuracy: 98.2
        fixture_whitespace: 21.0
  missing_tool_or_low_confidence_notes:
    - "No actual rendering or table extraction is asserted; promotion decisions are fixture-driven runner actions only."
    - "U1 cites EVAL page 6 for compact reference layout, but the fixture provides no matching figure candidate for promotion."
    - "U1 design ZIP exposes README_layout_notes.txt only at manifest level, so it remains unused."
    - "U2 has no local EVAL material; final readiness therefore relies on the approved supplemental app note already present in the fixture."

extraction_manifest:
  processed_components:
    total: 3
    source_backed: 2
    review_required: 1
  processed_docs:
    total: 5
    by_status:
      new_index_required: 2
      existing_index_reusable: 1
      inspect_archive_manifest_only: 1
      approved_mock_supplemental_source: 1
  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses_or_new_index_required:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
  candidate_span_count: 6
  supplemental_docs:
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
      status: mock_saved
  figure_candidates:
    total: 2
    promoted: 2
    context_only: 0
    rejected: 0
  table_candidates:
    total: 3
    promoted: 0
    context_only: 1
    rejected: 2
  rejected_candidates:
    - "U1_table_eval_p2_revision_history"
    - "U2_table_ds_p4_ordering"
  tool_use_status:
    tools_invoked: none
    basis: "Fixture-only synthetic spans, source catalog entries, and candidate metadata."
  warnings:
    - "J1 remains review_required with no source packet."
    - "U2 local_eval_material_status is none_found; readiness is source-backed only because the approved supplemental app note is present in the fixture."
    - "U1 ZIP archive was not content-inspected; only the manifest-level README candidate is known."
  open_questions:
    - "U1: confirm whether final board needs measurement sense/test points analogous to the EVAL compact reference placement."
    - "U1: confirm thermal dissipation target for exposed-pad copper and via sizing."
    - "U2: confirm charger current and battery connector location so copper area and return path can be finalized."

rejected_visual_table_candidates:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: table
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "Revision history is administrative content, not board-layout guidance."
    disposition: rejected
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: table
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "Ordering codes are procurement content, not layout guidance."
    disposition: rejected

boundary_and_readiness_review:
  public_private_boundary_verdict:
    verdict: pass
    checks:
      portable_binding_only: true
      runtime_absolute_paths_excluded: true
      network_access_not_used: true
      local_project_file_reads_not_used: true
      copied_vendor_text_absent: true
      fixture_only_evidence: true
  ready_components:
    - component_key: analog_devices_lt3045edd_1
      refdes: U1
      readiness: ready_for_layout_guide_write
      basis: "Datasheet decoupling and thermal spans plus EVAL compact-ground reference-layout span."
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      readiness: ready_for_layout_guide_write
      basis: "Datasheet thermal/routing spans plus approved supplemental app-note guidance because local EVAL material is none_found."
  blocked_review_components:
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      readiness: blocked_review_required
      reason: "No manufacturer-backed identity or approved source evidence is available."
  next_owner_actions:
    - "Write U1 and U2 Layout Guide/layout_guide.md files from the cited findings in this packet."
    - "Promote only the cited full-page figures: U1 datasheet page 24 and U2 supplemental app-note page 3."
    - "Retain the approved U2 supplemental PDF under Layout Guide/source_docs/ and cite it in the final guide."
    - "Keep J1 blocked until an owner-approved manufacturer part number and source packet are supplied."
```

Recommendation: write U1 and U2 from this packet as-is, promote only the two cited full-page figures, and leave J1 in `review_required` until identity evidence exists.