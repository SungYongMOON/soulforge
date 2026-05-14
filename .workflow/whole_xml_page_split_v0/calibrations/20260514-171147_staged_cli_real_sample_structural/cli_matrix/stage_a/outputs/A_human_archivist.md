1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `human`
- `class`: `archivist`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`

2. `page_boundary_summary`
- Authoritative boundary candidates: `11` `Page` nodes
- Stable page ids: `page_001` through `page_011`
- Source-order policy: preserve original page order; do not infer alternate ordering from page-number signals
- Boundary integrity: page-number signals are missing or non-contiguous on multiple pages, so page numbers are not suitable as primary identity
- Manifest warning: titleblock `Page Count = 8` conflicts with the observed `11` page nodes and must be treated as incorrect for split count
- Split policy note: preserve page-local XML payloads without normalization

3. `page_split_plan`
- Split into `11` project-local page assets, one per source-order `Page` node
- Use source-order derived ids only: `page_001` ... `page_011`
- Keep each page payload byte-for-byte unnormalized for the split stage
- Attach per-page structural metadata only; do not rewrite refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity
- Emit manifest warnings for:
  - titleblock page count conflict
  - missing or ambiguous page-number signals
  - non-contiguous page-number sequence
- Do not place page XML assets under `.workflow/`
- Handoff target: `page_xml_normalize_spec_v0`

4. `page_manifest`
- `page_001`: ordinal `1`, elements `29892`, parts `211`, nets `296`, wires `856`, off-page connectors `156`, page-number signal `1`
- `page_002`: ordinal `2`, elements `29974`, parts `211`, nets `296`, wires `851`, off-page connectors `155`, page-number signal `2`
- `page_003`: ordinal `3`, elements `57198`, parts `464`, nets `260`, wires `1689`, off-page connectors `36`, page-number signal missing/ambiguous
- `page_004`: ordinal `4`, elements `3210`, parts `11`, nets `58`, wires `99`, off-page connectors `81`, page-number signal `5`
- `page_005`: ordinal `5`, elements `4190`, parts `24`, nets `51`, wires `132`, off-page connectors `45`, page-number signal `6`
- `page_006`: ordinal `6`, elements `1434`, parts `11`, nets `10`, wires `50`, off-page connectors `0`, page-number signal missing/ambiguous
- `page_007`: ordinal `7`, elements `1536`, parts `12`, nets `10`, wires `56`, off-page connectors `0`, page-number signal missing/ambiguous
- `page_008`: ordinal `8`, elements `4404`, parts `39`, nets `19`, wires `123`, off-page connectors `0`, page-number signal missing/ambiguous
- `page_009`: ordinal `9`, elements `7200`, parts `58`, nets `39`, wires `220`, off-page connectors `23`, page-number signal `7`
- `page_010`: ordinal `10`, elements `5808`, parts `10`, nets `102`, wires `237`, off-page connectors `42`, page-number signal `8`
- `page_011`: ordinal `11`, elements `2096`, parts `16`, nets `12`, wires `65`, off-page connectors `0`, page-number signal missing/ambiguous

5. `page_index`
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

6. `source_provenance`
- Source binding: project-local real-sample-derived structural metadata
- Identity marker: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Content class: EXP-like Cadence/OrCAD Capture design XML
- Raw XML body: not included
- Runtime absolute path: not included
- Provenance scope: public-safe structural metadata only
- Trust rule: boundary count comes from observed `Page` nodes, not from titleblock count

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
- Ready for split: yes
- Boundary confidence: high at page-node level, low at page-number level
- Required warning state: include titleblock count conflict in manifest
- Preservation requirement: keep page order and page-local payloads unchanged
- Fallback status: single-page fallback not allowed
- Output locality: project-local only, not under `.workflow/`

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload: page XML assets plus manifest and provenance context
- Handoff constraints:
  - preserve page order
  - preserve raw page-local XML
  - include page ids and source ordinals
  - include manifest warnings
  - do not normalize structural content before handoff

10. `open_questions`
- None blocking the split stage
- Remaining ambiguity is limited to page-number labeling, but stable ids are already resolved from source order
- If downstream normalization requires page-number reconciliation, it should treat those signals as advisory only, not canonical