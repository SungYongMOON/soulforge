**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini / medium / dwarf / archivist`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `boundary_policy`: `Page` nodes are authoritative
- `stable_id_policy`: derive `page_001` through `page_011` from source order
- `split_policy`: preserve source order; preserve page XML without normalization; no single-page fallback

**page_boundary_summary**
- Authoritative page boundary candidates: `11`
- Titleblock `Page Count` signal: reported `8`
- Status: conflict detected; do not use titleblock count as split cardinality
- Page-number signals: partial, non-contiguous, and missing on 5 page nodes
- Result: split should follow source-order page nodes, not titleblock numbering

**page_split_plan**
- Create `11` page-local XML assets, one per `Page` node
- Keep page order exactly as encountered in source
- Assign stable ids by ordinal only: `page_001` to `page_011`
- Preserve each page’s raw XML payload unchanged
- Do not normalize connectivity, nets, refdes, materials, PCB/MDD pairing, or library identity
- Keep outputs project-local only; do not place page assets under `.workflow/`
- Hand off page assets together with manifest and provenance context to `page_xml_normalize_spec_v0`

**page_manifest**
- `page_001`: ordinal `1`, elements `29892`, parts `211`, nets `296`, wires `856`, off-page `156`, page-number signal `1`, titleblock-count signal `8`
- `page_002`: ordinal `2`, elements `29974`, parts `211`, nets `296`, wires `851`, off-page `155`, page-number signal `2`, titleblock-count signal `8`
- `page_003`: ordinal `3`, elements `57198`, parts `464`, nets `260`, wires `1689`, off-page `36`, page-number signal missing/ambiguous
- `page_004`: ordinal `4`, elements `3210`, parts `11`, nets `58`, wires `99`, off-page `81`, page-number signal `5`, titleblock-count signal `8`
- `page_005`: ordinal `5`, elements `4190`, parts `24`, nets `51`, wires `132`, off-page `45`, page-number signal `6`, titleblock-count signal `8`
- `page_006`: ordinal `6`, elements `1434`, parts `11`, nets `10`, wires `50`, off-page `0`, page-number signal missing/ambiguous
- `page_007`: ordinal `7`, elements `1536`, parts `12`, nets `10`, wires `56`, off-page `0`, page-number signal missing/ambiguous
- `page_008`: ordinal `8`, elements `4404`, parts `39`, nets `19`, wires `123`, off-page `0`, page-number signal missing/ambiguous
- `page_009`: ordinal `9`, elements `7200`, parts `58`, nets `39`, wires `220`, off-page `23`, page-number signal `7`, titleblock-count signal `8`
- `page_010`: ordinal `10`, elements `5808`, parts `10`, nets `102`, wires `237`, off-page `42`, page-number signal `8`, titleblock-count signal `8`
- `page_011`: ordinal `11`, elements `2096`, parts `16`, nets `12`, wires `65`, off-page `0`, page-number signal missing/ambiguous
- Manifest warning: titleblock page count `8` conflicts with the observed `11` page nodes

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
- Source binding: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Source hash prefix: `74195c6c62bdcf3f`
- Source size: `12670307` bytes
- Real sample used: yes
- Archived raw sample path: not included
- Parser mode: streaming element-tree boundary probe
- Root element: `Design`
- Schema family marker: Cadence/OrCAD Capture Design EXP-like XML; host path redacted

**page_role_hints**
- Common routing hint across pages: `schematic_content`
- Pages with off-page connectivity emphasis: `page_001`, `page_002`, `page_003`, `page_004`, `page_005`, `page_009`, `page_010`
- Pages with hardware/material context emphasis: `page_006`, `page_007`, `page_008`, `page_011`
- Pages with possible PCB context: all pages
- Non-authoritative only; do not treat as semantic classification

**split_readiness**
- Status: `ready_with_warnings`
- Ready because authoritative page nodes are present and stable ids are derivable from source order
- Warnings:
  - titleblock count mismatch
  - partial/non-contiguous page-number signals
  - several page nodes lack public page-number metadata
- Fallback policy: no single-page fallback

**downstream_handoff**
- Target: `page_xml_normalize_spec_v0`
- Handoff payload should include:
  - ordered page assets for `page_001` through `page_011`
  - page manifest
  - provenance context
  - manifest warnings
- Contract: preserve page-local XML as-is during split stage; normalization is deferred to downstream

**open_questions**
- None blocking for split execution
- Remaining ambiguity is limited to metadata labeling on pages with missing or redacted page-number/title signals
- If downstream normalization requires per-page semantic labels, they should be inferred only from structural hints, not from the conflicting titleblock count