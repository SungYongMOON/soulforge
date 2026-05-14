```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: administrator
```

```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  runtime_absolute_paths_forbidden: true
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
    usb_c_receptacle_unresolved: []
  review_required_components:
    - usb_c_receptacle_unresolved
  cache_status_summary:
    U1: "mixed: new_index_required + archive_manifest_only"
    U2: "existing_index_reusable + mock_saved"
    J1: "no source material"
```

```yaml
per_component_layout_guides:
  analog_devices_lt3045edd_1:
    refdes: U1
    identity_status: source_backed
    layout_guide:
      layout_guide_md_sections:
        - section: "Overview"
          findings:
            - citation_id: "U1_DS_p22_decoupling"
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
              extraction_method: "source-bound synthesis"
              promoted_path: "Layout Guide/figures/context_pages/U1_DS_p22_decoupling_p22.png"
              finding: "Place input and output capacitors close to the regulator pins using short, low-impedance traces."
            - citation_id: "U1_EVAL_p6_reference_layout"
              source_file: "EVAL/DC2222A_user_guide.pdf"
              source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              page_number: 6
              span_id: "U1_EVAL_p6_reference_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
              extraction_method: "reference-layout promotion"
              promoted_path: "Layout Guide/figures/U1_EVAL_p6_reference_layout_p6.png"
              finding: "Reference layout keeps regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
        - section: "Decoupling and Power Routing"
          findings:
            - citation_id: "U1_DS_p22_decoupling"
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 22
              span_id: "U1_DS_p22_decoupling"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
              extraction_method: "layout guidance synthesis"
              promoted_path: "Layout Guide/figures/context_pages/U1_DS_p22_decoupling_p22.png"
              finding: "Input and output capacitors should be kept close to the regulator pins; traces should remain short and low impedance."
        - section: "Thermal, Exposed Pad, and Grounding"
          findings:
            - citation_id: "U1_DS_p24_thermal"
              source_file: "DATA Sheet/LT3045_datasheet.pdf"
              source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              page_number: 24
              span_id: "U1_DS_p24_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
              extraction_method: "thermal-layout synthesis"
              promoted_path: "Layout Guide/figures/U1_DS_p24_thermal_p24.png"
              finding: "The exposed pad and nearby copper should tie into the ground/thermal plane with multiple vias for heat spreading."
        - section: "Open Questions"
          findings:
            - question: "Confirm whether the board stack-up or copper thickness imposes additional thermal via density requirements."
              status: "open"
            - question: "Verify whether the final placement reserves enough area for the continuous ground region implied by the reference layout."
              status: "open"
      source_docs_used:
        - "DATA Sheet/LT3045_datasheet.pdf"
        - "EVAL/DC2222A_user_guide.pdf"
        - "EVAL/DC2222A_design_files.zip"
      review_status: "ready"
      notes:
        - "Use only the cited spans; no extra datasheet pages are inferred."
        - "Archive is manifest-only; README_layout_notes.txt is candidate-doc only, not promoted here."
  microchip_mcp73831t_2aci_ot:
    refdes: U2
    identity_status: source_backed
    layout_guide:
      layout_guide_md_sections:
        - section: "Overview"
          findings:
            - citation_id: "U2_DS_p17_power_path"
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 17
              span_id: "U2_DS_p17_power_path"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
              extraction_method: "datasheet synthesis"
              promoted_path: "Layout Guide/figures/context_pages/U2_DS_p17_power_path_p17.png"
              finding: "Battery and input capacitor routing should be short, with sense and charge paths kept clear of noisy switching nodes."
            - citation_id: "U2_SUP_p3_layout"
              source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
              source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
              page_number: 3
              span_id: "U2_SUP_p3_layout"
              bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
              extraction_method: "approved supplemental guidance promotion"
              promoted_path: "Layout Guide/figures/U2_SUP_p3_layout_p3.png"
              finding: "Use close placement of the input capacitor, a clean ground return, and short battery connector routing."
        - section: "Thermal and Ground Return"
          findings:
            - citation_id: "U2_DS_p14_thermal"
              source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
              source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
              page_number: 14
              span_id: "U2_DS_p14_thermal"
              bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
              extraction_method: "thermal-layout synthesis"
              promoted_path: "Layout Guide/figures/context_pages/U2_DS_p14_thermal_p14.png"
              finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
        - section: "Final Readiness"
          findings:
            - conclusion: "Layout-ready with datasheet-backed routing guidance plus approved supplemental app-note guidance."
              status: "ready"
        - section: "Open Questions"
          findings:
            - question: "No local EVAL guide is present; confirm whether any owner-approved board drawing exists before final signoff."
              status: "not_blocking"
      source_docs_used:
        - "DATA Sheet/MCP73831_family_datasheet.pdf"
        - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      review_status: "ready"
      notes:
        - "Local EVAL material status is none_found."
        - "Approved supplemental source is included because it is owner-approved and source-backed by the fixture."
  usb_c_receptacle_unresolved:
    refdes: J1
    identity_status: review_required
    layout_guide:
      layout_guide_md_sections:
        - section: "Identity Review"
          findings: []
        - section: "Open Questions"
          findings:
            - question: "Manufacturer part number missing; identity cannot be resolved from provided fixture."
              status: "blocked"
            - question: "No source docs or layout spans are available."
              status: "blocked"
      source_docs_used: []
      review_status: "review_required"
      notes:
        - "Do not invent datasheets, EVAL material, or layout guidance."
```

