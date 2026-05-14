1. `profile_metadata`
- `workflow_id`: `page_xml_normalize_spec_v0`
- `profile`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `orc`
- `class`: `archivist`
- `scope`: `public-safe structural metadata only`
- `source_policy`: `read-only, no mutation, no runtime inspection, no raw XML`

2. `normalization_input_summary`
- `upstream_workflow`: `whole_xml_page_split_v0`
- `downstream_workflow`: `capture_xml_intake_library_v0`
- `source_binding_identity`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `root_element`: `Design`
- `page_boundary_node_family`: `Page`
- `page_count`: `11`
- `page_order_policy`: preserve source order
- `stable_page_id_policy`: `page_001` through `page_011` from source order
- `titleblock_signals`: conflicting and incomplete, not authoritative
- `page_number_signals`: non-contiguous and partially missing, not authoritative

3. `page_module_spec_plan`
- Generate one `page_module_spec_v0.yaml` sidecar per source page.
- Preserve page order exactly as received.
- Keep `normalized_page_ref` and `normalized_sha256` blank.
- Treat classification, scope, channelization, and function hints as review-required rationale only.
- Keep source page XML immutable and separate from derived sidecars.
- Do not infer final library registration, connectivity, or harness behavior.
- Structure each sidecar with required blocks: `identity`, `module_definition`, `interfaces`, `performance`, `composition`, `evidence_review`.
- Ensure each `interfaces` block contains: `inputs`, `outputs`, `bidirectional`, `passive_or_none`.
- Keep `local_internal_candidates` separate from external interface containers.

4. `page_module_spec_sidecars`
- `page_001`
  - `source_page_order`: `1`
  - `source_sha256`: `1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90`
  - `source_page_ref`: `project_page_xml_asset.page_001`
  - `review_signal`: likely schematic with off-page connector context
  - `local_internal_candidates`: `SW`, `FB`, `PG`
  - `module_scope`: unknown / review_required
- `page_002`
  - `source_page_order`: `2`
  - `source_sha256`: `4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee`
  - `source_page_ref`: `project_page_xml_asset.page_002`
  - `review_signal`: schematic page, weak visible evidence
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / review_required
- `page_003`
  - `source_page_order`: `3`
  - `source_sha256`: `f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc`
  - `source_page_ref`: `project_page_xml_asset.page_003`
  - `review_signal`: dense schematic with repeated blocks
  - `local_internal_candidates`: `FB`, `SET`, `VIOC`
  - `module_scope`: unknown / possible channelized grouping
- `page_004`
  - `source_page_order`: `4`
  - `source_sha256`: `2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538`
  - `source_page_ref`: `project_page_xml_asset.page_004`
  - `review_signal`: sparse schematic with many off-page connectors
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / review_required
- `page_005`
  - `source_page_order`: `5`
  - `source_sha256`: `c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9`
  - `source_page_ref`: `project_page_xml_asset.page_005`
  - `review_signal`: schematic with connector context
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / review_required
- `page_006`
  - `source_page_order`: `6`
  - `source_sha256`: `311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405`
  - `source_page_ref`: `project_page_xml_asset.page_006`
  - `review_signal`: hardware/material-context signals present
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / do not collect materials
- `page_007`
  - `source_page_order`: `7`
  - `source_sha256`: `19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870`
  - `source_page_ref`: `project_page_xml_asset.page_007`
  - `review_signal`: hardware/material-context signals present
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / review_required
- `page_008`
  - `source_page_order`: `8`
  - `source_sha256`: `34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b`
  - `source_page_ref`: `project_page_xml_asset.page_008`
  - `review_signal`: material-heavy page with PCB footprint signals
  - `local_internal_candidates`: `PG`
  - `module_scope`: unknown / review_required
