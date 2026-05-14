1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `darkelf`
- `class`: `auditor`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`

2. `page_boundary_summary`
- Authoritative page boundary candidates: `11` `Page` nodes in source order
- Stable ids derived from order: `page_001` through `page_011`
- Titleblock `Page Count=8` is a manifest conflict, not the true split count
- Page-number signals are missing or non-contiguous for 5 nodes, so page numbering is not a stable identity source
- Source order is preserved as the split order

3. `page_split_plan`
- Split into 11 page-local XML assets, one per source `Page` node
- Preserve each page payload exactly as encountered; do not normalize XML or infer connectivity
- Use ordinal ids only: `page_001` ... `page_011`
- Attach manifest warnings for conflicting page-count/titleblock signals and ambiguous page numbers
- Do not place page XML assets under `.workflow/`
- Hand off page assets with manifest and provenance context to `page_xml_normalize_spec_v0`

4. `page_manifest`
- `page_001`: ordinal `1`, counts `element=29892`, `part_inst=211`, `net_scalar=296`, `wire_scalar=856`, `off_page_connector=156`, `material=0`, `title=present_redacted`
- `page_002`: ordinal `2`, counts `element=29974`, `part_inst=211`, `net_scalar=296`, `wire_scalar=851`, `off_page_connector=155`, `material=0`, `title=present_redacted`
- `page_003`: ordinal `3`, counts `element=57198`, `part_inst=464`, `net_scalar=260`, `wire_scalar=1689`, `off_page_connector=36`, `material=0`, `title=present_redacted`
- `page_004`: ordinal `4`, counts `element=3210`, `part_inst=11`, `net_scalar=58`, `wire_scalar=99`, `off_page_connector=81`, `material=0`, `title=present_redacted`
- `page_005`: ordinal `5`, counts `element=4190`, `part_inst=24`, `net_scalar=51`, `wire_scalar=132`, `off_page_connector=45`, `material=0`, `title=present_redacted`
- `page_006`: ordinal `6`, counts `element=1434`, `part_inst=11`, `net_scalar=10`, `wire_scalar=50`, `off_page_connector=0`, `material=3`, `title=missing_or_not_public`
- `page_007`: ordinal `7`, counts `element=1536`, `part_inst=12`, `net_scalar=10`, `wire_scalar=56`, `off_page_connector=0`, `material=3`, `title=missing_or_not_public`
- `page_008`: ordinal `8`, counts `element=4404`, `part_inst=39`, `net_scalar=19`, `wire_scalar=123`, `off_page_connector=0`, `material=39`, `title=missing_or_not_public`
- `page_009`: ordinal `9`, counts `element=7200`, `part_inst=58`, `net_scalar=39`, `wire_scalar=220`, `off_page_connector=23`, `material=0`, `title=present_redacted`
- `page_010`: ordinal `10`, counts `element=5808`, `part_inst=10`, `net_scalar=102`, `wire_scalar=237`, `off_page_connector=42`, `material=0`, `title=present_redacted`
- `page_011`: ordinal `11`, counts `element=2096`, `part_inst=16`, `net_scalar=12`, `wire_scalar=65`, `off_page_connector=0`, `material=3`, `title=missing_or_not_public`

5. `page_index`
- `page_001`: source ordinal `1`, page number signal `1`, count signal `8`
- `page_002`: source ordinal `2`, page number signal `2`, count signal `8`
- `page_003`: source ordinal `3`, page number signal `missing_or_not_public`, count signal `missing_or_not_public`
- `page_004`: source ordinal `4`, page number signal `5`, count signal `8`
- `page_005`: source ordinal `5`, page number signal `6`, count signal `8`
- `page_006`: source ordinal `6`, page number signal `missing_or_not_public`, count signal `missing_or_not_public`
- `page_007`: source ordinal `7`, page number signal `missing_or_not_public`, count signal `missing_or_not_public`
- `page_008`: source ordinal `8`, page number signal `missing_or_not_public`, count signal `missing_or_not_public`
- `page_009`: source ordinal `9`, page number signal `7`, count signal `8`
- `page_010`: source ordinal `10`, page number signal `8`, count signal `8`
- `page_011`: source ordinal `11`, page number signal `missing_or_not_public`, count signal `missing_or_not_public`

6. `source_provenance`
- Source binding: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Real sample used: `true`
- Archived path exposed: `false`
- Raw XML body included: `false`
- Runtime absolute path included: `false`
- Source identity is structural-only and public-safe
- Boundary evidence comes from `Page` nodes, not titleblock counts
- Global counts observed: `Package=107`, `PartInst=1067`, `NetScalar=1153`, `WireScalar=4378`, `OffPageConnector=538`, `PartInstUserProp=7644`, `IsNoConnect=3494`

7. `page_role_hints`
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

8. `split_readiness`
- Ready for page-local split emission: `yes`
- Ready for normalization downstream: `yes`, after split only
- Ambiguity status: `page-count conflict`, `non-contiguous page numbers`, `missing page-number signals on 5 pages`
- Operational policy fit: preserves order, preserves raw page XML, avoids canonicalization
- Fallback: single-page fallback is disallowed

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload: page XML assets, page manifest, source provenance, manifest warnings, stable ids
- Required preservation: source order, page-local XML bodies, ordinal ids
- Required exclusions: raw source XML body, host-specific paths, private material

10. `open_questions`
- Should the downstream normalizer treat the `Page Count=8` signal as a soft warning only, or emit a formal inconsistency flag?
- Do missing page-number signals require explicit “unlabeled page” markers in the next stage, or is ordinal identity sufficient?
- Should pages with `material_property_signal_count > 0` be routed differently, or remain in the same normalization lane?
- Is there a preferred warning schema for the conflicting titleblock count versus `11` authoritative `Page` nodes?