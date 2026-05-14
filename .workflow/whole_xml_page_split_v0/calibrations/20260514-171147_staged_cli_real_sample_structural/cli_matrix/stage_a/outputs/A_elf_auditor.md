**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `elf`
- `class`: `auditor`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `parser_mode`: `streaming_elementtree_boundary_probe`

**page_boundary_summary**
- Authoritative split boundary candidates: `11` `Page` nodes
- Stable page ids must be derived by source order: `page_001` through `page_011`
- Titleblock `Page Count = 8` conflicts with the actual page-node count and must be treated as a manifest warning, not as the real split count
- Page-number signals are missing or non-contiguous for several pages, so page order is the primary identity signal
- Split policy is preserve-order, preserve-page-XML-as-is, no normalization

**page_split_plan**
- Split into `11` page-local XML assets in source order
- Assign ids sequentially from source order only
- Keep each page payload untouched
- Attach manifest warnings for:
  - titleblock count mismatch
  - missing or ambiguous page numbers
  - non-contiguous page numbering
- Do not infer or repair connectivity, nets, refdes, library identity, PCB/MDD pairing, or material semantics during split
- Handoff target: `page_xml_normalize_spec_v0`

**page_manifest**
- `page_001`: source ordinal `1`, page signal `1`, count signal `8`, warnings `none`
- `page_002`: source ordinal `2`, page signal `2`, count signal `8`, warnings `none`
- `page_003`: source ordinal `3`, page signals `missing_or_not_public`, warnings `page number absent`
- `page_004`: source ordinal `4`, page signal `5`, count signal `8`, warnings `non-contiguous numbering`
- `page_005`: source ordinal `5`, page signal `6`, count signal `8`, warnings `non-contiguous numbering`
- `page_006`: source ordinal `6`, page signals `missing_or_not_public`, warnings `title missing or not public`
- `page_007`: source ordinal `7`, page signals `missing_or_not_public`, warnings `title missing or not public`
- `page_008`: source ordinal `8`, page signals `missing_or_not_public`, warnings `title missing or not public`
- `page_009`: source ordinal `9`, page signal `7`, count signal `8`, warnings `non-contiguous numbering`
- `page_010`: source ordinal `10`, page signal `8`, count signal `8`, warnings `count signal conflicts with actual page set`
- `page_011`: source ordinal `11`, page signals `missing_or_not_public`, warnings `title missing or not public`
- Manifest-level warning: reported page count `8` conflicts with actual `11` page nodes

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
- Source is a real-sample-derived structural fixture
- Raw XML body was not included
- Runtime absolute path was not included
- Provenance is limited to structural metadata and source binding identity
- Page-level assets are project-local derived artifacts only and must not be placed under `.workflow/`
- Public-safe output may include ids, checksums, warnings, and structural refs only

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
- Role hints are non-authoritative routing hints only

**split_readiness**
- Ready for page-local split emission: yes
- Ready for normalization: no, deferred to downstream
- Ready for identity repair: no, because page numbering is incomplete/non-contiguous
- Ready for canonicalization: no, preserve source payload first
- Primary readiness constraint: preserve all page-local XML exactly as encountered

**downstream_handoff**
- Target workflow: `page_xml_normalize_spec_v0`
- Handoff payload:
  - ordered page assets for `page_001` through `page_011`
  - manifest with page ids, ordinals, and warnings
  - provenance context with source binding and checksum prefix
  - page role hints as advisory metadata only
- Handoff constraint:
  - do not include raw XML in this packet
  - do not relocate page assets under `.workflow/`
  - preserve page order and page-local boundaries

**open_questions**
- Should downstream normalization treat the `Page Count = 8` signal as a hard warning or a soft advisory?
- Is there any project-local convention for encoding missing page-number signals in the manifest beyond `missing_or_not_public`?
- Should `page_006` through `page_008` be grouped as a separate hardware/material-heavy slice in later routing, or kept purely ordinal?