```yaml
source_map_summary:
  - output_path: "Layout Guide/figures/context_pages/U1_DS_p22_decoupling_p22.png"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    extraction_promotion_method: "source-bound synthesis"
    cited_by:
      - "U1 Overview"
      - "U1 Decoupling and Power Routing"
  - output_path: "Layout Guide/figures/U1_EVAL_p6_reference_layout_p6.png"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    extraction_promotion_method: "reference-layout promotion"
    cited_by:
      - "U1 Overview"
  - output_path: "Layout Guide/figures/U1_DS_p24_thermal_p24.png"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    extraction_promotion_method: "thermal-layout synthesis"
    cited_by:
      - "U1 Thermal, Exposed Pad, and Grounding"
  - output_path: "Layout Guide/figures/context_pages/U2_DS_p14_thermal_p14.png"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    extraction_promotion_method: "thermal-layout synthesis"
    cited_by:
      - "U2 Thermal and Ground Return"
  - output_path: "Layout Guide/figures/context_pages/U2_DS_p17_power_path_p17.png"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    extraction_promotion_method: "datasheet synthesis"
    cited_by:
      - "U2 Overview"
  - output_path: "Layout Guide/figures/U2_SUP_p3_layout_p3.png"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    extraction_promotion_method: "approved supplemental guidance promotion"
    cited_by:
      - "U2 Overview"
  - output_path: "Layout Guide/figures/context_pages/U1_DS_p24_thermal_p24.png"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    extraction_promotion_method: "thermal-layout synthesis"
    cited_by:
      - "U1 Thermal, Exposed Pad, and Grounding"
  citation_dedupe_keys:
    - "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#22"
    - "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#24"
    - "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb#6"
    - "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#14"
    - "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#17"
    - "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee#3"
```

```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - candidate_id: "U1_fig_ds_p24"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      promotion_result: "promote"
      output_path: "Layout Guide/figures/U1_DS_p24_thermal_p24.png"
      reason: "Cited by final layout guide; thermal pad drawing is layout-relevant."
    - candidate_id: "U2_fig_sup_p3"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      promotion_result: "promote"
      output_path: "Layout Guide/figures/U2_SUP_p3_layout_p3.png"
      reason: "Approved supplemental source, explicitly cited, and layout-placement relevant."
    - candidate_id: "U1_EVAL_p6_reference_layout"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 6
      promotion_result: "promote"
      output_path: "Layout Guide/figures/U1_EVAL_p6_reference_layout_p6.png"
      reason: "Reference-layout evidence cited by U1 guide."
  layout_only_tables_to_promote:
    - candidate_id: "U1_table_eval_p7_jumpers"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
      promotion_result: "promote"
      output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
      reason: "Board setup context retained; layout-adjacent jumper/load connector table."
  context_only_items:
    - candidate_id: "U1_DS_p22_decoupling"
      output_path: "Layout Guide/figures/context_pages/U1_DS_p22_decoupling_p22.png"
      reason: "Useful contextual evidence, but not a standalone full-page render promotion target."
    - candidate_id: "U2_DS_p14_thermal"
      output_path: "Layout Guide/figures/context_pages/U2_DS_p14_thermal_p14.png"
      reason: "Context-only thermal evidence."
    - candidate_id: "U2_DS_p17_power_path"
      output_path: "Layout Guide/figures/context_pages/U2_DS_p17_power_path_p17.png"
      reason: "Context-only routing evidence."
  missing_tool_or_low_confidence_notes:
    - note: "No actual rendering/OCR/Camelot execution is claimed; candidate decisions are fixture-bound only."
    - note: "U2 local EVAL status is none_found; supplemental app note closes the gap."
```

```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  calibration_id: "20260513-204517_staged_cli_matrix"
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
  figure_count:
    promoted: 3
    context_only: 3
  table_count:
    promoted: 1
    rejected: 2
  rejected_candidates:
    - "U1_table_eval_p2_revision_history"
    - "U2_table_ds_p4_ordering"
  tool_use_status:
    network: "not_used"
    local_file_reads: "not_used"
    pdf_rendering: "not_claimed"
    ocr: "not_claimed"
    camelot: "not_claimed"
    pyMuPDF: "not_claimed"
    writes: "not_claimed"
  warnings:
    - "Fixture-only synthesis; do not generalize beyond cited spans."
    - "J1 remains unresolved and must not receive invented layout guidance."
  open_questions:
    - "Confirm any owner-approved identity for J1 before attempting a layout guide."
    - "For U1, verify whether the archive README should be promoted if later surfaced as a cited layout note."
    - "For U2, confirm whether any local EVAL material appears later, though current fixture says none_found."
```

```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    candidate_type: "table"
    rejection_reason: "Revision history is not board layout guidance."
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    candidate_type: "table"
    rejection_reason: "Ordering codes are not layout guidance."
```

```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass"
  boundary_notes:
    - "Only synthetic fixture data used."
    - "No runtime absolute paths, credentials, or non-public project artifacts included."
  ready_components:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
  blocked_or_review_components:
    - "usb_c_receptacle_unresolved"
  next_owner_actions:
    - "Generate Layout Guide markdown and promoted figure/table files for U1 and U2 from cited spans only."
    - "Keep J1 in review_required until manufacturer-backed identity evidence is provided."
    - "Do not promote any uncited figure or table."
```

Recommended next step: write the component `Layout Guide/` markdown and manifest files directly from this packet, leaving `J1` untouched until identity evidence exists.