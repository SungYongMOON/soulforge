**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `dwarf`
- `class`: `administrator`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `root_element`: `Design`
- `schema_family_marker`: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`
- `parser_mode`: `streaming_elementtree_boundary_probe`

**page_boundary_summary**
- Authoritative boundary candidates come from `Page` nodes.
- Total page nodes: `11`
- Stable ids are derived from source order: `page_001` through `page_011`
- Source order is preserved.
- Titleblock `Page Count` signal is not reliable for split count.
- Manifest warning: reported page count value `8` conflicts with observed `11` page nodes.
- Page number signals are missing or non-contiguous on multiple pages, so they are not usable as primary identity.

**page_split_plan**
- Produce `11` page XML assets, one per authoritative `Page` node.
- Preserve page-local XML exactly as encountered, without normalization.
- Keep source order unchanged in output and downstream handoff.
- Use ordinal-derived stable ids only.
- Record duplicate, missing, or ambiguous labeling as manifest warnings rather than attempting repair.
- Do not place page XML assets under `.workflow/`.
- Hand off page payloads plus manifest and provenance context to `page_xml_normalize_spec_v0`.

**page_manifest**
- `page_001`: `source_ordinal=1`, `element_count=29892`, `part_inst_count=211`, `net_scalar_count=296`, `wire_scalar_count=856`, `off_page_connector_count=156`, `port_inst_scalar_count=621`, `no_connect_marker_count=621`, `part_user_prop_count=1460`, `pcb_footprint_signal_count=211`, `material_property_signal_count=0`
- `page_002`: `source_ordinal=2`, `element_count=29974`, `part_inst_count=211`, `net_scalar_count=296`, `wire_scalar_count=851`, `off_page_connector_count=155`, `port_inst_scalar_count=621`, `no_connect_marker_count=621`, `part_user_prop_count=1460`, `pcb_footprint_signal_count=211`, `material_property_signal_count=0`
- `page_003`: `source_ordinal=3`, `element_count=57198`, `part_inst_count=464`, `net_scalar_count=260`, `wire_scalar_count=1689`, `off_page_connector_count=36`, `port_inst_scalar_count=1120`, `no_connect_marker_count=1120`, `part_user_prop_count=3360`, `pcb_footprint_signal_count=464`, `material_property_signal_count=0`
- `page_004`: `source_ordinal=4`, `element_count=3210`, `part_inst_count=11`, `net_scalar_count=58`, `wire_scalar_count=99`, `off_page_connector_count=81`, `port_inst_scalar_count=11`, `no_connect_marker_count=11`, `part_user_prop_count=33`, `pcb_footprint_signal_count=11`, `material_property_signal_count=0`
- `page_005`: `source_ordinal=5`, `element_count=4190`, `part_inst_count=24`, `net_scalar_count=51`, `wire_scalar_count=132`, `off_page_connector_count=45`, `port_inst_scalar_count=64`, `no_connect_marker_count=64`, `part_user_prop_count=132`, `pcb_footprint_signal_count=24`, `material_property_signal_count=0`
- `page_006`: `source_ordinal=6`, `element_count=1434`, `part_inst_count=11`, `net_scalar_count=10`, `wire_scalar_count=50`, `off_page_connector_count=0`, `port_inst_scalar_count=33`, `no_connect_marker_count=33`, `part_user_prop_count=63`, `pcb_footprint_signal_count=11`, `material_property_signal_count=3`
- `page_007`: `source_ordinal=7`, `element_count=1536`, `part_inst_count=12`, `net_scalar_count=10`, `wire_scalar_count=56`, `off_page_connector_count=0`, `port_inst_scalar_count=35`, `no_connect_marker_count=35`, `part_user_prop_count=69`, `pcb_footprint_signal_count=12`, `material_property_signal_count=3`
- `page_008`: `source_ordinal=8`, `element_count=4404`, `part_inst_count=39`, `net_scalar_count=19`, `wire_scalar_count=123`, `off_page_connector_count=0`, `port_inst_scalar_count=96`, `no_connect_marker_count=96`, `part_user_prop_count=540`, `pcb_footprint_signal_count=39`, `material_property_signal_count=39`
- `page_009`: `source_ordinal=9`, `element_count=7200`, `part_inst_count=58`, `net_scalar_count=39`, `wire_scalar_count=220`, `off_page_connector_count=23`, `port_inst_scalar_count=138`, `no_connect_marker_count=138`, `part_user_prop_count=358`, `pcb_footprint_signal_count=58`, `material_property_signal_count=0`
- `page_010`: `source_ordinal=10`, `element_count=5808`, `part_inst_count=10`, `net_scalar_count=102`, `wire_scalar_count=237`, `off_page_connector_count=42`, `port_inst_scalar_count=154`, `no_connect_marker_count=154`, `part_user_prop_count=52`, `pcb_footprint_signal_count=10`, `material_property_signal_count=0`
- `page_011`: `source_ordinal=11`, `element_count=2096`, `part_inst_count=16`, `net_scalar_count=12`, `wire_scalar_count=65`, `off_page_connector_count=0`, `port_inst_scalar_count=43`, `no_connect_marker_count=43`, `part_user_prop_count=117`, `pcb_footprint_signal_count=16`, `material_property_signal_count=3`
- Manifest warnings:
  - Titleblock `Page Count` reported `8`, but observed page nodes are `11`.
  - Page-number signals are missing or ambiguous on `5` pages.
  - Page numbering is non-contiguous across the source order.

**page_index**
- `1 -> page_001`
- `2 -> page_002`
- `3 -> page_003`
- `4 -> page_004`
- `5 -> page_005`
- `6 -> page_006`
- `7 -> page_007`
- `8 -> page_008`
- `9 -> page_009`
- `10 -> page_010`
- `11 -> page_011`

**source_provenance**
- Source binding is real-sample-derived structural metadata only.
- Raw XML body was not included in the fixture.
- Runtime absolute path was not included.
- Page boundary authority comes from `Page` nodes, not titleblock count signals.
- Structural provenance includes observed count conflict between titleblock and actual page-node count.
- Checksums or payload hashes for individual page assets are not available in the fixture and should be generated by the project-local runner if needed.

**page_role_hints**
- `page_001`: schematic content, off-page connector context, possible PCB context
- `page_002`: schematic content, off-page connector context, possible PCB context
- `page_003`: schematic content, off-page connector context, possible PCB context
- `page_004`: schematic content, off-page connector context, possible PCB context
- `page_005`: schematic content, off-page connector context, possible PCB context
- `page_006`: schematic content, hardware or material context, possible PCB context
- `page_007`: schematic content, hardware or material context, possible PCB context
- `page_008`: schematic content, hardware or material context, possible PCB context
- `page_009`: schematic content, off-page connector context, possible PCB context
- `page_010`: schematic content, off-page connector context, possible PCB context
- `page_011`: schematic content, hardware or material context, possible PCB context
- Note: these are routing hints only, not authoritative classification.

**split_readiness**
- Ready for split output generation: `yes`
- Ready for normalization: `yes`, after split output exists
- Split strategy confidence: `high`
- Constraints satisfied:
  - Preserve source page order
  - Preserve page-local XML without normalization
  - Use ordinal stable ids
  - Avoid `.workflow/` for page assets
- Primary risk remains downstream interpretation of ambiguous page numbering, which should be handled via warnings only.

**downstream_handoff**
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload should include:
  - `page_001` through `page_011` page XML assets
  - page manifest
  - source provenance context
  - manifest warnings about count conflicts and ambiguous numbering
- Handoff should preserve the original page order and stable ids exactly.

**open_questions**
- Should the downstream normalizer emit a dedicated warning code for the `8` vs `11` page-count conflict?
- Should pages with missing titleblock numbering be tagged with a standard ambiguity marker in the manifest?
- Should the project-local runner compute per-page checksums at split time, or defer that to the normalize step?