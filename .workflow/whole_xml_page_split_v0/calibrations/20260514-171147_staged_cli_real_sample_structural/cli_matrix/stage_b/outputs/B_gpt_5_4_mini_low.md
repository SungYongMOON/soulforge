1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `dwarf / archivist`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`
- `root_element`: `Design`
- `schema_family_marker`: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`

2. `page_boundary_summary`
- Authoritative page boundary candidates: `11` `Page` nodes
- Stable page ids must be derived from source order: `page_001` through `page_011`
- Titleblock `Page Count` signal reports `8`, but this conflicts with the observed page nodes and must be treated as a manifest warning
- Page-number signals are incomplete and non-contiguous; they cannot be used as the primary identity source
- Source page order is the only stable boundary basis for split output

3. `page_split_plan`
- Preserve source order exactly
- Emit one page XML asset per authoritative `Page` node
- Do not normalize page XML during split
- Do not infer or repair page numbering
- Use ordinal ids `page_001` to `page_011`
- Attach manifest warnings for:
  - conflicting titleblock count
  - missing/ambiguous page-number signals
  - non-contiguous page numbering
- Downstream handoff target: `page_xml_normalize_spec_v0`

4. `page_manifest`
- `page_001`: source ordinal `1`, element count `29892`
- `page_002`: source ordinal `2`, element count `29974`
- `page_003`: source ordinal `3`, element count `57198`
- `page_004`: source ordinal `4`, element count `3210`
- `page_005`: source ordinal `5`, element count `4190`
- `page_006`: source ordinal `6`, element count `1434`
- `page_007`: source ordinal `7`, element count `1536`
- `page_008`: source ordinal `8`, element count `4404`
- `page_009`: source ordinal `9`, element count `7200`
- `page_010`: source ordinal `10`, element count `5808`
- `page_011`: source ordinal `11`, element count `2096`
- manifest warning: titleblock `Page Count = 8` conflicts with `11` observed page nodes
- manifest warning: page-number identity is incomplete and non-contiguous
- manifest warning: page-local XML must be preserved without normalization

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
- Derived from a real sample structural metadata fixture, not from raw XML body inspection
- Source binding identity is recorded, but runtime absolute paths are intentionally omitted
- Raw payloads are not included
- Structural signals used:
  - page boundary node family: `Page`
  - page count candidate: `11`
  - titleblock count signal: `8` with conflict
  - source order preserved as the stable boundary basis

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
- Role hints are non-authoritative routing hints only

8. `split_readiness`
- Ready to split by authoritative `Page` boundaries
- Ready to emit stable ids from source order
- Ready to preserve page-local XML payloads unchanged
- Not ready for normalization inside this stage
- Not ready to trust titleblock page count as a split authority
- Not ready to infer missing page identity from page-number signals

9. `downstream_handoff`
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff package should include:
  - page XML assets for `page_001` through `page_011`
  - page manifest
  - source provenance
  - manifest warnings
  - source-order index
- Do not place page XML assets under `.workflow/`
- Keep handoff project-local only

10. `open_questions`
- Should downstream normalization preserve or rewrite any page-local title metadata, or remain strictly structural?
- Should the `Page Count = 8` conflict be surfaced as a hard warning or soft warning in runner output?
- Is there a preferred checksum format for page assets beyond stable ordinal ids?
- Should page role hints be emitted as machine-readable tags or free-text metadata in the runner packet?