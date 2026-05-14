**profile**
```yaml
model: gpt-5.4-mini
reasoning_effort: low
species: orc
class: auditor
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
      archive_candidate_doc: "README_layout_notes.txt"
  microchip_mcp73831t_2aci_ot:
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      cache_status: "existing_index_reusable"
    - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
      official_or_owner_approved: true
      cache_status: "mock_saved"
  usb_c_receptacle_unresolved: []
review_required_components:
  - usb_c_receptacle_unresolved
cache_status:
  U1: "mixed_new_index_and_archive_inspection"
  U2: "datasheet_index_reusable_plus_approved_supplemental"
  J1: "no_source_identity"
```

**per_component_layout_guides**
```yaml
analog_devices_lt3045edd_1:
  refdes: "U1"
  identity_status: "source_backed"
  layout_guide_path: "Layout Guide/layout_guide.md"
  source_docs:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
    - "EVAL/DC2222A_design_files.zip"
  sections:
    overview:
      findings:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 22
          span_id: "U1_DS_p22_decoupling"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
          finding: "Keep input and output capacitors close to the regulator pins with short, low-impedance traces."
          layout_implication: "Place decoupling directly adjacent to U1 and keep power loops compact."
          method: "source_backed_synthesis"
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 24
          span_id: "U1_DS_p24_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          finding: "Tie the exposed pad and nearby copper into the ground/thermal plane with multiple vias."
          layout_implication: "Use a dense thermal via pattern under the exposed pad and connect to solid ground copper."
          method: "source_backed_synthesis"
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_number: 6
          span_id: "U1_EVAL_p6_reference_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
          finding: "The reference layout keeps the regulator, input/output capacitors, and sense points compact around a continuous ground area."
          layout_implication: "Mirror the compact grounding and sense-point placement from the evaluation board."
          method: "reference_layout_synthesis"
    decoupling:
      findings:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 22
          span_id: "U1_DS_p22_decoupling"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
          finding: "Decoupling must be close to the pins and routed with short traces."
          layout_implication: "Do not remote-mount input/output capacitors."
          method: "source_backed_synthesis"
    thermal_and_exposed_pad:
      findings:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_number: 24
          span_id: "U1_DS_p24_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
          finding: "Thermal performance depends on exposed pad connection and via stitching into the thermal plane."
          layout_implication: "Prioritize thermal copper continuity beneath U1."
          method: "source_backed_synthesis"
    grounding_and_reference_layout:
      findings:
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_number: 6
          span_id: "U1_EVAL_p6_reference_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
          finding: "Reference layout is compact and uses a continuous ground area for regulator, capacitors, and sense points."
          layout_implication: "Keep the ground return uninterrupted and short."
          method: "reference_layout_synthesis"
    open_questions:
      - "Confirm whether the candidate board keeps the exposed pad copper area unobstructed by nearby routing."
      - "Confirm whether sense points can be placed with the same compact geometry as the evaluation board."
microchip_mcp73831t_2aci_ot:
  refdes: "U2"
  identity_status: "source_backed"
  layout_guide_path: "Layout Guide/layout_guide.md"
  source_docs:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  sections:
    overview:
      findings:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 14
          span_id: "U2_DS_p14_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
          finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
          layout_implication: "Use adequate copper around U2 for heat spreading."
          method: "source_backed_synthesis"
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 17
          span_id: "U2_DS_p17_power_path"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          finding: "Battery and input capacitor routing should be short, with charge paths kept clear of noisy switching nodes."
          layout_implication: "Keep battery/input routing short and isolate it from noise sources."
          method: "source_backed_synthesis"
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          source_file_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          page_number: 3
          span_id: "U2_SUP_p3_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
          finding: "The approved app note emphasizes close placement of the input capacitor, a clean ground return, and short battery connector routing."
          layout_implication: "Treat this as final readiness support for U2 layout placement."
          method: "approved_supplemental_synthesis"
    decoupling_and_ground_return:
      findings:
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          page_number: 3
          span_id: "U2_SUP_p3_layout"
          bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
          finding: "Input capacitor should be close with a clean ground return."
          layout_implication: "Place the input capacitor adjacent to the charger and preserve a low-impedance ground return."
          method: "approved_supplemental_synthesis"
    thermal_and_copper_area:
      findings:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 14
          span_id: "U2_DS_p14_thermal"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
          finding: "Copper area improves heat spreading from the package."
          layout_implication: "Do not starve U2 of copper."
          method: "source_backed_synthesis"
    power_path_and_battery_routing:
      findings:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_number: 17
          span_id: "U2_DS_p17_power_path"
          bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
          finding: "Keep battery and input capacitor routing short and away from noisy switching nodes."
          layout_implication: "Route charger power paths directly and avoid coupling into switching traces."
          method: "source_backed_synthesis"
    readiness_note:
      finding: "Local EVAL material is absent, but the approved supplemental app note closes the layout-readiness gap."
      status: "ready_with_approved_supplemental_support"
      method: "gap_resolved_by_approved_supplemental"
      open_questions:
        - "Confirm final board placement still preserves short battery connector routing."
usb_c_receptacle_unresolved:
  refdes: "J1"
  identity_status: "review_required"
  layout_guide_path: "Layout Guide/layout_guide.md"
  source_docs: []
  sections:
    overview:
      findings: []
    open_questions:
      - "No manufacturer part number or owner-approved source identity is available."
      - "Do not infer datasheets, EVAL material, pinout, or layout guidance."
      - "Await identity review before any Layout Guide content is generated."
```

