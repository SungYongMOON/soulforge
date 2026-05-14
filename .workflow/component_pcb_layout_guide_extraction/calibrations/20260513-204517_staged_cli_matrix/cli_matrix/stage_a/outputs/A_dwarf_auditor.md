**profile**
```yaml
model: gpt-5.4-mini
reasoning_effort: low
species: dwarf
class: auditor
```

**parts_binding_and_inventory**
```yaml
parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
portable_only: true
component_keys:
  - analog_devices_lt3045edd_1
  - microchip_mcp73831t_2aci_ot
  - usb_c_receptacle_unresolved
source_docs:
  analog_devices_lt3045edd_1:
    - source_file: "DATA Sheet/LT3045_datasheet.pdf"
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      cache_status: "new_index_required"
    - source_file: "EVAL/DC2222A_user_guide.pdf"
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      cache_status: "new_index_required"
    - source_file: "EVAL/DC2222A_design_files.zip"
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: "inspect_archive_manifest_only"
  microchip_mcp73831t_2aci_ot:
    - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      cache_status: "existing_index_reusable"
  usb_c_receptacle_unresolved: []
review_required_components:
  - usb_c_receptacle_unresolved
cache_status_summary:
  reuse:
    - "U2 datasheet index reusable"
  new_index:
    - "U1 datasheet"
    - "U1 eval guide"
  archive_only:
    - "U1 design zip manifest"
```

**per_component_layout_guides**
```yaml
analog_devices_lt3045edd_1:
  refdes: "U1"
  identity_status: "source_backed"
  layout_guide:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      - heading: "Layout Findings"
        findings:
          - cite: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            span_id: "U1_DS_p22_decoupling"
            method: "source-backed synthesis"
            finding: "Input and output capacitors should sit close to the regulator pins with short, low-impedance traces."
            layout_implication: "Keep decoupling loops tight; minimize trace length and series inductance."
          - cite: "SYNTHETIC_U1_DS_P24_THERMAL"
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            span_id: "U1_DS_p24_thermal"
            method: "source-backed synthesis"
            finding: "Expose pad and nearby copper should tie into the ground/thermal plane with multiple vias."
            layout_implication: "Use via stitching under pad and broad thermal copper connection."
          - cite: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            source_file: "EVAL/DC2222A_user_guide.pdf"
            sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            span_id: "U1_EVAL_p6_reference_layout"
            method: "reference-layout synthesis"
            finding: "Evaluation board keeps regulator, input/output capacitors, and sense points compact around a continuous ground area."
            layout_implication: "Follow compact functional clustering and preserve an uninterrupted ground region."
      - heading: "Promoted Figures and Tables"
        items:
          - output_path: "Layout Guide/figures/U1_ds_p24.png"
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            kind: "full-page_figure_render"
            reason: "Cited thermal/exposed-pad layout page."
          - output_path: "Layout Guide/tables/U1_eval_p7_jumpers.md"
            source_file: "EVAL/DC2222A_user_guide.pdf"
            sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 7
            kind: "layout-context_table"
            reason: "Board setup table retained because it supports reference-board layout context."
      - heading: "Open Questions"
        items:
          - "Whether the final PCB stackup has an explicit continuous ground plane allocation for the thermal pad strategy."
          - "Whether the sense-point placement can match the eval board compactness without violating connector/mechanical constraints."
    source_docs:
      - source_file: "DATA Sheet/LT3045_datasheet.pdf"
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        cache_status: "new_index_required"
      - source_file: "EVAL/DC2222A_user_guide.pdf"
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        cache_status: "new_index_required"
      - source_file: "EVAL/DC2222A_design_files.zip"
        sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        cache_status: "inspect_archive_manifest_only"

microchip_mcp73831t_2aci_ot:
  refdes: "U2"
  identity_status: "source_backed"
  layout_guide:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      - heading: "Layout Findings"
        findings:
          - cite: "SYNTHETIC_U2_DS_P14_THERMAL"
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            span_id: "U2_DS_p14_thermal"
            method: "source-backed synthesis"
            finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
            layout_implication: "Allocate copper for heat spreading and avoid thermal isolation."
          - cite: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            span_id: "U2_DS_p17_power_path"
            method: "source-backed synthesis"
            finding: "Battery and input capacitor routing should be short, with sense and charge paths kept clear of noisy switching nodes."
            layout_implication: "Keep charge path compact and route away from switching noise."
          - cite: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            span_id: "U2_SUP_p3_layout"
            method: "approved-supplemental synthesis"
            finding: "App note emphasizes close input capacitor placement, clean ground return, and short battery connector routing."
            layout_implication: "Final layout readiness is supported by the approved official app note."
      - heading: "Promoted Figures and Tables"
        items:
          - output_path: "Layout Guide/figures/U2_sup_p3.png"
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            kind: "full-page_figure_render"
            reason: "Cited approved supplemental example layout drawing."
      - heading: "Open Questions"
        items:
          - "No local EVAL guide exists; final readiness depends on the approved supplemental app note."
          - "Board-specific connector and copper-area constraints still need design-owner confirmation."
    source_docs:
      - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
        sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        cache_status: "existing_index_reusable"
      - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
        sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
        official_or_owner_approved: true
        cache_status: "mock_saved"

usb_c_receptacle_unresolved:
  refdes: "J1"
  identity_status: "review_required"
  layout_guide:
    output_path: "Layout Guide/layout_guide.md"
    sections:
      - heading: "Review Required"
        findings:
          - "No manufacturer part number or owner-approved source identity is available."
          - "Do not invent datasheets, EVAL material, or layout guidance."
      - heading: "Open Questions"
        items:
          - "Await manufacturer-backed identity and source evidence."
```

