1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `dwarf`
- `class`: `archivist`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`
- `root_element`: `Design`
- `schema_family_marker`: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`

2. `page_boundary_summary`
- Authoritative page boundary candidates: `11` `Page` nodes
- Stable page ids must be derived from source order as `page_001` through `page_011`
- Titleblock `Page Count` signal reports `8`, but this conflicts with the observed page nodes
- Page-number signals are missing or non-contiguous on several pages, so page numbering is not a stable identity source
- Preserve source page order exactly
- Preserve page-local XML payloads without normalization
- This is a split-only calibration; do not infer content rewrites, connectivity normalization, or library reconciliation

3. `page_split_plan`
- Split the source into `11` page assets in source order
- Assign `page_001` to `page_011` directly from ordinal position
- Keep each page payload untouched
- Attach manifest warnings for:
  - `Page Count = 8` conflict
  - missing or ambiguous page-number signals
  - non-contiguous page-number sequence
- Do not collapse pages, merge ambiguous pages, or use a single-page fallback
- Do not place page XML assets under `.workflow/`
- Hand off page XML assets plus manifest and provenance context to `page_xml_normalize_spec_v0`

4. `page_manifest`
- `page_001`: ordinal `1`, element_count `29892`, page_number_signals `["1"]`
- `page_002`: ordinal `2`, element_count `29974`, page_number_signals `["2"]`
- `page_003`: ordinal `3`, element_count `57198`, page_number_signals `["missing_or_not_public"]`
- `page_004`: ordinal `4`, element_count `3210`, page_number_signals `["5"]`
- `page_005`: ordinal `5`, element_count `4190`, page_number_signals `["6"]`
- `page_006`: ordinal `6`, element_count `1434`, page_number_signals `["missing_or_not_public"]`
- `page_007`: ordinal `7`, element_count `1536`, page_number_signals `["missing_or_not_public"]`
- `page_008`: ordinal `8`, element_count `4404`, page_number_signals `["missing_or_not_public"]`
- `page_009`: ordinal `9`, element_count `7200`, page_number_signals `["7"]`
- `page_010`: ordinal `10`, element_count `5808`, page_number_signals `["8"]`
- `page_011`: ordinal `11`, element_count `2096`, page_number_signals `["missing_or_not_public"]`
- Manifest warnings:
  - titleblock `Page Count` value `8` is not authoritative
  - page numbering is incomplete and non-contiguous
  - page identity must remain ordinal-only

5. `page_index`
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

6. `source_provenance`
- Source is a real-sample-derived structural calibration fixture
- Provenance is anchored to the source SHA-256 prefix `74195c6c62bdcf3f`
- Raw XML body is not included in this packet
- Runtime absolute path is not included in this packet
- Page-level payloads are derived from source-order `Page` nodes only
- No normalization, refdes reconciliation, net rewriting, or PCB/MDD inference has been applied

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
- These are routing hints only and are not authoritative classifications

8. `split_readiness`
- Ready for split execution: yes
- Ready for page-order preservation: yes
- Ready for ordinal-only stable ids: yes
- Ready for downstream normalization handoff: yes
- Blockers: none
- Cautions:
  - do not trust the titleblock page count
  - do not trust page-number signals for completeness
  - preserve page-local XML exactly as sourced

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload should include:
  - ordered page assets for `page_001` through `page_011`
  - manifest with ordinal mapping and warnings
  - provenance context with source identity and SHA prefix
  - boundary summary noting the `Page Count = 8` conflict
- Handoff should not include raw XML in this packet
- Handoff should not rely on `.workflow/` storage for page assets

10. `open_questions`
- Should downstream normalization treat missing page-number signals as purely informational, with no attempt to infer hidden numbering?
- Should the manifest encode the `Page Count = 8` conflict as a hard warning or soft warning?
- Is there any project-local checksum policy beyond the provided source SHA prefix for page asset registration?
- Should downstream consumers preserve only ordinal order, or also retain observed page-number signals as advisory metadata?