- `page_009`
  - `source_page_order`: `9`
  - `source_sha256`: `e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227`
  - `source_page_ref`: `project_page_xml_asset.page_009`
  - `review_signal`: schematic page with off-page connectors
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / review_required
- `page_010`
  - `source_page_order`: `10`
  - `source_sha256`: `1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665`
  - `source_page_ref`: `project_page_xml_asset.page_010`
  - `review_signal`: schematic page with connector context
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / review_required
- `page_011`
  - `source_page_order`: `11`
  - `source_sha256`: `fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3`
  - `source_page_ref`: `project_page_xml_asset.page_011`
  - `review_signal`: hardware/material-context signals present
  - `local_internal_candidates`: none recorded
  - `module_scope`: unknown / review_required

5. `module_spec_manifest`
- `schema_version`: `page_module_spec_v0`
- `primary_per_page_file`: `page_module_spec_v0.yaml`
- `page_count`: `11`
- `ordered_pages`:
  - `page_001`
  - `page_002`
  - `page_003`
  - `page_004`
  - `page_005`
  - `page_006`
  - `page_007`
  - `page_008`
  - `page_009`
  - `page_010`
  - `page_011`
- `manifest_notes`:
  - source order is authoritative
  - titleblock page count is conflicting
  - page numbers are not a complete identity
  - sidecars are project-local derived artifacts only

6. `module_spec_index`
- `page_001`: `review_required`, schematic/off-page context, local labels observed
- `page_002`: `review_required`, schematic context, weak evidence
- `page_003`: `review_required`, dense schematic, possible channelization
- `page_004`: `review_required`, sparse schematic, many off-page connectors
- `page_005`: `review_required`, schematic context
- `page_006`: `review_required`, hardware/material context
- `page_007`: `review_required`, hardware/material context
- `page_008`: `review_required`, material-heavy with PCB footprints
- `page_009`: `review_required`, schematic/off-page context
- `page_010`: `review_required`, schematic/off-page context
- `page_011`: `review_required`, hardware/material context

7. `provenance_update`
- `lineage`: `whole_xml_page_split_v0 -> page_xml_normalize_spec_v0 -> capture_xml_intake_library_v0`
- `input_state`: immutable split-page XML assets, no rewrite
- `derived_state`: sidecar specs only
- `identity_basis`: stable source order plus source page ids
- `checksum_basis`: per-page source sha256 values from upstream split manifest
- `blank_fields_policy`: `normalized_page_ref` and `normalized_sha256` remain blank
- `registration_status`: no final asset registration performed here

8. `normalization_warnings`
- titleblock page count signal conflicts with actual page nodes
- page number signals are incomplete and non-contiguous
- page identity must not rely on page-number labels alone
- classification hints are rationale only, not confirmed truth
- material/property signals appear on some pages, but materials must not be collected here
- no connectivity inference, harness composition, or MDD attachment should be attempted
- derived outputs must stay outside `.workflow/`

9. `downstream_handoff`
- `target_workflow`: `capture_xml_intake_library_v0`
- `handoff_payload`: `page_module_spec_sidecars`, `module_spec_manifest`, `downstream_handoff`
- `handoff_scope`: compact, public-safe structural metadata only
- `consumer_expectation`: ingest sidecars by stable page id and checksum
- `consumer_constraints`: do not assume normalized XML variants or final library registration
- `recommended_next_action`: intake sidecars, then continue review against capture-library rules

10. `boundary_review`
- public-safe only: yes
- source XML mutated: no
- raw XML included: no
- runtime absolute paths included: no
- credentials or secrets included: no
- project-private material included: no
- generated project outputs included: no
- `.workflow/` output placement: avoided
- final asset registration claimed: no
- connectivity or materials inference claimed as truth: no

11. `open_questions`
- Which pages, if any, should later be grouped into a shared module scope after review?
- Are the observed local labels like `SW`, `FB`, `PG`, `SET`, and `VIOC` intended as internal annotations or only weak evidence?
- Should any page later receive an optional review-only derived variant, or remain sidecar-only?
- Is the downstream intake expecting any additional public-safe index fields beyond page id, order, and checksum?