**source_map_summary**
```yaml
entries:
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id: "U1_DS_p22_decoupling"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_or_promotion_method: "source_backed_synthesis"
    output_path: "Layout Guide/layout_guide.md#u1-decoupling"
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id: "U1_DS_p24_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_or_promotion_method: "source_backed_synthesis"
    output_path: "Layout Guide/layout_guide.md#u1-thermal-and-exposed-pad"
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id: "U1_EVAL_p6_reference_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_or_promotion_method: "reference_layout_synthesis"
    output_path: "Layout Guide/layout_guide.md#u1-grounding-and-reference-layout"
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id: "U2_DS_p14_thermal"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_or_promotion_method: "source_backed_synthesis"
    output_path: "Layout Guide/layout_guide.md#u2-thermal-and-copper-area"
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id: "U2_DS_p17_power_path"
    bounded_excerpt_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_or_promotion_method: "source_backed_synthesis"
    output_path: "Layout Guide/layout_guide.md#u2-power-path-and-battery-routing"
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id: "U2_SUP_p3_layout"
    bounded_excerpt_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_or_promotion_method: "approved_supplemental_synthesis"
    output_path: "Layout Guide/layout_guide.md#u2-decoupling-and-ground-return"
supplemental_sources:
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
    approved: true
    page_number: 3
figures_and_tables_referenced_in_guide:
  - item_id: "U1_fig_ds_p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    kind: "figure"
    extraction_or_promotion_method: "full_page_figure_render"
    output_path: "Layout Guide/figures/U1_fig_ds_p24.png"
  - item_id: "U1_table_eval_p7_jumpers"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    anchor: "layout context only"
    kind: "table"
    extraction_or_promotion_method: "layout_only_table_promotion"
    output_path: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
  - item_id: "U2_fig_sup_p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    kind: "figure"
    extraction_or_promotion_method: "full_page_figure_render"
    output_path: "Layout Guide/figures/U2_fig_sup_p3.png"
```

**layout_guide_citation_map**
```yaml
citations:
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    citation_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#22"
  - source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    citation_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#24"
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    citation_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb#6"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    citation_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#14"
  - source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    citation_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#17"
  - source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    citation_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee#3"
unique_cited_source_file_checksum_plus_page_pairs: 6
```

