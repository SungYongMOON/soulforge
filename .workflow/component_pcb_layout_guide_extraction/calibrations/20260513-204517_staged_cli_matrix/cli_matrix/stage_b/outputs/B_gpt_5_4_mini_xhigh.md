### profile
```yaml
profile:
  model: "gpt-5.4-mini"
  reasoning_effort: "xhigh"
  species: "elf"
  class: "archivist"
```

### parts_binding_and_inventory
```yaml
parts_binding_and_inventory:
  portable_parts_root: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts"
  portable_only: true
  runtime_absolute_paths_forbidden: true
  component_keys:
    - "analog_devices_lt3045edd_1"
    - "microchip_mcp73831t_2aci_ot"
    - "usb_c_receptacle_unresolved"
  source_inventory:
    analog_devices_lt3045edd_1:
      refdes: "U1"
      source_docs:
        - source_file: "DATA Sheet/LT3045_datasheet.pdf"
          source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          page_count: 44
          cache_status: "new_index_required"
        - source_file: "EVAL/DC2222A_user_guide.pdf"
          source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          page_count: 12
          cache_status: "new_index_required"
        - source_file: "EVAL/DC2222A_design_files.zip"
          source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          cache_status: "inspect_archive_manifest_only"
          archive_candidate_docs:
            - "README_layout_notes.txt"
    microchip_mcp73831t_2aci_ot:
      refdes: "U2"
      source_docs:
        - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
          source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          page_count: 32
          cache_status: "existing_index_reusable"
        - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
          source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
          page_count: 8
          approval_status: "official_or_owner_approved"
          cache_status: "mock_saved"
    usb_c_receptacle_unresolved:
      refdes: "J1"
      source_docs: []
      cache_status: "none"
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
  review_required_components:
    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      reason: "No manufacturer-backed identity or source evidence."
```

### per_component_layout_guides
```yaml
per_component_layout_guides:
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    identity_status: "source_backed"
    layout_guide_path: "Layout Guide/layout_guide.md"
    status: "ready_for_write"
    source_notes:
      datasheet_cache: "new_index_required"
      eval_guide_cache: "new_index_required"
      archive_manifest_status: "inspect_archive_manifest_only"
    sections:
      - heading: "Placement and Decoupling"
        source_bound_findings:
          - citation_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 22
            finding: "Keep input and output capacitors close to the regulator pins with short, low-impedance routing."
            layout_topics:
              - "decoupling"
              - "bypass capacitor placement"
              - "power routing"
      - heading: "Thermal / Exposed Pad / Ground"
        source_bound_findings:
          - citation_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            finding: "Tie the exposed pad and nearby copper into the thermal and ground plane with multiple vias."
            layout_topics:
              - "thermal"
              - "exposed pad"
              - "vias"
              - "ground plane"
      - heading: "Reference Layout"
        source_bound_findings:
          - citation_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
            source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 6
            finding: "The evaluation-board layout keeps the regulator, capacitors, and sense points compact around a continuous ground area."
            layout_topics:
              - "evaluation board layout"
              - "grounding"
              - "reference layout"
      - heading: "Promoted Assets"
        promoted_assets:
          - asset_anchor: "U1_fig_ds_p24"
            source_file: "DATA Sheet/LT3045_datasheet.pdf"
            source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            page_number: 24
            output_path: "figures/U1_fig_ds_p24.png"
            promotion: "full_page_render"
            layout_context: "recommended layout and thermal pad drawing"
          - asset_anchor: "U1_table_eval_p7_jumpers"
            source_file: "EVAL/DC2222A_user_guide.pdf"
            source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            page_number: 7
            output_path: "tables/U1_table_eval_p7_jumpers.md"
            promotion: "layout_table"
            layout_context: "jumper and load-connector table tied to reference board setup"
      - heading: "Open Questions"
        open_questions:
          - "Are there board-specific keepouts or alternate sense-point rules outside the supplied reference-layout evidence?"
  - component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    identity_status: "source_backed"
    layout_guide_path: "Layout Guide/layout_guide.md"
    status: "ready_for_write"
    source_notes:
      datasheet_cache: "existing_index_reusable"
      local_eval_material_status: "none_found"
      supplemental_source_status: "official_or_owner_approved"
    sections:
      - heading: "Placement and Routing"
        source_bound_findings:
          - citation_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 17
            finding: "Keep battery and input capacitor routing short, and keep sense and charge paths clear of noisy switching nodes."
            layout_topics:
              - "battery trace"
              - "power routing"
              - "decoupling"
      - heading: "Thermal / Copper Area"
        source_bound_findings:
          - citation_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
            source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
            source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            page_number: 14
            finding: "Thermal behavior depends on copper area and package-to-board heat spreading."
            layout_topics:
              - "thermal"
              - "ground plane"
      - heading: "Supplemental Readiness"
        source_bound_findings:
          - citation_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
            page_number: 3
            finding: "The approved app note favors a close input capacitor, a clean ground return, and short battery-connector routing."
            layout_topics:
              - "decoupling"
              - "ground return"
              - "battery connector placement"
      - heading: "Promoted Assets"
        promoted_assets:
          - asset_anchor: "U2_fig_sup_p3"
            source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
            source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            page_number: 3
            output_path: "figures/U2_fig_sup_p3.png"
            promotion: "full_page_render"
            layout_context: "example charger board placement drawing"
      - heading: "Open Questions"
        open_questions:
          - "Is there any additional owner-approved board reference beyond the approved supplemental app note?"
  - component_key: "usb_c_receptacle_unresolved"
    refdes: "J1"
    identity_status: "review_required"
    layout_guide_path: "Layout Guide/layout_guide.md"
    status: "review_required"
    source_notes:
      review_reason: "Connector placeholder has no manufacturer part number or owner-approved source identity."
    sections:
      - heading: "Review Required"
        source_bound_findings: []
        status_note: "No layout guidance is authored for this placeholder."
    open_questions:
      - "What manufacturer-backed part number or owner-approved source identity defines this USB-C receptacle?"
```

