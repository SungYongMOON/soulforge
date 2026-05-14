profile_metadata
- workflow_id: `whole_xml_page_split_v0`
- calibration_id: `20260514-171147_staged_cli_real_sample_structural`
- profile: `gpt-5.4-mini`
- reasoning_effort: `low`
- species: `elf`
- class: `administrator`
- fixture_type: `public_safe_real_sample_derived_structural_metadata`
- source_binding_identity: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- source_sha256_prefix: `74195c6c62bdcf3f`
- source_size_bytes: `12670307`
- parser_mode: `streaming_elementtree_boundary_probe`

page_boundary_summary
- authoritative page boundary candidates: `11` `Page` nodes
- stable page ids: `page_001` through `page_011`
- source-order preservation: required
- titleblock `Page Count` signal: reported `8`, but conflicts with actual page nodes
- page-number signals: present on a subset only; missing or ambiguous on 5 pages
- split policy: preserve page-local XML without normalization
- fallback: single-page fallback not allowed

page_split_plan
- split into 11 page assets, one per source-order `Page` node
- assign ids strictly by ordinal source order, not by page-number signals
- keep each page payload byte-for-byte local to its page asset, with no XML normalization
- attach manifest warnings for:
  - titleblock count conflict
  - non-contiguous page-number signals
  - missing or ambiguous page identity on some pages
- do not place page XML assets under `.workflow/`
- hand off page assets together with manifest and provenance context

page_manifest
- total_pages: `11`
- manifest_warning: titleblock `Page Count = 8` does not match authoritative `Page` node count
- manifest_warning: page-number signals are incomplete and non-contiguous
- manifest_warning: some pages have no public page-number/title signals
- manifest_policy: source-order stable ids only
- manifest_policy: preserve page-local XML payloads without structural rewrite

page_index
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

source_provenance
- provenance_mode: real-sample-derived structural metadata only
- raw_xml_body_included: `false`
- runtime_absolute_path_included: `false`
- archived_sample_path: `not provided`
- root_element: `Design`
- schema_family_marker: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`
- total_element_count: `186608`
- schematic_count: `1`
- evidence_scope: boundary metadata, counts, and signal summaries only

page_role_hints
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

split_readiness
- ready: yes
- readiness_basis: 11 authoritative page nodes found
- readiness_basis: stable ordinals are derivable from source order
- readiness_basis: preservation-only split is compatible with fixture constraints
- blocking_issues: none for structural split output
- caution: downstream consumers must not infer complete page identity from titleblock count

downstream_handoff
- target_workflow: `page_xml_normalize_spec_v0`
- handoff_bundle: page XML assets, manifest, provenance context
- handoff_constraints:
  - preserve source order
  - do not normalize before handoff
  - keep public-safe metadata only
  - do not expose raw XML bodies in this packet
- handoff_notes:
  - use manifest warnings to resolve count conflict
  - keep page ids stable as `page_001` to `page_011`

open_questions
- should downstream normalization treat pages with missing page-number signals as fully anonymous, or only ordinally identified?
- should the manifest carry a compatibility note for the conflicting `Page Count = 8` signal, or is the warning field sufficient?
- should page role hints be propagated as soft routing metadata only, with no effect on normalization order?