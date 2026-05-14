1. `profile_metadata`
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `human`
- `class`: `administrator`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`

2. `page_boundary_summary`
- Authoritative boundary candidates are the `Page` nodes.
- Total page nodes: `11`
- Stable ids should be derived by source order as `page_001` through `page_011`.
- Titleblock `Page Count = 8` is a manifest conflict, not the real split count.
- Page-number signals are incomplete and non-contiguous, so they are not a reliable identity source.
- Split policy is order-preserving and page-local XML must remain unnormalized.

3. `page_split_plan`
- Split into `11` project-local page assets in source order.
- Preserve each page's XML payload exactly as-is.
- Assign stable ids by ordinal only.
- Record duplicate/missing label cases as manifest warnings.
- Do not place page XML assets under `.workflow/`.
- Hand off page assets plus manifest/provenance context to `page_xml_normalize_spec_v0`.

4. `page_manifest`
- `page_001`: ordinal `1`, element_count `29892`, signals `page_number=1`, `page_count=8`, role_hint `schematic/offpage/possible_pcb`
- `page_002`: ordinal `2`, element_count `29974`, signals `page_number=2`, `page_count=8`, role_hint `schematic/offpage/possible_pcb`
- `page_003`: ordinal `3`, element_count `57198`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, role_hint `schematic/offpage/possible_pcb`
- `page_004`: ordinal `4`, element_count `3210`, signals `page_number=5`, `page_count=8`, role_hint `schematic/offpage/possible_pcb`
- `page_005`: ordinal `5`, element_count `4190`, signals `page_number=6`, `page_count=8`, role_hint `schematic/offpage/possible_pcb`
- `page_006`: ordinal `6`, element_count `1434`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, role_hint `schematic/material_or_hardware/possible_pcb`
- `page_007`: ordinal `7`, element_count `1536`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, role_hint `schematic/material_or_hardware/possible_pcb`
- `page_008`: ordinal `8`, element_count `4404`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, role_hint `schematic/material_or_hardware/possible_pcb`
- `page_009`: ordinal `9`, element_count `7200`, signals `page_number=7`, `page_count=8`, role_hint `schematic/offpage/possible_pcb`
- `page_010`: ordinal `10`, element_count `5808`, signals `page_number=8`, `page_count=8`, role_hint `schematic/offpage/possible_pcb`
- `page_011`: ordinal `11`, element_count `2096`, signals `page_number=missing_or_not_public`, `page_count=missing_or_not_public`, role_hint `schematic/material_or_hardware/possible_pcb`

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
- Derived from a real sample, but only structural metadata is exposed here.
- Source binding is recorded via an identity token, not via raw content or host path.
- The page split decision is grounded in `Page` node boundaries and source order.
- Page identity is stable by ordinal because page numbering is incomplete and conflicting.
- No raw XML, page payload, or runtime filesystem path is included in this packet.

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
- These hints are routing-only and non-authoritative.

8. `split_readiness`
- Ready for page-local split materialization.
- Preconditions satisfied: 11 page boundaries identified, stable ids assigned, source order preserved.
- Main warnings: titleblock page count conflict, non-contiguous page-number signals, several missing public page-number/title signals.
- Normalization is explicitly deferred to the downstream step.

9. `downstream_handoff`
- Target: `page_xml_normalize_spec_v0`
- Input bundle: page XML assets, page manifest, page index, source provenance, and manifest warnings.
- Handoff intent: normalize and validate per-page assets after split, without changing source-order identity.
- Do not rebind page ids to titleblock numbering.

10. `open_questions`
- Whether downstream normalization should preserve the observed page-number gaps as explicit annotations or only as warnings.
- Whether `page_006` through `page_008` should receive any additional material-context tags beyond the current routing hints.
- Whether the project-local runner expects a compact checksum per page asset in the manifest, or only source-level provenance.
- Whether duplicate title/page-count signals should be emitted as separate warnings or consolidated into one manifest warning.