**source_map_summary**
```yaml
entries:
  - output_path: "Layout Guide/layout_guide.md#u1-layout-findings"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_or_anchor: "U1_DS_p22_decoupling / SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "source-backed synthesis"
  - output_path: "Layout Guide/layout_guide.md#u1-layout-findings"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_or_anchor: "U1_DS_p24_thermal / SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "source-backed synthesis"
  - output_path: "Layout Guide/layout_guide.md#u1-layout-findings"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_or_anchor: "U1_EVAL_p6_reference_layout / SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "reference-layout synthesis"
  - output_path: "Layout Guide/tables/U1_eval_p7_jumpers.md"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_or_anchor: "U1_table_eval_p7_jumpers"
    extraction_promotion_method: "layout-context table promotion"
  - output_path: "Layout Guide/layout_guide.md#u2-layout-findings"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_or_anchor: "U2_DS_p14_thermal / SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "source-backed synthesis"
  - output_path: "Layout Guide/layout_guide.md#u2-layout-findings"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_or_anchor: "U2_DS_p17_power_path / SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "source-backed synthesis"
  - output_path: "Layout Guide/layout_guide.md#u2-layout-findings"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_or_anchor: "U2_SUP_p3_layout / SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved-supplemental synthesis"
citation_dedupe_keys:
  - "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
  - "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
  - "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
  - "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:7"
  - "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
  - "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
  - "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
```

**layout_guide_citation_map**
```yaml
cited_source_pages:
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
  - source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    citation_anchors:
      - "U1_table_eval_p7_jumpers"
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:7"
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
full_page_figures_to_render_promote:
  - candidate_id: "U1_fig_ds_p24"
    output_path: "Layout Guide/figures/U1_ds_p24.png"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    status: "promote"
    reason: "Cited by final guide; thermal and exposed-pad layout content."
  - candidate_id: "U2_fig_sup_p3"
    output_path: "Layout Guide/figures/U2_sup_p3.png"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    status: "promote"
    reason: "Approved supplemental layout figure cited by final guide."
layout_only_tables_to_promote:
  - candidate_id: "U1_table_eval_p7_jumpers"
    output_path: "Layout Guide/tables/U1_eval_p7_jumpers.md"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    status: "promote"
    reason: "Retains board setup context tied to layout guidance."
context_only_items:
  - candidate_id: "U1_table_eval_p2_revision_history"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    page_number: 2
    status: "reject"
    reason: "Revision history, not layout guidance."
  - candidate_id: "U2_table_ds_p4_ordering"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    page_number: 4
    status: "reject"
    reason: "Ordering codes, not layout guidance."
missing_tool_or_low_confidence_notes:
  - "No actual rendering or OCR claimed; promotion decisions are fixture-driven only."
  - "No crop-only or legacy context page promotion required beyond cited full-page renders."
```

**extraction_manifest**
```yaml
workflow_id: "component_pcb_layout_guide_extraction"
fixture_type: "public_safe_synthetic"
processed_docs:
  - "DATA Sheet/LT3045_datasheet.pdf"
  - "EVAL/DC2222A_user_guide.pdf"
  - "EVAL/DC2222A_design_files.zip"
  - "DATA Sheet/MCP73831_family_datasheet.pdf"
  - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
cache_hits:
  - "U2 datasheet existing_index_reusable"
cache_misses:
  - "U1 datasheet new_index_required"
  - "U1 eval guide new_index_required"
  - "U1 archive manifest only"
candidate_span_count: 5
supplemental_docs:
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    official_or_owner_approved: true
figure_count: 2
table_count: 1
rejected_candidates: 2
tool_use_status:
  network: "not used"
  local_files: "not read"
  pdf_rendering: "not claimed"
  OCR: "not claimed"
  Camelot: "not claimed"
  PyMuPDF: "not claimed"
warnings:
  - "J1 lacks manufacturer-backed identity and remains review_required."
  - "U2 has no local EVAL material; readiness depends on approved supplemental guidance."
open_questions:
  - "Can U1 thermal grounding assumptions fit the actual board stackup?"
  - "Can U2 copper area be allocated without crowding adjacent circuitry?"
```

**rejected_visual_table_candidates**
```yaml
rejected:
  - candidate_id: "U1_table_eval_p2_revision_history"
    reason: "Revision history; no layout context."
    source_file: "EVAL/DC2222A_user_guide.pdf"
    sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    rejection_category: "non-layout table"
  - candidate_id: "U2_table_ds_p4_ordering"
    reason: "Ordering codes; no board/layout guidance."
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    rejection_category: "non-layout table"
```

**boundary_and_readiness_review**
```yaml
boundary_verdict: "public-safe and source-bound"
ready_components:
  - "analog_devices_lt3045edd_1"
  - "microchip_mcp73831t_2aci_ot"
blocked_or_review_components:
  - "usb_c_receptacle_unresolved"
next_owner_actions:
  - component_key: "analog_devices_lt3045edd_1"
    action: "Write Layout Guide.md, promote cited p24 figure, and retain p7 jumper table only as setup-context support."
  - component_key: "microchip_mcp73831t_2aci_ot"
    action: "Write Layout Guide.md using datasheet plus approved supplemental app note; promote cited p3 figure."
  - component_key: "usb_c_receptacle_unresolved"
    action: "Obtain manufacturer-backed part identity and source evidence before any layout guidance."
final_readiness_note: "U1 and U2 are ready for guide synthesis; J1 must remain review_required until identity is resolved."
```

Recommendation: proceed with Markdown generation for U1 and U2 only, and leave J1 as a gated placeholder until identity evidence is supplied.