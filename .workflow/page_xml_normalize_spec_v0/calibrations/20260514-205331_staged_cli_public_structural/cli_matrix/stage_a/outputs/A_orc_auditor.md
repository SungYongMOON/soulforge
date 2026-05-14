1. `profile_metadata`
- `workflow_id`: `page_xml_normalize_spec_v0`
- `fixture_type`: `public_safe_downstream_structural_metadata_from_prior_split_calibration`
- `upstream_workflow`: `whole_xml_page_split_v0`
- `downstream_workflow`: `capture_xml_intake_library_v0`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `profile`: `model=gpt-5.4-mini`, `reasoning_effort=low`, `species=orc`, `class=auditor`

2. `normalization_input_summary`
- Preserve source order for 11 pages and assign stable ids `page_001` through `page_011`.
- Treat source page XML assets as immutable inputs; no rewrite, rename, normalization, or save-over of source XML.
- Do not trust titleblock page count/number signals as complete identity; use ordinal source order as the binding source.
- Page number signals are incomplete/non-contiguous; several pages are missing or ambiguous.
- Structural evidence suggests mixed schematic, connector-context, and material/hardware-context pages, but classification remains review-required.

3. `page_module_spec_plan`
- Emit one project-local `page_module_spec_v0.yaml` sidecar per source page.
- Each sidecar is keyed by stable page id and source checksum.
- Required blocks per sidecar: `identity`, `module_definition`, `interfaces`, `performance`, `composition`, `evidence_review`.
- Keep `normalized_page_ref` and `normalized_sha256` blank unless an explicit derived review variant exists.
- Treat module scope, classification, channelization, and local/internal labels as rationale only, not final truth.
- Do not infer connectivity, collect materials, attach MDD files, or register final library assets.

4. `page_module_spec_sidecars`
- `page_001`: sidecar planned; source sha256 `1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90`; likely schematic/offpage context; review-required.
- `page_002`: sidecar planned; source sha256 `4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee`; schematic/offpage context; weak evidence, unknown/review_required.
- `page_003`: sidecar planned; source sha256 `f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc`; dense schematic/offpage context; possible channelization review.
- `page_004`: sidecar planned; source sha256 `2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538`; sparse schematic/offpage context; unknown/review_required.
- `page_005`: sidecar planned; source sha256 `c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9`; sparse schematic/offpage context; unknown/review_required.
- `page_006`: sidecar planned; source sha256 `311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405`; hardware/material-context signal present; do not collect materials.
- `page_007`: sidecar planned; source sha256 `19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870`; hardware/material-context signal present; unknown/review_required.
- `page_008`: sidecar planned; source sha256 `34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b`; material-heavy context; review required.
- `page_009`: sidecar planned; source sha256 `e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227`; schematic/offpage context; unknown/review_required.
- `page_010`: sidecar planned; source sha256 `1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665`; schematic/offpage context; unknown/review_required.
- `page_011`: sidecar planned; source sha256 `fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3`; hardware/material-context signal present; review required.

5. `module_spec_manifest`
- Entries preserve source order exactly from `page_001` to `page_011`.
- Manifest keying should use `source_page_id` plus `source_sha256`.
- No derived normalized page refs are populated at this stage.
- No annotation variant is enabled by default.
- Manifest should stay project-local and outside `.workflow/`.

6. `module_spec_index`
- `page_001` -> first page, strong connector/control evidence.
- `page_002` -> second page, weak/generic visible evidence.
- `page_003` -> third page, dense schematic block evidence.
- `page_004` -> fourth page, sparse schematic evidence.
- `page_005` -> fifth page, sparse schematic evidence.
- `page_006` -> sixth page, hardware/material-context signal.
- `page_007` -> seventh page, hardware/material-context signal.
- `page_008` -> eighth page, material-heavy page signal.
- `page_009` -> ninth page, schematic/offpage context.
- `page_010` -> tenth page, schematic/offpage context.
- `page_011` -> eleventh page, hardware/material-context signal.

7. `provenance_update`
- Upstream split preserved source order and produced 11 stable page ids.
- Titleblock page count signal reported `8`, but actual page-node count is `11`; retain source-order identity instead of page-count trust.
- Page numbering is partially present and non-contiguous; treat missing or ambiguous values as warnings, not identity defects.
- Source page XML is immutable; provenance records should reference source checksums only.
- Downstream handoff should carry sidecars, manifest, and a compact intake packet only.

8. `normalization_warnings`
- Titleblock page count conflicts with actual page-node count.
- Page number signals are incomplete and non-contiguous.
- Several pages have weak or generic public-safe evidence; classification remains review-required.
- Material/hardware-context signals appear on some pages; do not infer or collect materials here.
- Unsupported quantitative or semantic claims should remain blank or rationale-only.
- No final asset registration occurs in this workflow.

9. `downstream_handoff`
- Target: `capture_xml_intake_library_v0`
- Deliverables: `page_module_spec_sidecars`, `module_spec_manifest`, compact `downstream_handoff`
- Preserve page order, stable ids, and source checksum binding.
- Keep all generated artifacts project-local and outside `.workflow/`.
- Do not attach raw XML, derived harnesses, or MDD materials.

10. `boundary_review`
- Public-safe only: no secrets, no runtime absolute paths, no raw source XML, no private project payloads.
- Source XML is read-only and not rewritten.
- No claim of final library registration or connectivity confirmation.
- No materials collection, no harness composition, no inferred PCB or schematic truth beyond review-required rationale.
- `normalized_page_ref` and `normalized_sha256` remain blank by default.

11. `open_questions`
- Which pages, if any, should receive an optional review-only annotation variant in a later pass?
- Should downstream intake treat material-heavy pages as separate review lanes or as the same module-spec family?
- Is there a project-specific convention for sidecar naming beyond `page_module_spec_v0.yaml` per page?