**profile**
```yaml
model: gpt-5.4-mini
reasoning_effort: medium
species: elf
class: archivist
```

**parts_binding_and_inventory**
```yaml
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
      cache_status: "mock_saved"
      official_or_owner_approved: true
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
  usb_c_receptacle_unresolved: []
review_required_components:
  - usb_c_receptacle_unresolved
cache_status_summary:
  reuse:
    - "MCP73831 family datasheet index reusable"
  new_index_required:
    - "LT3045 datasheet"
    - "DC2222A user guide"
  inspect_archive_manifest_only:
    - "DC2222A design files zip"
```

**per_component_layout_guides**
```yaml
analog_devices_lt3045edd_1:
  refdes: "U1"
  status: "source_backed"
  layout_guide:
    path: "Layout Guide/layout_guide.md"
    findings:
      - id: "U1-F1"
        topic: "decoupling_and_power_routing"
        finding: "Input and output capacitors should be placed close to the regulator pins with short, low-impedance traces."
        source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        page_number: 22
        span_id: "U1_DS_p22_decoupling"
        bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
        method: "source-backed synthesis"
        output_path: "Layout Guide/layout_guide.md"
      - id: "U1-F2"
        topic: "thermal_exposed_pad_grounding"
        finding: "The exposed pad and nearby copper should be tied into the ground and thermal plane with multiple vias for heat spreading."
        source_file: "DATA Sheet/LT3045_datasheet.pdf"
        source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        page_number: 24
        span_id: "U1_DS_p24_thermal"
        bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
        method: "source-backed synthesis"
        output_path: "Layout Guide/layout_guide.md"
      - id: "U1-F3"
        topic: "reference_layout_grounding"
        finding: "The evaluation board layout keeps the regulator, input/output capacitors, and measurement sense points compact around a continuous ground area."
        source_file: "EVAL/DC2222A_user_guide.pdf"
        source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        page_number: 6
        span_id: "U1_EVAL_p6_reference_layout"
        bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
        method: "reference-layout synthesis"
        output_path: "Layout Guide/layout_guide.md"
    open_questions:
      - "Whether the archive README_layout_notes.txt adds any board-specific placement constraints after manifest inspection."
  source_docs:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
  promoted_assets:
    figures:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        page_number: 24
        candidate_id: "U1_fig_ds_p24"
        output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
        promotion_basis: "cited by thermal/exposed-pad finding"
    tables:
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        page_number: 7
        candidate_id: "U1_table_eval_p7_jumpers"
        output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
        promotion_basis: "layout-only, board setup context retained"
  non_promoted:
    - candidate_id: "U1_table_eval_p2_revision_history"
      reason: "revision history, not board layout guidance"

microchip_mcp73831t_2aci_ot:
  refdes: "U2"
  status: "source_backed"
  layout_guide:
    path: "Layout Guide/layout_guide.md"
    findings:
      - id: "U2-F1"
        topic: "thermal_ground_plane"
        finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
        source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
        source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        page_number: 14
        span_id: "U2_DS_p14_thermal"
        bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
        method: "source-backed synthesis"
        output_path: "Layout Guide/layout_guide.md"
      - id: "U2-F2"
        topic: "power_path_decoupling"
        finding: "Battery and input capacitor routing should be short, with the sense and charge paths kept clear of noisy switching nodes."
        source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
        source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        page_number: 17
        span_id: "U2_DS_p17_power_path"
        bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
        method: "source-backed synthesis"
        output_path: "Layout Guide/layout_guide.md"
      - id: "U2-F3"
        topic: "final_layout_readiness"
        finding: "Approved supplemental app note confirms close input-capacitor placement, clean ground return, and short battery connector routing for layout readiness."
        source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        page_number: 3
        span_id: "U2_SUP_p3_layout"
        bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
        method: "approved supplemental guidance synthesis"
        output_path: "Layout Guide/layout_guide.md"
    open_questions:
      - "No local EVAL guide exists; no additional board-specific constraints are available in the fixture."
  source_docs:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  promoted_assets:
    figures:
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        page_number: 3
        candidate_id: "U2_fig_sup_p3"
        output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
        promotion_basis: "cited by approved supplemental layout finding"
    tables: []
  non_promoted:
    - candidate_id: "U2_table_ds_p4_ordering"
      reason: "ordering codes, not layout guidance"

usb_c_receptacle_unresolved:
  refdes: "J1"
  status: "review_required"
  layout_guide: null
  findings: []
  open_questions:
    - "Manufacturer part number is missing."
    - "Owner-approved source identity is missing."
    - "Do not invent datasheets, EVAL material, or layout guidance."
```

