1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `elf`
- `class`: `archivist`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`
- `page_boundary_node_family`: `Page`
- `page_count_candidate`: `11`

2. `page_boundary_summary`
- Authoritative boundary candidates: `11` `Page` nodes in source order.
- Stable IDs assigned by ordinal source order: `page_001` through `page_011`.
- Page-number signals are missing, ambiguous, or non-contiguous on 5 of 11 pages.
- Titleblock `Page Count` signal reports `8`, which conflicts with the observed 11 page nodes.
- Split policy is source-order-preserving and page-local XML must remain unnormalized.

3. `page_split_plan`
- Split into 11 page assets, one per source-order `Page` node.
- Preserve page-local XML payload exactly as encountered.
- Do not normalize connectivity, nets, refdes, materials, PCB/MDD pairing, or library identity.
- Use ordinal suffix handling for duplicate/missing label conditions.
- Do not place page XML assets under `.workflow/`.
- Handoff target: `page_xml_normalize_spec_v0`.

4. `page_manifest`
- `page_001`: ord `1`, elements `29892`, `part_inst 211`, `page_number_signal 1`, `page_count_signal 8`, warning `titleblock_count_conflict_possible`
- `page_002`: ord `2`, elements `29974`, `part_inst 211`, `page_number_signal 2`, `page_count_signal 8`, warning `titleblock_count_conflict_possible`
- `page_003`: ord `3`, elements `57198`, `part_inst 464`, `page_number_signal missing_or_not_public`, `page_count_signal missing_or_not_public`
- `page_004`: ord `4`, elements `3210`, `part_inst 11`, `page_number_signal 5`, `page_count_signal 8`, warning `ordinal_gap_or_label_shift`
- `page_005`: ord `5`, elements `4190`, `part_inst 24`, `page_number_signal 6`, `page_count_signal 8`, warning `ordinal_gap_or_label_shift`
- `page_006`: ord `6`, elements `1434`, `part_inst 11`, `page_number_signal missing_or_not_public`, `material_property_signal 3`
- `page_007`: ord `7`, elements `1536`, `part_inst 12`, `page_number_signal missing_or_not_public`, `material_property_signal 3`
- `page_008`: ord `8`, elements `4404`, `part_inst 39`, `page_number_signal missing_or_not_public`, `material_property_signal 39`
- `page_009`: ord `9`, elements `7200`, `part_inst 58`, `page_number_signal 7`, `page_count_signal 8`, warning `ordinal_gap_or_label_shift`
- `page_010`: ord `10`, elements `5808`, `part_inst 10`, `page_number_signal 8`, `page_count_signal 8`, warning `titleblock_count_conflict_possible`
- `page_011`: ord `11`, elements `2096`, `part_inst 16`, `page_number_signal missing_or_not_public`, `material_property_signal 3`
- Manifest warning: titleblock `Page Count = 8` does not match observed page-node count `11`.

5. `page_index`
- `page_001 -> source_ordinal 1`
- `page_002 -> source_ordinal 2`
- `page_003 -> source_ordinal 3`
- `page_004 -> source_ordinal 4`
- `page_005 -> source_ordinal 5`
- `page_006 -> source_ordinal 6`
- `page_007 -> source_ordinal 7`
- `page_008 -> source_ordinal 8`
- `page_009 -> source_ordinal 9`
- `page_010 -> source_ordinal 10`
- `page_011 -> source_ordinal 11`

6. `source_provenance`
- Real sample derived metadata was used.
- Raw XML body was not included.
- Runtime absolute path was not included.
- Provenance anchor: `source_binding_identity = project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Source fingerprint prefix: `74195c6c62bdcf3f`
- Output is project-local derived artifact data only.
- Page payloads must remain source-ordered and page-local.

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
- These are routing hints only, not authoritative semantics.

8. `split_readiness`
- Ready for page splitting by authoritative source-order boundaries.
- Ready to emit 11 page assets with stable IDs `page_001` to `page_011`.
- Not ready for normalization inside this step.
- Key warning: page count signal in titleblock is inconsistent with observed page nodes.
- Single-page fallback is not allowed.

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff bundle should include:
- page-local XML assets
- page manifest
- provenance context
- titleblock count conflict warning
- source-order stable ID mapping
- No asset placement under `.workflow/`.

10. `open_questions`
- Should downstream normalization treat the `Page Count = 8` signal as advisory only, or emit a hard conflict flag?
- Should pages with missing page-number signals be labeled purely by ordinal, with no inferred numbering?
- Are `page_006` to `page_008` expected to remain hardware/material-heavy pages without off-page connector emphasis, or should that be reclassified later by a content-aware stage?
