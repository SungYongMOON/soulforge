## 1. `profile`
```yaml
profile:
  model: gpt-5.4
  reasoning_effort: high
  species: elf
  class: archivist
```

## 2. `parts_binding_and_inventory`
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
        - {source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", cache_status: "new_index_required"}
        - {source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", cache_status: "new_index_required"}
        - {source_file: "EVAL/DC2222A_design_files.zip", source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", cache_status: "inspect_archive_manifest_only"}
      review_required: false
    - component_key: microchip_mcp73831t_2aci_ot
      refdes: U2
      identity_status: source_backed
      source_docs:
        - {source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", cache_status: "existing_index_reusable"}
      supplemental_docs:
        - {source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf", official_or_owner_approved: true, download_status: "mock_saved"}
      review_required: false
    - component_key: usb_c_receptacle_unresolved
      refdes: J1
      identity_status: review_required
      source_docs: []
      review_required: true
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
  cache_status_summary:
    cache_hit_docs: 1
    new_index_required_docs: 2
    archive_manifest_only_docs: 1
    supplemental_docs_present: 1
  review_required_components: [J1]
```

## 3. `per_component_layout_guides`
```yaml
per_component_layout_guides:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    guide_status: draftable
    output_path: "Layout Guide/layout_guide.md"
    intended_sections:
      - heading: "Scope and Source Set"
        notes:
          - "Primary evidence comes from the LT3045 datasheet and DC2222A evaluation guide."
          - "Archive ZIP is manifest-visible only; no extracted layout span from README is available."
      - heading: "Placement and Decoupling"
        findings:
          - statement: "Place input and output capacitors close to the regulator pins and keep those connections short and low impedance."
            citations:
              - {span_id: "U1_DS_p22_decoupling", anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 22}
          - statement: "Keep the regulator, capacitors, and measurement/sense points compact rather than spreading them across the board."
            citations:
              - {span_id: "U1_EVAL_p6_reference_layout", anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", page_number: 6}
      - heading: "Thermal Pad and Grounding"
        findings:
          - statement: "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias to spread heat."
            citations:
              - {span_id: "U1_DS_p24_thermal", anchor: "SYNTHETIC_U1_DS_P24_THERMAL", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 24}
          - statement: "Use a continuous ground area around the compact regulator-capacitor cluster."
            citations:
              - {span_id: "U1_EVAL_p6_reference_layout", anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", page_number: 6}
        figure_refs:
          - {candidate_id: "U1_fig_ds_p24", intended_output: "figures/LT3045_datasheet_p24_fullpage.png"}
      - heading: "Reference Layout Notes"
        findings:
          - statement: "Use the DC2222A board as a topology and proximity reference for grounding and local routing density, not as a substitute for board-specific constraints."
            citations:
              - {span_id: "U1_EVAL_p6_reference_layout", anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", page_number: 6}
      - heading: "Open Questions"
        open_questions:
          - "No extracted span exists from README_layout_notes.txt in the design ZIP; decide whether later archive text extraction is worth review."
          - "No synthetic span provides explicit Kelvin-sense routing detail beyond compact sense-point placement."
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    guide_status: draftable_with_supplemental
    output_path: "Layout Guide/layout_guide.md"
    intended_sections:
      - heading: "Scope and Source Set"
        notes:
          - "Local source set contains the family datasheet; no local EVAL guide or board drawing is present."
          - "Approved supplemental app note is used for final layout readiness support."
      - heading: "Power Path and Capacitor Placement"
        findings:
          - statement: "Keep battery and input-capacitor routing short and avoid coupling the charge/sense path into noisy nodes."
            citations:
              - {span_id: "U2_DS_p17_power_path", anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", page_number: 17}
          - statement: "Place the input capacitor close, maintain a clean ground return, and keep battery-connector routing short."
            citations:
              - {span_id: "U2_SUP_p3_layout", anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3}
        figure_refs:
          - {candidate_id: "U2_fig_sup_p3", intended_output: "figures/MCP73831_layout_app_note_p3_fullpage.png"}
      - heading: "Thermal and Ground Return"
        findings:
          - statement: "Thermal performance depends on copper area and package-to-board heat spreading, so layout copper cannot be treated as incidental."
            citations:
              - {span_id: "U2_DS_p14_thermal", anchor: "SYNTHETIC_U2_DS_P14_THERMAL", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", page_number: 14}
          - statement: "Use the supplemental app note as the available board-level reference for ground-return cleanliness and connector proximity."
            citations:
              - {span_id: "U2_SUP_p3_layout", anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3}
      - heading: "Coverage Gap and Readiness"
        findings:
          - statement: "Because no local EVAL material exists, final layout readiness depends on carrying the approved supplemental app note alongside datasheet guidance."
            citations:
              - {span_id: "U2_SUP_p3_layout", anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3}
        open_questions:
          - "No fixture span gives numeric copper-area targets or board-current-specific thermal margin."
          - "No local evaluation-board comparator exists; board-specific connector placement still needs owner review."
  - component_key: usb_c_receptacle_unresolved
    refdes: J1
    guide_status: skipped_review_required
    output_path: "Layout Guide/layout_guide.md"
    intended_sections: []
    open_questions:
      - "Provide exact manufacturer part number or owner-approved source packet before any layout guide is drafted."
```

## 4. `source_map_summary`
```yaml
source_map_summary:
  mappings:
    - {component_key: "analog_devices_lt3045edd_1", refdes: "U1", item_id: "U1_F1", item_type: "finding", guide_section: "Placement and Decoupling", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 22, span_or_anchor: "U1_DS_p22_decoupling / SYNTHETIC_U1_DS_P22_DECOUPLING", method: "fixture span synthesis", output_path_relative_to_layout_guide: "layout_guide.md"}
    - {component_key: "analog_devices_lt3045edd_1", refdes: "U1", item_id: "U1_F2", item_type: "finding", guide_section: "Placement and Decoupling", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", page_number: 6, span_or_anchor: "U1_EVAL_p6_reference_layout / SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT", method: "fixture span synthesis", output_path_relative_to_layout_guide: "layout_guide.md"}
    - {component_key: "analog_devices_lt3045edd_1", refdes: "U1", item_id: "U1_F3", item_type: "finding", guide_section: "Thermal Pad and Grounding", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 24, span_or_anchor: "U1_DS_p24_thermal / SYNTHETIC_U1_DS_P24_THERMAL", method: "fixture span synthesis", output_path_relative_to_layout_guide: "layout_guide.md"}
    - {component_key: "analog_devices_lt3045edd_1", refdes: "U1", item_id: "U1_FIG1", item_type: "figure", guide_section: "Thermal Pad and Grounding", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 24, span_or_anchor: "U1_fig_ds_p24", method: "promote_if_cited_by_layout_guide", output_path_relative_to_layout_guide: "figures/LT3045_datasheet_p24_fullpage.png"}
    - {component_key: "microchip_mcp73831t_2aci_ot", refdes: "U2", item_id: "U2_F1", item_type: "finding", guide_section: "Power Path and Capacitor Placement", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", page_number: 17, span_or_anchor: "U2_DS_p17_power_path / SYNTHETIC_U2_DS_P17_POWER_PATH", method: "fixture span synthesis", output_path_relative_to_layout_guide: "layout_guide.md"}
    - {component_key: "microchip_mcp73831t_2aci_ot", refdes: "U2", item_id: "U2_F2", item_type: "finding", guide_section: "Power Path and Capacitor Placement", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3, span_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT", method: "approved supplemental span synthesis", output_path_relative_to_layout_guide: "layout_guide.md"}
    - {component_key: "microchip_mcp73831t_2aci_ot", refdes: "U2", item_id: "U2_F3", item_type: "finding", guide_section: "Thermal and Ground Return", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", page_number: 14, span_or_anchor: "U2_DS_p14_thermal / SYNTHETIC_U2_DS_P14_THERMAL", method: "fixture span synthesis", output_path_relative_to_layout_guide: "layout_guide.md"}
    - {component_key: "microchip_mcp73831t_2aci_ot", refdes: "U2", item_id: "U2_SUPDOC1", item_type: "supplemental_source", guide_section: "Coverage Gap and Readiness", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3, span_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT", method: "approved supplemental source retained for readiness", output_path_relative_to_layout_guide: "source_docs/MCP73831_layout_app_note.pdf"}
    - {component_key: "microchip_mcp73831t_2aci_ot", refdes: "U2", item_id: "U2_FIG1", item_type: "figure", guide_section: "Power Path and Capacitor Placement", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3, span_or_anchor: "U2_fig_sup_p3", method: "promote_if_cited_by_layout_guide", output_path_relative_to_layout_guide: "figures/MCP73831_layout_app_note_p3_fullpage.png"}
  cited_tables: []
```

## 5. `layout_guide_citation_map`
```yaml
layout_guide_citation_map:
  citations:
    - {dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 22, citation_anchors: ["SYNTHETIC_U1_DS_P22_DECOUPLING"], cited_by: ["U1:Placement and Decoupling"]}
    - {dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 24, citation_anchors: ["SYNTHETIC_U1_DS_P24_THERMAL", "U1_fig_ds_p24"], cited_by: ["U1:Thermal Pad and Grounding"]}
    - {dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", page_number: 6, citation_anchors: ["SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"], cited_by: ["U1:Placement and Decoupling", "U1:Thermal Pad and Grounding", "U1:Reference Layout Notes"]}
    - {dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", page_number: 14, citation_anchors: ["SYNTHETIC_U2_DS_P14_THERMAL"], cited_by: ["U2:Thermal and Ground Return"]}
    - {dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", page_number: 17, citation_anchors: ["SYNTHETIC_U2_DS_P17_POWER_PATH"], cited_by: ["U2:Power Path and Capacitor Placement"]}
    - {dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3, citation_anchors: ["SYNTHETIC_U2_SUP_P3_LAYOUT", "U2_fig_sup_p3"], cited_by: ["U2:Power Path and Capacitor Placement", "U2:Thermal and Ground Return", "U2:Coverage Gap and Readiness"]}
```

## 6. `figure_table_extraction_summary`
```yaml
figure_table_extraction_summary:
  full_page_figures_to_promote:
    - {candidate_id: "U1_fig_ds_p24", component_key: "analog_devices_lt3045edd_1", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page_number: 24, reason: "Cited by final thermal/layout guidance.", intended_output: "figures/LT3045_datasheet_p24_fullpage.png"}
    - {candidate_id: "U2_fig_sup_p3", component_key: "microchip_mcp73831t_2aci_ot", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", page_number: 3, reason: "Cited by final supplemental board-placement guidance.", intended_output: "figures/MCP73831_layout_app_note_p3_fullpage.png"}
  layout_only_tables_to_promote: []
  context_only_items:
    - {candidate_id: "U1_table_eval_p7_jumpers", component_key: "analog_devices_lt3045edd_1", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", page_number: 7, camelot_accuracy: 98.2, camelot_whitespace: 21.0, reason: "Board-setup context exists, but the table is not needed to support the final layout findings as drafted."}
  missing_tool_or_low_confidence_notes:
    - "No actual rendering or table extraction occurred; promotion decisions are synthetic packet outputs only."
    - "README_layout_notes.txt inside U1 design ZIP is manifest-visible but has no extracted span, so it remains unused."
```

## 7. `extraction_manifest`
```yaml
extraction_manifest:
  processed_docs:
    - {component_key: "analog_devices_lt3045edd_1", source_file: "DATA Sheet/LT3045_datasheet.pdf", source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "processed_from_fixture", cache_status: "new_index_required"}
    - {component_key: "analog_devices_lt3045edd_1", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", status: "processed_from_fixture", cache_status: "new_index_required"}
    - {component_key: "analog_devices_lt3045edd_1", source_file: "EVAL/DC2222A_design_files.zip", source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", status: "manifest_only", cache_status: "inspect_archive_manifest_only"}
    - {component_key: "microchip_mcp73831t_2aci_ot", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", status: "processed_from_fixture", cache_status: "existing_index_reusable"}
    - {component_key: "microchip_mcp73831t_2aci_ot", source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf", source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", status: "approved_supplemental_processed_from_fixture", download_status: "mock_saved"}
  counts:
    candidate_span_count_total: 6
    candidate_span_count_by_component: {U1: 3, U2_local: 2, U2_supplemental: 1, J1: 0}
    supplemental_docs_total: 1
    figure_candidates_total: 2
    table_candidates_total: 3
    planned_promoted_figures_total: 2
    planned_promoted_tables_total: 0
    context_only_candidates_total: 1
    rejected_candidates_total: 2
  rejected_candidates: ["U1_table_eval_p2_revision_history", "U2_table_ds_p4_ordering"]
  tool_use_status:
    network_access: not_used
    local_project_file_reads: not_used
    browser_actions: not_used
    pdf_rendering: not_claimed
    ocr: not_claimed
    camelot_execution: not_executed
    camelot_metrics_source: "fixture-provided only"
    pymupdf_execution: not_executed
    file_writes: not_claimed
  warnings:
    - "U2 has no local EVAL material; readiness relies on the approved supplemental app note in the fixture."
    - "J1 remains review_required with no source-backed identity."
    - "U1 archive README candidate exists only at manifest level and contributes no cited evidence."
  open_questions:
    - "Should U1 archive text be separately approved for future span extraction?"
    - "What board-specific copper-area target is required for U2 thermal margin?"
    - "What exact manufacturer-backed identity should replace J1 placeholder?"
```

## 8. `rejected_visual_table_candidates`
```yaml
rejected_visual_table_candidates:
  rejected:
    - {candidate_id: "U1_table_eval_p2_revision_history", component_key: "analog_devices_lt3045edd_1", source_file: "EVAL/DC2222A_user_guide.pdf", source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", page_number: 2, candidate_type: "table", camelot_accuracy: 96.0, camelot_whitespace: 18.5, reason: "Revision history is explicitly non-layout guidance."}
    - {candidate_id: "U2_table_ds_p4_ordering", component_key: "microchip_mcp73831t_2aci_ot", source_file: "DATA Sheet/MCP73831_family_datasheet.pdf", source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", page_number: 4, candidate_type: "table", camelot_accuracy: 99.1, camelot_whitespace: 12.0, reason: "Ordering-code table is explicitly non-layout guidance."}
```

## 9. `boundary_and_readiness_review`
```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict:
    status: pass
    basis:
      - "Portable binding string preserved."
      - "No runtime absolute paths included."
      - "No real downloads, browser actions, command execution, OCR, rendering, or file writes claimed."
      - "Only fixture-provided mocked files, checksums, URLs, pages, spans, and candidates used."
  ready_components:
    - {component_key: "analog_devices_lt3045edd_1", refdes: "U1", readiness: "ready_to_draft", basis: "Datasheet plus local EVAL spans cover decoupling, thermal/exposed-pad, grounding, and reference-layout proximity."}
    - {component_key: "microchip_mcp73831t_2aci_ot", refdes: "U2", readiness: "ready_to_draft_with_supplemental", basis: "Reusable datasheet cache plus approved supplemental app note cover routing, ground return, and final layout-reference needs despite no local EVAL."}
  blocked_review_components:
    - {component_key: "usb_c_receptacle_unresolved", refdes: "J1", readiness: "review_required", basis: "No manufacturer-backed identity or owner-approved source evidence; no layout guidance may be invented."}
  next_owner_actions:
    - "Proceed with Layout Guide drafting for U1 using the cited datasheet and EVAL evidence, optionally queueing future archive-span review for README_layout_notes.txt."
    - "Proceed with Layout Guide drafting for U2 and retain the approved supplemental app note under Layout Guide/source_docs for readiness support."
    - "Resolve J1 to an exact manufacturer part and source packet before any layout extraction attempt."
```

Proceed with guide generation for `U1` and `U2`; hold `J1` until source-backed identity is supplied.