**source_map_summary**
```yaml
entries:
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "source-backed synthesis"
    output_path_relative_to_component_layout_guide: "Layout Guide/layout_guide.md"
    cited_finding_ids:
      - "U1-F1"
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "source-backed synthesis"
    output_path_relative_to_component_layout_guide: "Layout Guide/layout_guide.md"
    cited_finding_ids:
      - "U1-F2"
    promoted_figure_candidate_id: "U1_fig_ds_p24"
    promoted_figure_output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "reference-layout synthesis"
    output_path_relative_to_component_layout_guide: "Layout Guide/layout_guide.md"
    cited_finding_ids:
      - "U1-F3"
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_id: null
    bounded_excerpt_anchor: null
    extraction_promotion_method: "table promotion"
    output_path_relative_to_component_layout_guide: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    promoted_table_candidate_id: "U1_table_eval_p7_jumpers"
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "source-backed synthesis"
    output_path_relative_to_component_layout_guide: "Layout Guide/layout_guide.md"
    cited_finding_ids:
      - "U2-F1"
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "source-backed synthesis"
    output_path_relative_to_component_layout_guide: "Layout Guide/layout_guide.md"
    cited_finding_ids:
      - "U2-F2"
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved supplemental guidance synthesis"
    output_path_relative_to_component_layout_guide: "Layout Guide/layout_guide.md"
    cited_finding_ids:
      - "U2-F3"
    promoted_figure_candidate_id: "U2_fig_sup_p3"
    promoted_figure_output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
dedupe_notes:
  - "Each cited finding is keyed by unique source-file checksum plus page pair."
  - "U1 page 24 is the only figure-promotion page cited by the guide for LT3045."
  - "U2 page 3 from the approved supplemental app note is the only figure-promotion page cited by the guide for MCP73831."
```

**layout_guide_citation_map**
```yaml
citation_pairs:
  - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p22"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    page_number: 22
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
    used_by:
      - "U1-F1"
  - dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    page_number: 24
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
    used_by:
      - "U1-F2"
    promoted_asset:
      - "Layout Guide/figures/U1_fig_ds_p24.png"
  - dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:p6"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    page_number: 6
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    used_by:
      - "U1-F3"
  - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p14"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    page_number: 14
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
    used_by:
      - "U2-F1"
  - dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:p17"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    page_number: 17
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
    used_by:
      - "U2-F2"
  - dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    page_number: 3
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
    used_by:
      - "U2-F3"
    promoted_asset:
      - "Layout Guide/figures/U2_fig_sup_p3.png"
```

**figure_table_extraction_summary**
```yaml
full_page_figures_to_render_and_promote:
  - candidate_id: "U1_fig_ds_p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
    reason: "cited thermal/exposed-pad layout figure"
  - candidate_id: "U2_fig_sup_p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
    reason: "cited approved supplemental placement drawing"
layout_only_tables_to_promote:
  - candidate_id: "U1_table_eval_p7_jumpers"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    reason: "board setup context retained"
context_only_items:
  - item: "EVAL/DC2222A_design_files.zip::README_layout_notes.txt"
    source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    status: "inspect_archive_manifest_only"
    note: "may inform layout notes, but no direct candidate span is provided"
missing_tool_or_low_confidence_notes:
  - "No actual OCR, Camelot, or PDF rendering was performed; all outputs are synthetic and source-bound to fixture spans."
  - "No low-confidence extraction was required for U1 or U2 candidate spans."
```

**extraction_manifest**
```yaml
workflow_id: "component_pcb_layout_guide_extraction"
calibration_id: "20260513-204517_staged_cli_matrix"
processed_docs:
  - "DATA Sheet/LT3045_datasheet.pdf"
  - "EVAL/DC2222A_user_guide.pdf"
  - "EVAL/DC2222A_design_files.zip"
  - "DATA Sheet/MCP73831_family_datasheet.pdf"
  - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
cache_hits:
  - "MCP73831_family_datasheet.pdf"
cache_misses:
  - "LT3045_datasheet.pdf"
  - "DC2222A_user_guide.pdf"
  - "DC2222A_design_files.zip manifest only"
candidate_span_count: 6
supplemental_docs:
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    approved: true
figure_count:
  promoted: 2
  rejected: 0
table_count:
  promoted: 1
  rejected: 2
rejected_candidates:
  - "U1_table_eval_p2_revision_history"
  - "U2_table_ds_p4_ordering"
tool_use_status:
  network: "not_used"
  downloads: "not_claimed"
  pdf_rendering: "not_claimed"
  ocr: "not_claimed"
  camelot: "not_claimed"
  pymupdf: "not_claimed"
  file_writes: "not_claimed"
warnings:
  - "J1 remains unresolved and must not be synthesized."
  - "Use only the fixture-provided checksums, spans, and anchors."
open_questions:
  - "Whether archive README_layout_notes.txt adds extra board-layout constraints after manifest-only inspection."
  - "Whether additional owner-approved identity material will be supplied for J1."
```

**rejected_visual_table_candidates**
```yaml
rejected:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    candidate_type: "table"
    reason: "revision history, not board layout guidance"
    disposition: "reject"
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    candidate_type: "table"
    reason: "ordering codes, not layout guidance"
    disposition: "reject"
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
  - component: "analog_devices_lt3045edd_1"
    action: "Write Layout Guide/layout_guide.md from the cited U1 spans and promote the cited U1 figure/table assets."
  - component: "microchip_mcp73831t_2aci_ot"
    action: "Write Layout Guide/layout_guide.md from the cited U2 spans, include the approved supplemental app note, and promote the cited U2 figure."
  - component: "usb_c_receptacle_unresolved"
    action: "Obtain manufacturer-backed identity and source evidence before drafting any layout guidance."
readiness_note: "U1 and U2 are ready for guide generation from source-backed spans; J1 must remain review_required with no invented guidance."
```

Recommendation: generate U1 and U2 guides from the cited spans only, and hold J1 until owner-approved identity evidence exists.