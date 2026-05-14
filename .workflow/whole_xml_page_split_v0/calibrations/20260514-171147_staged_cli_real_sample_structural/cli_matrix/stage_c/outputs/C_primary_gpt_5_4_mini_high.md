**profile_metadata**
- `workflow_id`: `whole_xml_page_split_v0`
- `calibration_id`: `20260514-171147_staged_cli_real_sample_structural`
- `profile`: `gpt-5.4-mini` / `high` / `dwarf` / `archivist`
- `fixture_type`: `public_safe_real_sample_derived_structural_metadata`
- `real_sample_used`: `true`
- `parser_mode`: `streaming_elementtree_boundary_probe`
- `root_element`: `Design`
- `schema_family_marker`: `Cadence/OrCAD Capture Design EXP-like XML; host path redacted`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`

**page_boundary_summary**
- Authoritative boundary candidates are the 11 `Page` nodes in source order.
- The titleblock `Page Count` signal of `8` is a manifest warning only; it does not match the actual page-node count.
- Page-number signals are incomplete and non-contiguous, so page numbers cannot be used as stable identity.
- Stable ids must be derived as `page_001` through `page_011` from source order.

**page_split_plan**
- Emit 11 project-local page assets, one per `Page` node, preserving source order.
- Preserve each page XML payload exactly as encountered; do not normalize or rewrite structure.
- Assign stable ids by ordinal only: `page_001` to `page_011`.
- Carry forward warnings for titleblock mismatch and missing/non-contiguous page numbering.
- Do not use single-page fallback.

**page_manifest**
| id | ord | elements | partInst | wire | offpage | pnum | material | note |
|---|---:|---:|---:|---:|---:|---|---:|---|
| `page_001` | 1 | 29892 | 211 | 856 | 156 | `1` | 0 | schematic/offpage/possible pcb |
| `page_002` | 2 | 29974 | 211 | 851 | 155 | `2` | 0 | schematic/offpage/possible pcb |
| `page_003` | 3 | 57198 | 464 | 1689 | 36 | missing | 0 | schematic/offpage/possible pcb |
| `page_004` | 4 | 3210 | 11 | 99 | 81 | `5` | 0 | schematic/offpage/possible pcb |
| `page_005` | 5 | 4190 | 24 | 132 | 45 | `6` | 0 | schematic/offpage/possible pcb |
| `page_006` | 6 | 1434 | 11 | 50 | 0 | missing | 3 | schematic/material/possible pcb |
| `page_007` | 7 | 1536 | 12 | 56 | 0 | missing | 3 | schematic/material/possible pcb |
| `page_008` | 8 | 4404 | 39 | 123 | 0 | missing | 39 | schematic/material/possible pcb |
| `page_009` | 9 | 7200 | 58 | 220 | 23 | `7` | 0 | schematic/offpage/possible pcb |
| `page_010` | 10 | 5808 | 10 | 237 | 42 | `8` | 0 | schematic/offpage/possible pcb |
| `page_011` | 11 | 2096 | 16 | 65 | 0 | missing | 3 | schematic/material/possible pcb |

**page_index**
- `1 -> page_001` (`page_number_signal: 1`)
- `2 -> page_002` (`page_number_signal: 2`)
- `3 -> page_003` (`page_number_signal: missing_or_not_public`)
- `4 -> page_004` (`page_number_signal: 5`)
- `5 -> page_005` (`page_number_signal: 6`)
- `6 -> page_006` (`page_number_signal: missing_or_not_public`)
- `7 -> page_007` (`page_number_signal: missing_or_not_public`)
- `8 -> page_008` (`page_number_signal: missing_or_not_public`)
- `9 -> page_009` (`page_number_signal: 7`)
- `10 -> page_010` (`page_number_signal: 8`)
- `11 -> page_011` (`page_number_signal: missing_or_not_public`)

**source_provenance**
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `source_size_bytes`: `12670307`
- `real_sample_used`: `true`
- `real_sample_path_archived`: `false`
- `raw_xml_body_included`: `false`
- `runtime_absolute_path_included`: `false`
- `total_element_count`: `186608`
- `max_depth`: `8`
- Provenance is structural only; no raw page payloads are included here.

**page_role_hints**
- `schematic_content` + `offpage_connector_context` + `possible_pcb_context`: `page_001`, `page_002`, `page_003`, `page_004`, `page_005`, `page_009`, `page_010`
- `schematic_content` + `hardware_or_material_context` + `possible_pcb_context`: `page_006`, `page_007`, `page_008`, `page_011`
- These hints are routing only and are not authoritative for downstream normalization.

**split_readiness**
- Status: `ready_with_warnings`
- Ready conditions met: 11 authoritative page nodes found, source order is stable, page ids are deterministically derivable, and page-local XML must be preserved without normalization.
- Warnings to carry forward: titleblock `Page Count = 8` conflicts with actual page-node count `11`, and page-number signals are incomplete/non-contiguous.
- Single-page fallback is not allowed.

**downstream_handoff**
- Target: `page_xml_normalize_spec_v0`
- Handoff payload: `page_001` through `page_011` page-local XML assets, manifest, provenance, and warning context.
- Constraints: keep assets project-local, preserve source order, do not place page XML assets under `.workflow/`, and do not normalize before handoff.

**open_questions**
- None blocking for split generation.
- Optional downstream question: if page-level checksums become available later, should they be attached to the manifest or kept separate from the split packet?