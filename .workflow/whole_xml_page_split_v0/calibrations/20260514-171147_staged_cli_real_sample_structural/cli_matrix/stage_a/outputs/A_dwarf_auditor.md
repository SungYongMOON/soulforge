1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `profile`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `dwarf`
- `class`: `auditor`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`

2. `page_boundary_summary`
- Authoritative boundary candidates: `Page` nodes
- Candidate page nodes found: `11`
- Stable page ids derived from source order: `page_001` through `page_011`
- Titleblock `Page Count` signal: `8`
- Manifest warning: titleblock count conflicts with observed page nodes and must not be used as the split count
- Page-number signals are missing or non-contiguous on several pages, so ordinal ids are the stable reference
- Source page order is preserved

3. `page_split_plan`
- Split into `11` page assets, one per `Page` node
- Preserve each page-local XML payload without normalization
- Keep original source order from `page_001` to `page_011`
- Do not merge, renumber, or infer missing page identity from titleblock values
- Emit manifest warnings for duplicated or ambiguous page-number/page-count signals
- Hand off page assets and context to `page_xml_normalize_spec_v0`

4. `page_manifest`
- `page_001`: source ordinal `1`, signals `page_number=1`, `page_count=8`, warning-free identity via ordinal
- `page_002`: source ordinal `2`, signals `page_number=2`, `page_count=8`, warning-free identity via ordinal
- `page_003`: source ordinal `3`, page-number/count signals missing or not public
- `page_004`: source ordinal `4`, signal mismatch: `page_number=5`, `page_count=8`
- `page_005`: source ordinal `5`, signal mismatch: `page_number=6`, `page_count=8`
- `page_006`: source ordinal `6`, page-number/count signals missing or not public, title signal missing or not public
- `page_007`: source ordinal `7`, page-number/count signals missing or not public, title signal missing or not public
- `page_008`: source ordinal `8`, page-number/count signals missing or not public, title signal missing or not public
- `page_009`: source ordinal `9`, signal mismatch: `page_number=7`, `page_count=8`
- `page_010`: source ordinal `10`, signals `page_number=8`, `page_count=8`
- `page_011`: source ordinal `11`, page-number/count signals missing or not public, title signal missing or not public
- Global warning: titleblock page count `8` conflicts with actual page-node count `11`

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
- Provenance class: real-sample-derived structural metadata
- Source body included: no
- Runtime absolute path included: no
- Root element: `Design`
- Schema family marker: Cadence/OrCAD Capture Design EXP-like XML, host path redacted
- Parser mode: streaming elementtree boundary probe
- Total element count: `186608`
- Schematic count: `1`
- Boundary basis: `Page` nodes only
- Public-safe scope: structural metadata, stable ids, warnings, and handoff context only

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
- Note: role hints are non-authoritative routing hints only

8. `split_readiness`
- Ready for page-level split emission: yes
- Ready for ordinal-based id assignment: yes
- Ready for source-order preservation: yes
- Ready for page-local XML preservation without normalization: yes
- Ready for downstream normalization handoff: yes
- Blocking issue: none
- Manifest caution: titleblock `Page Count=8` is inconsistent with authoritative `Page` node count `11`

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff contents: page XML assets, manifest context, provenance context, ordinal ids, and warnings
- Handoff constraints: keep page payloads intact, do not normalize connectivity or library identity at split stage
- Handoff ordering: preserve `page_001` through `page_011`
- Handoff note: page assets are project-local derived artifacts and must not be placed under `.workflow/`

10. `open_questions`
- Should downstream normalization treat the conflicting titleblock count `8` as purely advisory, or should it emit a hard validation warning?
- Are missing page-number signals on `page_003`, `page_006`, `page_007`, `page_008`, and `page_011` expected redactions or parser blind spots?
- Should `page_004` and `page_005` be flagged as probable renumbered pages because their page-number signals shift forward relative to source order?
- Is a compact per-page checksum expected in the runner packet, or is structural metadata alone sufficient for this calibration?