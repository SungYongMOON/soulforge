1. `profile_metadata`
- `workflow_id`: `page_xml_normalize_spec_v0`
- `profile`: `gpt-5.4-mini`
- `reasoning_effort`: `low`
- `species`: `elf`
- `class`: `auditor`
- `scope`: `public-safe structural metadata only`
- `source_policy`: `read-only inputs, no XML mutation, no file ops, no runtime inspection`

2. `normalization_input_summary`
- Source order preserved for `page_001` through `page_011`
- Stable page ids derived from split order, not from titleblock page count/number signals
- Page count signal is inconsistent with observed page nodes
- Page number signals are partial, non-contiguous, and not authoritative
- Source assets treated as immutable inputs
- Primary downstream artifact set: one `page_module_spec_v0.yaml` sidecar per source page

3. `page_module_spec_plan`
- Create 11 per-page module spec sidecars keyed by stable page id
- Preserve page ordering exactly as received
- Keep `normalized_page_ref` and `normalized_sha256` blank
- Use review-required rationale for scope, class, channelization, and internal/external labeling
- Keep unsupported quantitative fields blank unless explicitly grounded by policy
- Do not register final assets or infer connectivity

4. `page_module_spec_sidecars`
- `page_001`: review-required schematic page with strong connector/control hints; include blank normalized refs; separate local internal candidates from external interfaces
- `page_002`: schematic page with weak visible evidence; keep classification conservative and unknown/review_required
- `page_003`: dense schematic page with repeated blocks; flag possible channelization review
- `page_004`: sparse schematic page; weak evidence, unknown/review_required
- `page_005`: sparse schematic page; weak evidence, unknown/review_required
- `page_006`: hardware/material-context signals present; do not collect materials; keep review-only labels
- `page_007`: hardware/material-context signals present; keep unknown/review_required
- `page_008`: material-heavy page signal; review-required, not confirmed external interface scope
- `page_009`: schematic page with off-page connector context; conservative review-only classification
- `page_010`: schematic page with off-page connector context; conservative review-only classification
- `page_011`: hardware/material-context signals present; keep unknown/review_required

5. `module_spec_manifest`
- `schema_version`: `page_module_spec_v0`
- `page_count`: `11`
- `page_order_policy`: `preserve_source_page_order`
- `page_id_policy`: `page_001..page_011`
- `input_binding`: `project_binding.whole_xml_source.sample_exp_capture_big_xml`
- `source_sha256_prefix`: `74195c6c62bdcf3f`
- `artifact_type`: `per-page sidecar manifest`
- `manifest_notes`: titleblock page count and page-number signals are inconsistent; do not use them as identity authority

6. `module_spec_index`
- `page_001` -> `project_page_xml_asset.page_001`
- `page_002` -> `project_page_xml_asset.page_002`
- `page_003` -> `project_page_xml_asset.page_003`
- `page_004` -> `project_page_xml_asset.page_004`
- `page_005` -> `project_page_xml_asset.page_005`
- `page_006` -> `project_page_xml_asset.page_006`
- `page_007` -> `project_page_xml_asset.page_007`
- `page_008` -> `project_page_xml_asset.page_008`
- `page_009` -> `project_page_xml_asset.page_009`
- `page_010` -> `project_page_xml_asset.page_010`
- `page_011` -> `project_page_xml_asset.page_011`

7. `provenance_update`
- Upstream workflow: `whole_xml_page_split_v0`
- Downstream workflow: `capture_xml_intake_library_v0`
- Provenance basis: split-derived, public-safe structural metadata only
- Page identity basis: source order plus stable page ids
- Page source checksums retained per page in the sidecar manifest
- No derived review XML variant was enabled, so normalized refs remain blank

8. `normalization_warnings`
- Titleblock page count signal conflicts with actual page-node count
- Page number signals are incomplete and non-contiguous
- Several pages have missing or non-public page-number/count signals
- Material-property signals appear on some pages; do not infer material collection scope here
- Local internal label examples are rationale hints only, not confirmed design truth
- Final asset registration is not performed in this step

9. `downstream_handoff`
- Target: `capture_xml_intake_library_v0`
- Handoff packet: `page_module_spec_sidecars`, `module_spec_manifest`, compact `downstream_handoff`
- Intent: intake normalized page-level module specs for library review
- Constraints: do not rewrite source XML, do not attach MDD, do not compose harness, do not claim final registration
- Emphasis: preserve stable page order and review-only classification boundaries

10. `boundary_review`
- Public-safe only: yes
- Source XML mutation: disallowed
- Raw XML inclusion: disallowed
- Runtime absolute paths: disallowed
- Secret material: absent and excluded
- Project-private material: excluded
- Workflow package placement: exclude generated artifacts from `.workflow/`
- External interface claims: review-required only, not confirmed truth

11. `open_questions`
- Should any page receive a stricter internal-scope vs external-interface review rubric before downstream intake?
- Is there a project-local preference for naming the `identity.registration_key` pattern in the sidecars, or should it remain purely derived from page id and source binding?
- Should a later review pass enable annotation variants, or remain disabled for this workflow line?