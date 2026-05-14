**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `human`
- `class`: `auditor`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`

**page_boundary_summary**
- Authoritative page boundary candidates: 11 `Page` nodes
- Stable ids are derived from source order: `page_001` through `page_011`
- Titleblock `Page Count = 8` is a manifest conflict, not the split count
- Page-number signals are missing or non-contiguous on 5 pages
- Source order is preserved as the split order
- Page XML payloads remain page-local and unnormalized

**page_split_plan**
- Split into 11 page assets, one per source `Page` node
- Preserve original page order exactly
- Do not normalize XML, connectivity, refdes, nets, or library identity
- Use ordinal fallback ids only; do not depend on page numbers for identity
- Record titleblock/page-number conflicts as warnings in the manifest
- Hand off the resulting page assets with manifest and provenance context to `page_xml_normalize_spec_v0`

**page_manifest**
- `page_001`: ordinal `1`, page number signal `1`, count signal `8`, element count `29892`
- `page_002`: ordinal `2`, page number signal `2`, count signal `8`, element count `29974`
- `page_003`: ordinal `3`, page number signal missing, count signal missing, element count `57198`
- `page_004`: ordinal `4`, page number signal `5`, count signal `8`, element count `3210`
- `page_005`: ordinal `5`, page number signal `6`, count signal `8`, element count `4190`
- `page_006`: ordinal `6`, page number signal missing, count signal missing, element count `1434`
- `page_007`: ordinal `7`, page number signal missing, count signal missing, element count `1536`
- `page_008`: ordinal `8`, page number signal missing, count signal missing, element count `4404`
- `page_009`: ordinal `9`, page number signal `7`, count signal `8`, element count `7200`
- `page_010`: ordinal `10`, page number signal `8`, count signal `8`, element count `5808`
- `page_011`: ordinal `11`, page number signal missing, count signal missing, element count `2096`
- Manifest warnings:
  - Titleblock `Page Count = 8` conflicts with 11 actual page nodes
  - Page-number signals are sparse and non-contiguous
  - Several pages expose only redacted or non-public title/page signals

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
- Origin is a real-sample-derived structural fixture, not a synthetic sample
- Boundary detection is based on `Page` nodes in source order
- Source body is not included here
- Runtime absolute paths are not included here
- No XML normalization was applied
- No page content was rewritten, reordered, or merged
- Provenance context should travel with page assets during downstream processing

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
- These are routing hints only, not authoritative classifications

**split_readiness**
- Ready for page-local asset emission: yes
- Ready for source-order split: yes
- Ready for normalization: no, defer to downstream stage
- Ready for identity reconciliation: no, preserve stable ordinal ids only
- Ready for manifest-driven handoff: yes
- Constraints observed:
  - project-local only
  - never under `.workflow/`
  - no raw XML bodies in public-safe output
  - preserve page-local payloads unchanged

**downstream_handoff**
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff bundle should include:
  - page assets for `page_001` through `page_011`
  - split manifest
  - provenance summary
  - manifest warnings
  - source-order mapping
- Downstream expectation:
  - normalize and inspect page XML after split
  - keep page identity aligned to the stable ids above
  - preserve provenance linkage for each page asset

**open_questions**
- Should the downstream normalizer treat the titleblock `Page Count = 8` as informational only, or emit a hard warning?
- Should pages with missing page-number signals be left unnumbered, or receive ordinal-only labels in later stages?
- Should page-local warnings be propagated into per-page metadata, or stored only at bundle level?
- Is there a preferred checksum format for per-page payload integrity in the project-local runner output?