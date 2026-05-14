**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini` / `low`
- `species`: `darkelf`
- `class`: `administrator`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `real_sample_used`: `true`
- `parser_mode`: `streaming_elementtree_boundary_probe`

**page_boundary_summary**
- Authoritative boundary candidates: `11` `Page` nodes.
- Stable page ids are derived by source order: `page_001` through `page_011`.
- Titleblock `Page Count` signal is not reliable for split cardinality.
- Manifest warning: reported `Page Count = 8`, but observed page-node count is `11`.
- Page-number signals are missing or non-contiguous for several pages, so ordinal identity is required.
- Split policy is preserve-order, preserve-page-XML, no normalization.

**page_split_plan**
- Emit one project-local page asset per source-order `Page` node.
- Preserve original page-local XML payload exactly as-is.
- Assign ids by ordinal only: `page_001` ... `page_011`.
- Do not infer or repair missing page-number continuity.
- Record duplicate/missing label conditions as manifest warnings, not as corrections.
- Do not place page XML assets under `.workflow/`.
- Hand off page assets with manifest and provenance context to `page_xml_normalize_spec_v0`.

**page_manifest**
- `page_001`: source ordinal `1`, element count `29892`, page-number signal `1`, title present, off-page connectors `156`
- `page_002`: source ordinal `2`, element count `29974`, page-number signal `2`, title present, off-page connectors `155`
- `page_003`: source ordinal `3`, element count `57198`, page-number signal missing/ambiguous, title present, off-page connectors `36`
- `page_004`: source ordinal `4`, element count `3210`, page-number signal `5`, title present, off-page connectors `81`
- `page_005`: source ordinal `5`, element count `4190`, page-number signal `6`, title present, off-page connectors `45`
- `page_006`: source ordinal `6`, element count `1434`, page-number signal missing/ambiguous, title missing/not public, off-page connectors `0`
- `page_007`: source ordinal `7`, element count `1536`, page-number signal missing/ambiguous, title missing/not public, off-page connectors `0`
- `page_008`: source ordinal `8`, element count `4404`, page-number signal missing/ambiguous, title missing/not public, off-page connectors `0`
- `page_009`: source ordinal `9`, element count `7200`, page-number signal `7`, title present, off-page connectors `23`
- `page_010`: source ordinal `10`, element count `5808`, page-number signal `8`, title present, off-page connectors `42`
- `page_011`: source ordinal `11`, element count `2096`, page-number signal missing/ambiguous, title missing/not public, off-page connectors `0`
- Manifest warning: titleblock page count signal reports `8`, conflicting with `11` observed page nodes.

**page_index**
- `page_001` -> source ordinal `1`
- `page_002` -> source ordinal `2`
- `page_003` -> source ordinal `3`
- `page_004` -> source ordinal `4`
- `page_005` -> source ordinal `5`
- `page_006` -> source ordinal `6`
- `page_007` -> source ordinal `7`
- `page_008` -> source ordinal `8`
- `page_009` -> source ordinal `9`
- `page_010` -> source ordinal `10`
- `page_011` -> source ordinal `11`

**source_provenance**
- Source binding identity: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Source hash prefix: `74195c6c62bdcf3f`
- Source size: `12670307` bytes
- Root element: `Design`
- Schema family marker: Cadence/OrCAD Capture Design EXP-like XML
- Boundary extraction basis: page-node family only
- Public-safe derivation: structural metadata only, no raw page bodies

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
- Role hints are routing hints only, not authoritative classifications.

**split_readiness**
- Ready: yes, for page-boundary split only.
- Confidence basis: 11 observed page nodes, stable ordinal ids, preserved source order.
- Blockers: none for split packaging.
- Warnings: non-contiguous page-number signals, conflicting titleblock count, several missing title signals, several pages with private/not-public signals.
- Constraint compliance: preserve XML payloads; no normalization at split stage.

**downstream_handoff**
- Target: `page_xml_normalize_spec_v0`
- Handoff contents: page XML assets, page manifest, source provenance, page index, manifest warnings, role hints
- Handoff intent: normalize per-page XML after split, without altering split identity or order
- Asset boundary: project-local only, not under `.workflow/`
- Preservation requirement: keep each page payload intact through handoff

**open_questions**
- Should downstream normalization treat `page_number_signals` as advisory only, or retain them in metadata for traceability?
- Should pages with `missing_or_not_public` title/page-number signals be flagged as private-context candidates in downstream routing?
- Is there a preferred manifest schema for recording the page count conflict, or is a single warning field sufficient?
- Should `page_xml_normalize_spec_v0` receive any additional non-sensitive structural counts beyond the fields already captured here?