**figure_table_extraction_summary**
```yaml
full_page_figures_to_render_and_promote:
  - item_id: "U1_fig_ds_p24"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    promote_to: "Layout Guide/figures/U1_fig_ds_p24.png"
    reason: "Cited in U1 thermal/exposed-pad guidance"
  - item_id: "U2_fig_sup_p3"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    promote_to: "Layout Guide/figures/U2_fig_sup_p3.png"
    reason: "Cited approved supplemental layout guide for U2"
layout_only_tables_to_promote:
  - item_id: "U1_table_eval_p7_jumpers"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    promote_to: "Layout Guide/tables/U1_table_eval_p7_jumpers.md"
    reason: "Board setup context retained; layout-adjacent jumper/load connector table"
context_only_items:
  - item_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    disposition: "reject"
    reason: "Revision history, not board layout guidance"
  - item_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    disposition: "reject"
    reason: "Ordering codes, not layout guidance"
missing_tool_or_low_confidence_notes:
  - "No actual rendering or OCR was performed; promotion decisions are based only on synthetic spans and candidate metadata."
  - "U2 local EVAL material is absent, so final readiness depends on the approved supplemental app note."
```

**extraction_manifest**
```yaml
processed_docs:
  - "DATA Sheet/LT3045_datasheet.pdf"
  - "EVAL/DC2222A_user_guide.pdf"
  - "EVAL/DC2222A_design_files.zip"
  - "DATA Sheet/MCP73831_family_datasheet.pdf"
  - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
cache_hits:
  - "U2 datasheet index reusable"
cache_misses:
  - "U1 datasheet new index required"
  - "U1 eval guide new index required"
  - "U1 design archive manifest inspection only"
candidate_span_count: 6
supplemental_docs:
  - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
figure_count:
  full_page_promoted: 2
  context_only: 0
table_count:
  layout_promoted: 1
  rejected: 2
rejected_candidates: 2
tool_use_status:
  network: "not used"
  local_files: "not read"
  pdf_rendering: "not performed"
  ocr: "not performed"
  camelot: "not performed"
  file_writes: "not performed"
warnings:
  - "J1 remains unresolved and must not receive invented layout guidance."
  - "Only synthetic excerpts and approved supplemental spans were used."
open_questions:
  - "Confirm U1 final placement preserves short decoupling loops and thermal via access."
  - "Confirm U2 final board routing still respects the clean ground return and short battery connector path."
  - "Obtain manufacturer-backed identity for J1 before any layout guide entry is drafted."
```

**rejected_visual_table_candidates**
```yaml
rejected:
  - candidate_id: "U1_table_eval_p2_revision_history"
    candidate_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    reason: "Revision history is not board/layout guidance."
  - candidate_id: "U2_table_ds_p4_ordering"
    candidate_type: "table"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    reason: "Ordering codes are not layout guidance."
not_rejected_but_not_promoted_yet:
  - candidate_id: "U1_fig_ds_p24"
    reason: "Promoted because cited by final layout guide."
  - candidate_id: "U2_fig_sup_p3"
    reason: "Promoted because cited by final layout guide and approved supplemental source."
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
    owner_action: "Write Layout Guide entries for decoupling, thermal/exposed-pad, and grounding/reference-layout notes; promote only cited unique figure/table assets."
  - component_key: "microchip_mcp73831t_2aci_ot"
    owner_action: "Write Layout Guide entries using datasheet plus approved supplemental app note; mark final readiness as supported by official supplemental guidance."
  - component_key: "usb_c_receptacle_unresolved"
    owner_action: "Perform identity review and obtain manufacturer-backed source before any layout guidance is created."
final_readiness_note: "U1 and U2 are ready for guide generation; J1 stays review_required and should be held out of synthesis until identity is established."
```

Closing recommendation: generate the Markdown packet from the above YAML blocks, then promote only the two cited full-page figures and the single layout-context table.