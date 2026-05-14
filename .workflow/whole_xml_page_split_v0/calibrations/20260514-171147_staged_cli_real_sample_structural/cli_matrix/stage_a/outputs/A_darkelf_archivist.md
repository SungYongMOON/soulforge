1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini / low / darkelf / archivist`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`
- `root_element`: `Design`
- `schema_family_marker`: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`

2. `page_boundary_summary`
- Authoritative boundary candidates: `Page` nodes
- Observed page nodes: `11`
- Stable page ids: `page_001` through `page_011`
- Ordering rule: preserve source order
- Titleblock `Page Count` signal: `8`
- Warning: titleblock count conflicts with actual page nodes and is not the split count
- Page-number signals are missing or non-contiguous on 5 pages, so page number cannot be used as the primary identity signal

3. `page_split_plan`
- Split into `11` page-local XML assets, one per `Page` node
- Preserve each page payload exactly as encountered
- Do not normalize XML, connectivity, library identity, or any schema content
- Keep page order unchanged
- Use ordinal suffixing only for identity stabilization, not content repair
- Emit manifest warnings for duplicate/missing/ambiguous labels and the false `Page Count` signal
- No fallback to single-page mode

4. `page_manifest`
- `page_001`: source_ordinal `1`, element_count `29892`, page_number_signals `["1"]`, warning `none`
- `page_002`: source_ordinal `2`, element_count `29974`, page_number_signals `["2"]`, warning `none`
- `page_003`: source_ordinal `3`, element_count `57198`, page_number_signals `["missing_or_not_public"]`, warning `page-number identity not available`
- `page_004`: source_ordinal `4`, element_count `3210`, page_number_signals `["5"]`, warning `page-number gap observed`
- `page_005`: source_ordinal `5`, element_count `4190`, page_number_signals `["6"]`, warning `page-number gap observed`
- `page_006`: source_ordinal `6`, element_count `1434`, page_number_signals `["missing_or_not_public"]`, warning `missing title/page number signals`
- `page_007`: source_ordinal `7`, element_count `1536`, page_number_signals `["missing_or_not_public"]`, warning `missing title/page number signals`
- `page_008`: source_ordinal `8`, element_count `4404`, page_number_signals `["missing_or_not_public"]`, warning `material-property-heavy page; numbering not exposed`
- `page_009`: source_ordinal `9`, element_count `7200`, page_number_signals `["7"]`, warning `page-number gap observed`
- `page_010`: source_ordinal `10`, element_count `5808`, page_number_signals `["8"]`, warning `page-number signal overlaps titleblock count`
- `page_011`: source_ordinal `11`, element_count `2096`, page_number_signals `["missing_or_not_public"]`, warning `missing title/page number signals`
- Global warning: titleblock reports `8` while `11` page nodes are present

5. `page_index`
- `page_001` -> `source_ordinal 1`
- `page_002` -> `source_ordinal 2`
- `page_003` -> `source_ordinal 3`
- `page_004` -> `source_ordinal 4`
- `page_005` -> `source_ordinal 5`
- `page_006` -> `source_ordinal 6`
- `page_007` -> `source_ordinal 7`
- `page_008` -> `source_ordinal 8`
- `page_009` -> `source_ordinal 9`
- `page_010` -> `source_ordinal 10`
- `page_011` -> `source_ordinal 11`

6. `source_provenance`
- Binding is project-local and sample-derived
- Real sample used: `true`
- Archived real-sample path exposed: `false`
- Raw XML body included: `false`
- Runtime absolute path included: `false`
- Provenance scope: structural metadata only
- Source identity should be carried forward as manifest context, not reconstructed from page content

7. `page_role_hints`
- `page_001`: `schematic_content`, `offpage_connector_context`, `possible_pcb_context`
- `page_002`: `schematic_content`, `offpage_connector_context`, `possible_pcb_context`
- `page_003`: `schematic_content`, `offpage_connector_context`, `possible_pcb_context`
- `page_004`: `schematic_content`, `offpage_connector_context`, `possible_pcb_context`
- `page_005`: `schematic_content`, `offpage_connector_context`, `possible_pcb_context`
- `page_006`: `schematic_content`, `hardware_or_material_context`, `possible_pcb_context`
- `page_007`: `schematic_content`, `hardware_or_material_context`, `possible_pcb_context`
- `page_008`: `schematic_content`, `hardware_or_material_context`, `possible_pcb_context`
- `page_009`: `schematic_content`, `offpage_connector_context`, `possible_pcb_context`
- `page_010`: `schematic_content`, `offpage_connector_context`, `possible_pcb_context`
- `page_011`: `schematic_content`, `hardware_or_material_context`, `possible_pcb_context`
- Note: hints are routing-only and non-authoritative

8. `split_readiness`
- Ready: `yes`
- Boundary confidence: `high` for page-node isolation, `medium` for semantic labeling
- Identity policy satisfied: `yes`
- Preservation policy satisfied: `yes`
- Manifest warning required: `yes`
- Public-safe output constraint satisfied: `yes`

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload: page XML assets, page manifest, provenance context, warning set
- Handoff contract: preserve page-local XML first, then normalize in downstream stage
- Do not move page assets under `.workflow/`
- Do not infer missing numbering as corrected numbering during handoff

10. `open_questions`
- Should downstream normalization treat the `Page Count = 8` signal as a soft annotation only, or retain it as an explicit conflict marker?
- Should pages with missing page-number signals be labeled purely by ordinal, or also carry a `number_unknown` tag in the manifest schema?
- Is there a preferred checksum field for page-local assets in the runner packet, or should checksum emission remain deferred until actual page extraction?