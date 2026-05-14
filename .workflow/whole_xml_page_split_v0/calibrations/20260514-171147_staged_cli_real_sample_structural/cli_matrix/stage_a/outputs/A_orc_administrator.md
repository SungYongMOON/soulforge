**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `orc`
- `class`: `administrator`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`

**page_boundary_summary**
- Authoritative boundary candidates: `Page` nodes
- Candidate page node count: `11`
- Stable id policy: derive `page_001` through `page_011` from source order
- Page-number signals are missing or non-contiguous on several pages
- Titleblock `Page Count = 8` is inconsistent with actual page nodes and must not be used as split count
- Source order is preserved as the split order

**page_split_plan**
- Split into `11` page-local XML assets, one per `Page` node
- Preserve each page’s XML payload without normalization
- Do not merge, renumber, or infer missing page identities
- Attach manifest warnings for:
  - conflicting titleblock page count
  - missing or ambiguous page-number signals
  - non-contiguous page numbering
- Use ordinal suffixing only for stable routing; do not rewrite source labels

**page_manifest**
- `page_001`: source ordinal `1`, element count `29892`, page number signal `1`, title signal `present_redacted`
- `page_002`: source ordinal `2`, element count `29974`, page number signal `2`, title signal `present_redacted`
- `page_003`: source ordinal `3`, element count `57198`, page number signal `missing_or_not_public`, title signal `present_redacted`
- `page_004`: source ordinal `4`, element count `3210`, page number signal `5`, title signal `present_redacted`
- `page_005`: source ordinal `5`, element count `4190`, page number signal `6`, title signal `present_redacted`
- `page_006`: source ordinal `6`, element count `1434`, page number signal `missing_or_not_public`, title signal `missing_or_not_public`
- `page_007`: source ordinal `7`, element count `1536`, page number signal `missing_or_not_public`, title signal `missing_or_not_public`
- `page_008`: source ordinal `8`, element count `4404`, page number signal `missing_or_not_public`, title signal `missing_or_not_public`
- `page_009`: source ordinal `9`, element count `7200`, page number signal `7`, title signal `present_redacted`
- `page_010`: source ordinal `10`, element count `5808`, page number signal `8`, title signal `present_redacted`
- `page_011`: source ordinal `11`, element count `2096`, page number signal `missing_or_not_public`, title signal `missing_or_not_public`

Manifest warnings:
- Titleblock `Page Count` reports `8`, but `11` `Page` nodes were observed
- Page numbering is incomplete and non-contiguous
- Several pages lack public-safe page-number/title signals

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
- Source binding identity: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- Real sample used: `true`
- Archived raw sample path included: `false`
- Raw XML body included: `false`
- Runtime absolute path included: `false`
- Boundary detection basis: `Page` node family
- Total element count: `186608`
- Schematic count: `1`
- Source preservation rule: keep page-local XML and source order intact

**page_role_hints**
- `page_001`: schematic content, off-page connector context, possible PCB context
- `page_002`: schematic content, off-page connector context, possible PCB context
- `page_003`: schematic content, off-page connector context, possible PCB context
- `page_004`: schematic content, off-page connector context, possible PCB context
- `page_005`: schematic content, off-page connector context, possible PCB context
- `page_006`: schematic content, hardware/material context, possible PCB context
- `page_007`: schematic content, hardware/material context, possible PCB context
- `page_008`: schematic content, hardware/material context, possible PCB context
- `page_009`: schematic content, off-page connector context, possible PCB context
- `page_010`: schematic content, off-page connector context, possible PCB context
- `page_011`: schematic content, hardware/material context, possible PCB context

**split_readiness**
- Ready for page-local split writing: `yes`
- Ready for normalization: `no`
- Ready for identity inference beyond source order: `no`
- Ready for page count trust on titleblock signal: `no`
- Ready for downstream page-wise normalization: `yes`, after split output is produced
- Single-page fallback: `disabled`

**downstream_handoff**
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff contents:
  - page XML assets in source order
  - page manifest
  - provenance context
  - manifest warnings
  - stable page ids
- Handoff expectation: normalize each page independently without altering split boundaries

**open_questions**
- Should downstream normalization preserve the observed non-contiguous page-number signals as metadata only, or attempt any page-label reconciliation?
- Should `page_003` and `page_006` through `page_008` be treated as unlabeled schematic sections for routing, or left entirely neutral?
- Is the titleblock `Page Count = 8` expected legacy metadata, or should it be recorded as a persistent anomaly in the calibration corpus?