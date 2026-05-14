1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `orc`
- `class`: `auditor`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`

2. `page_boundary_summary`
- Authoritative boundary candidates: `11` `Page` nodes in source order
- Stable ids: `page_001` through `page_011`
- Page-number signals are missing or non-contiguous on several pages, so they are not suitable as primary identity
- Titleblock `Page Count` signal reports `8`, but this conflicts with the observed `11` page nodes and must be treated as a manifest warning
- Split mode: preserve source order, preserve page-local XML exactly, no normalization

3. `page_split_plan`
- Emit one project-local page asset per source `Page` node
- Assign `page_001` to `page_011` strictly by source order
- Keep page payload boundaries unchanged
- Attach per-page manifest records with counts, ordinal, and warning flags
- Do not infer missing pages from titleblock count
- Do not merge, renumber, or normalize any page content
- Hand off page XML assets plus manifest/provenance context to `page_xml_normalize_spec_v0`

4. `page_manifest`
- `page_001`: ordinal `1`, elements `29892`, signals `page_number=1`, `page_count=8`, warning `none`
- `page_002`: ordinal `2`, elements `29974`, signals `page_number=2`, `page_count=8`, warning `none`
- `page_003`: ordinal `3`, elements `57198`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, warning `identity signal incomplete`
- `page_004`: ordinal `4`, elements `3210`, signals `page_number=5`, `page_count=8`, warning `page number discontinuity`
- `page_005`: ordinal `5`, elements `4190`, signals `page_number=6`, `page_count=8`, warning `page number discontinuity`
- `page_006`: ordinal `6`, elements `1434`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, warning `material context present`
- `page_007`: ordinal `7`, elements `1536`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, warning `material context present`
- `page_008`: ordinal `8`, elements `4404`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, warning `material context present`
- `page_009`: ordinal `9`, elements `7200`, signals `page_number=7`, `page_count=8`, warning `page number discontinuity`
- `page_010`: ordinal `10`, elements `5808`, signals `page_number=8`, `page_count=8`, warning `titleblock count conflicts with actual page set`
- `page_011`: ordinal `11`, elements `2096`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, warning `identity signal incomplete`
- Manifest warning: reported titleblock count `8` does not match authoritative page-node count `11`

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
- Source type: real sample derived structural metadata
- Source binding: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Structural probe mode: `streaming_elementtree_boundary_probe`
- Root element: `Design`
- Schema family marker: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`
- No raw XML body included
- No runtime absolute path included
- No archived sample path included

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

8. `split_readiness`
- Ready for page-asset emission: `yes`
- Readiness basis: authoritative `Page` node boundaries are present and countable
- Blocking issues: `none`
- Cautions:
  - titleblock count signal is unreliable
  - page-number identity is incomplete and non-contiguous
  - page-local XML must be preserved without normalization

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload scope:
  - page XML assets keyed by `page_001` to `page_011`
  - manifest records
  - provenance context
  - warnings about count mismatch and page-number ambiguity
- Handoff rule: keep page order and page-local payloads intact
- Handoff constraint: do not place page XML assets under `.workflow/`

10. `open_questions`
- Should downstream normalization treat `page_003`, `page_006`, `page_007`, `page_008`, and `page_011` as metadata-sparse pages requiring special routing?
- Should the `Page Count = 8` signal be preserved only as a warning, or also surfaced as a dedicated manifest field in the project-local runner output?
- Is there a preferred compact checksum format for page-local payload references in this calibration family?