### source_map_summary
```yaml
source_map_summary:
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    entry_type: "finding"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    span_id_or_anchor: "SYNTHETIC_U1_DS_P22_DECOUPLING"
    extraction_promotion_method: "citation-backed synthesis"
    output_path: "layout_guide.md#placement-and-decoupling"
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    entry_type: "finding"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
    extraction_promotion_method: "citation-backed synthesis"
    output_path: "layout_guide.md#thermal-exposed-pad-ground"
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    entry_type: "finding"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    span_id_or_anchor: "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    extraction_promotion_method: "citation-backed synthesis"
    output_path: "layout_guide.md#reference-layout"
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    entry_type: "figure"
    source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    span_id_or_anchor: "U1_fig_ds_p24"
    extraction_promotion_method: "full-page render promotion"
    output_path: "figures/U1_fig_ds_p24.png"
    layout_context: "recommended layout and thermal pad drawing"
  - component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    entry_type: "table"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    span_id_or_anchor: "U1_table_eval_p7_jumpers"
    extraction_promotion_method: "layout-context table promotion"
    output_path: "tables/U1_table_eval_p7_jumpers.md"
    layout_context: "jumper and load-connector table tied to reference board setup"
    quality_metrics:
      camelot_accuracy: 98.2
      camelot_whitespace: 21.0
  - component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    entry_type: "finding"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    span_id_or_anchor: "SYNTHETIC_U2_DS_P17_POWER_PATH"
    extraction_promotion_method: "citation-backed synthesis"
    output_path: "layout_guide.md#placement-and-routing"
  - component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    entry_type: "finding"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    span_id_or_anchor: "SYNTHETIC_U2_DS_P14_THERMAL"
    extraction_promotion_method: "citation-backed synthesis"
    output_path: "layout_guide.md#thermal-copper-area"
  - component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    entry_type: "supplemental_source"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    source_url: "https://vendor.example.invalid/microchip/mock/MCP73831_layout_app_note.pdf"
    page_number: 3
    span_id_or_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
    extraction_promotion_method: "approved supplemental citation"
    output_path: "layout_guide.md#supplemental-readiness"
  - component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    entry_type: "figure"
    source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    span_id_or_anchor: "U2_fig_sup_p3"
    extraction_promotion_method: "full-page render promotion"
    output_path: "figures/U2_fig_sup_p3.png"
    layout_context: "example charger board placement drawing"
```

