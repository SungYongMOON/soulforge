**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `real_sample_used`: `true`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `high`
- `species`: `dwarf`
- `class`: `archivist`

**page_boundary_summary**
- Authoritative boundary candidates: `11` `Page` nodes.
- Boundary order policy: preserve source order exactly.
- Stable page ids: derive `page_001` through `page_011` from source order.
- Page-number signals are incomplete and non-contiguous.
- Titleblock `Page Count = 8` conflicts with the observed `11` page nodes and must be treated as a manifest warning, not a split count.
- Split behavior: one output page asset per detected `Page` node; no fallback to single-page mode.

**page_split_plan**
- Emit `11` page-local XML assets.
- Keep each page payload unnormalized.
- Preserve page-local XML content, order, and source boundary semantics exactly.
- Do not normalize refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity.
- Use ordinal suffixing only for identity and routing, not for semantic correction.
- Attach warning metadata for missing or ambiguous page-number signals.
- Keep all page assets project-local; do not place them under `.workflow/`.

**page_manifest**
- `page_001`: ordinal `1`, elements `29892`, page-number signal `1`, title signal `present_redacted`, warning `none`
- `page_002`: ordinal `2`, elements `29974`, page-number signal `2`, title signal `present_redacted`, warning `none`
- `page_003`: ordinal `3`, elements `57198`, page-number signal `missing_or_not_public`, title signal `present_redacted`, warning `number_missing`
- `page_004`: ordinal `4`, elements `3210`, page-number signal `5`, title signal `present_redacted`, warning `ordinal_mismatch_candidate`
- `page_005`: ordinal `5`, elements `4190`, page-number signal `6`, title signal `present_redacted`, warning `ordinal_mismatch_candidate`
- `page_006`: ordinal `6`, elements `1434`, page-number signal `missing_or_not_public`, title signal `missing_or_not_public`, warning `number_missing`
- `page_007`: ordinal `7`, elements `1536`, page-number signal `missing_or_not_public`, title signal `missing_or_not_public`, warning `number_missing`
- `page_008`: ordinal `8`, elements `4404`, page-number signal `missing_or_not_public`, title signal `missing_or_not_public`, warning `number_missing`
- `page_009`: ordinal `9`, elements `7200`, page-number signal `7`, title signal `present_redacted`, warning `ordinal_mismatch_candidate`
- `page_010`: ordinal `10`, elements `5808`, page-number signal `8`, title signal `present_redacted`, warning `ordinal_mismatch_candidate`
- `page_011`: ordinal `11`, elements `2096`, page-number signal `missing_or_not_public`, title signal `missing_or_not_public`, warning `number_missing`
- Manifest warning: titleblock count signal reports `8`, which conflicts with the observed page-node count `11`.

**page_index**
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

**source_provenance**
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `root_element`: `Design`
- `schema_family_marker`: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`
- `parser_mode`: `streaming_elementtree_boundary_probe`
- `total_element_count`: `186608`
- `max_depth`: `8`
- `schematic_count`: `1`
- `raw_xml_body_included`: `false`
- `real_sample_path_archived`: `false`

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
- Note: these are routing hints only, not authoritative classifications.

**split_readiness**
- `status`: `ready`
- `confidence`: `high`
- `blockers`: `none`
- `warnings`:
  - titleblock `Page Count` signal is unreliable for split count
  - page numbering is missing or ambiguous on 5 pages
  - source order must remain the only identity basis for page ids
- `output_policy`: project-local derived artifacts only; keep page assets out of `.workflow/`

**downstream_handoff**
- Target: `page_xml_normalize_spec_v0`
- Hand off:
  - per-page XML assets
  - page manifest
  - page index
  - source provenance
  - manifest warnings
  - page role hints
- Preserve:
  - source order
  - page-local payload boundaries
  - raw page XML without normalization
- Do not hand off:
  - raw XML bodies in the packet
  - host-specific paths
  - private project material

**open_questions**
- None blocking.
- Optional follow-up: whether downstream should surface the page-count conflict as a hard warning or a soft manifest note.