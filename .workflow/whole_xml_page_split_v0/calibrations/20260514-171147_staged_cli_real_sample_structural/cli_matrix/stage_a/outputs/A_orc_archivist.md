1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `orc`
- `class`: `archivist`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `real_sample_used`: `true`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`
- `root_element`: `Design`
- `schema_family_marker`: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`

2. `page_boundary_summary`
- Authoritative boundary candidates: `Page` nodes
- Candidate page node count: `11`
- Stable page ids: `page_001` through `page_011`
- Source order preserved: `true`
- Titleblock `Page Count` signal `8` is not trusted as the split count
- Manifest warning: reported page count conflicts with actual page nodes
- Page-number signals are missing or ambiguous on 5 pages and non-contiguous overall

3. `page_split_plan`
- Split unit: one output XML asset per authoritative `Page` node
- Ordering rule: preserve source ordinal order
- Identity rule: assign `page_001` to `page_011` from source order
- Normalization rule: none; preserve page-local XML payload as-is
- Missing/duplicate label rule: use ordinal-backed ids and attach manifest warnings
- Fallback rule: single-page fallback not allowed
- Output placement rule: project-local only, never under `.workflow/`

4. `page_manifest`
- `total_pages`: `11`
- `manifest_warnings`:
  - Titleblock `Page Count` reports `8`, which conflicts with the authoritative `Page` node count
  - Several pages lack public page-number/page-count signals
  - Page numbering is non-contiguous and cannot be used as identity
- `page_entries`:
  - `page_001`: source ordinal `1`, page number signal `1`, count signal `8`, element count `29892`
  - `page_002`: source ordinal `2`, page number signal `2`, count signal `8`, element count `29974`
  - `page_003`: source ordinal `3`, page number signal missing/ambiguous, count signal missing/ambiguous, element count `57198`
  - `page_004`: source ordinal `4`, page number signal `5`, count signal `8`, element count `3210`
  - `page_005`: source ordinal `5`, page number signal `6`, count signal `8`, element count `4190`
  - `page_006`: source ordinal `6`, page number signal missing/ambiguous, count signal missing/ambiguous, element count `1434`
  - `page_007`: source ordinal `7`, page number signal missing/ambiguous, count signal missing/ambiguous, element count `1536`
  - `page_008`: source ordinal `8`, page number signal missing/ambiguous, count signal missing/ambiguous, element count `4404`
  - `page_009`: source ordinal `9`, page number signal `7`, count signal `8`, element count `7200`
  - `page_010`: source ordinal `10`, page number signal `8`, count signal `8`, element count `5808`
  - `page_011`: source ordinal `11`, page number signal missing/ambiguous, count signal missing/ambiguous, element count `2096`

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
- Binding identity: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Source checksum prefix: `74195c6c62bdcf3f`
- Source size: `12670307` bytes
- Real sample status: `used`
- Archived path: not included
- Raw XML body: not included
- Runtime absolute path: not included
- Provenance scope: structural metadata only, derived from boundary probe on `Page` nodes

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
- Note: role hints are non-authoritative routing hints only

8. `split_readiness`
- Ready for page-wise split handoff: `true`
- Boundary confidence: `high` for page-node enumeration, `low` for page numbering
- Identity confidence: `high` for stable ordinal ids, `low` for titleblock-derived ids
- Preservation requirement: page XML must remain unnormalized
- Output safety: public-safe structural metadata only
- Constraint check: no page payloads should be placed under `.workflow/`

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload:
  - page XML assets, one per `page_001` through `page_011`
  - page manifest
  - source provenance
  - manifest warnings
  - source-order index
- Handoff intent: normalize each page independently after split, without changing source order or page-local payloads

10. `open_questions`
- Should downstream normalization preserve the conflicting titleblock page count as metadata only, or surface it as a required warning field?
- Should pages with missing page-number signals receive an explicit `number_state` field, or is ordinal id alone sufficient?
- Is there a preferred public-safe checksum format for per-page assets in the next stage?
- Should `page_xml_normalize_spec_v0` receive the page role hints as advisory metadata or ignore them by default?