### layout_guide_citation_map
```yaml
layout_guide_citation_map:
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 22
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:22"
    component_keys:
      - "analog_devices_lt3045edd_1"
    citation_anchors:
      - "SYNTHETIC_U1_DS_P22_DECOUPLING"
    used_in_sections:
      - "placement-and-decoupling"
    linked_assets: []
  - source_file: "DATA Sheet/LT3045_datasheet.pdf"
    source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    page_number: 24
    dedupe_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:24"
    component_keys:
      - "analog_devices_lt3045edd_1"
    citation_anchors:
      - "SYNTHETIC_U1_DS_P24_THERMAL"
    used_in_sections:
      - "thermal-exposed-pad-ground"
      - "promoted-assets"
    linked_assets:
      - "figures/U1_fig_ds_p24.png"
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 6
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:6"
    component_keys:
      - "analog_devices_lt3045edd_1"
    citation_anchors:
      - "SYNTHETIC_U1_EVAL_P6_REFERENCE_LAYOUT"
    used_in_sections:
      - "reference-layout"
    linked_assets: []
  - source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 7
    dedupe_key: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:7"
    component_keys:
      - "analog_devices_lt3045edd_1"
    citation_anchors:
      - "U1_table_eval_p7_jumpers"
    used_in_sections:
      - "promoted-assets"
    linked_assets:
      - "tables/U1_table_eval_p7_jumpers.md"
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 17
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:17"
    component_keys:
      - "microchip_mcp73831t_2aci_ot"
    citation_anchors:
      - "SYNTHETIC_U2_DS_P17_POWER_PATH"
    used_in_sections:
      - "placement-and-routing"
    linked_assets: []
  - source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 14
    dedupe_key: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:14"
    component_keys:
      - "microchip_mcp73831t_2aci_ot"
    citation_anchors:
      - "SYNTHETIC_U2_DS_P14_THERMAL"
    used_in_sections:
      - "thermal-copper-area"
    linked_assets: []
  - source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
    source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    page_number: 3
    dedupe_key: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:3"
    component_keys:
      - "microchip_mcp73831t_2aci_ot"
    citation_anchors:
      - "SYNTHETIC_U2_SUP_P3_LAYOUT"
    used_in_sections:
      - "supplemental-readiness"
      - "promoted-assets"
    linked_assets:
      - "figures/U2_fig_sup_p3.png"
```

### figure_table_extraction_summary
```yaml
figure_table_extraction_summary:
  full_page_figures_to_render_and_promote:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_number: 24
      citation_anchor: "SYNTHETIC_U1_DS_P24_THERMAL"
      output_path: "figures/U1_fig_ds_p24.png"
      layout_context: "recommended layout and thermal pad drawing"
    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_number: 3
      citation_anchor: "SYNTHETIC_U2_SUP_P3_LAYOUT"
      output_path: "figures/U2_fig_sup_p3.png"
      layout_context: "example charger board placement drawing"
  layout_only_tables_to_promote:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_number: 7
      citation_anchor: "U1_table_eval_p7_jumpers"
      output_path: "tables/U1_table_eval_p7_jumpers.md"
      layout_context: "jumper and load-connector table tied to reference board setup"
      quality_metrics:
        camelot_accuracy: 98.2
        camelot_whitespace: 21.0
  context_only_items:
    - component_key: "analog_devices_lt3045edd_1"
      source_file: "EVAL/DC2222A_design_files.zip"
      archive_entry: "README_layout_notes.txt"
      status: "context_only_manifest_note"
      reason: "Manifest identified a candidate document, but no span-backed layout evidence is present in the fixture."
  missing_tool_or_low_confidence_notes:
    - "No actual OCR, Camelot, PDF rendering, PyMuPDF, or file writes were used; selections are based only on synthetic spans and candidate metadata."
    - "U2 local EVAL material status is none_found, so final readiness relies on the approved supplemental app note."
```

### extraction_manifest
```yaml
extraction_manifest:
  workflow_id: "component_pcb_layout_guide_extraction"
  fixture_type: "public_safe_synthetic"
  processed_docs_count: 5
  processed_docs:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      source_file: "DATA Sheet/LT3045_datasheet.pdf"
      source_file_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      page_count: 44
      cache_status: "new_index_required"
      used_in_citation_map: true
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      source_file: "EVAL/DC2222A_user_guide.pdf"
      source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      page_count: 12
      cache_status: "new_index_required"
      used_in_citation_map: true
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      source_file: "EVAL/DC2222A_design_files.zip"
      source_file_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      cache_status: "inspect_archive_manifest_only"
      used_in_citation_map: false
      archive_candidate_docs:
        - "README_layout_notes.txt"
    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
      source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      page_count: 32
      cache_status: "existing_index_reusable"
      used_in_citation_map: true
    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      source_file: "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
      source_file_sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      page_count: 8
      cache_status: "mock_saved"
      used_in_citation_map: true
  cache_hits:
    - "DATA Sheet/MCP73831_family_datasheet.pdf"
  cache_misses:
    - "DATA Sheet/LT3045_datasheet.pdf"
    - "EVAL/DC2222A_user_guide.pdf"
  cache_manifest_only:
    - "EVAL/DC2222A_design_files.zip"
  supplemental_source_saved:
    - "Layout Guide/source_docs/MCP73831_layout_app_note.pdf"
  candidate_span_count: 6
  supplemental_doc_count: 1
  figure_count_promoted: 2
  table_count_promoted: 1
  rejected_candidate_count: 2
  tool_use_status: "none; synthetic-only packet"
  warnings:
    - "All content is synthetic and portable; no runtime absolute paths, customer data, secrets, downloads, rendering, OCR, or file writes were used."
    - "J1 remains review_required because there is no manufacturer-backed identity."
    - "U1 archive README_layout_notes.txt was manifest-identified only and is not source-backed in this packet."
    - "U2 local EVAL material status is none_found; the approved supplemental app note closes the readiness gap."
  open_questions:
    - "What manufacturer-backed part number or owner-approved source identity resolves J1?"
```

### rejected_visual_table_candidates
```yaml
rejected_visual_table_candidates:
  - candidate_id: "U1_table_eval_p2_revision_history"
    component_key: "analog_devices_lt3045edd_1"
    refdes: "U1"
    source_file: "EVAL/DC2222A_user_guide.pdf"
    source_file_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    page_number: 2
    candidate_type: "table"
    camelot_accuracy: 96.0
    camelot_whitespace: 18.5
    layout_context: "revision history"
    rejection_reason: "Revision history is not board-layout guidance and must not be promoted."
  - candidate_id: "U2_table_ds_p4_ordering"
    component_key: "microchip_mcp73831t_2aci_ot"
    refdes: "U2"
    source_file: "DATA Sheet/MCP73831_family_datasheet.pdf"
    source_file_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    page_number: 4
    candidate_type: "table"
    camelot_accuracy: 99.1
    camelot_whitespace: 12.0
    layout_context: "ordering codes"
    rejection_reason: "Ordering codes are not layout or board-context evidence and must be rejected."
```

### boundary_and_readiness_review
```yaml
boundary_and_readiness_review:
  public_private_boundary_verdict: "pass_public_safe_synthetic"
  boundary_notes:
    - "No private project data, secrets, credentials, cookies, or runtime absolute paths were introduced."
    - "Only fixture-bound synthetic spans, checksums, source URLs, page numbers, and candidate metadata were used."
  ready_components:
    - component_key: "analog_devices_lt3045edd_1"
      refdes: "U1"
      readiness: "ready"
      note: "Cited spans cover decoupling, thermal pad/via stitching, grounding, and reference-layout alignment."
    - component_key: "microchip_mcp73831t_2aci_ot"
      refdes: "U2"
      readiness: "ready"
      note: "Cached datasheet was reused, local EVAL material was none_found, and the approved supplemental app note closes the layout-readiness gap."
  blocked_or_review_components:
    - component_key: "usb_c_receptacle_unresolved"
      refdes: "J1"
      status: "review_required"
      note: "No source-backed identity or layout evidence is available."
  readiness_note: "U1 and U2 can proceed to Layout Guide write-up and asset promotion; J1 must stay blocked until identity is resolved."
  next_owner_actions:
    - component_key: "analog_devices_lt3045edd_1"
      action: "Write Layout Guide/layout_guide.md and promote the cited figure and table assets under figures/ and tables/."
    - component_key: "microchip_mcp73831t_2aci_ot"
      action: "Write Layout Guide/layout_guide.md, keep the approved supplemental app note cited, and promote the cited full-page render."
    - component_key: "usb_c_receptacle_unresolved"
      action: "Obtain a manufacturer-backed identity or owner-approved source before any layout guidance is drafted."
```

Recommendation: proceed with U1 and U2 now, and keep J1 blocked until a manufacturer-backed identity is supplied.