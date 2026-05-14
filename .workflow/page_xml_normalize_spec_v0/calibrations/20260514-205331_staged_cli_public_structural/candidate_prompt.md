You are executing a public-safe CLI calibration for the Soulforge workflow `page_xml_normalize_spec_v0`.

Assigned profile:

- model: {{MODEL}}
- reasoning_effort: {{EFFORT}}
- species: {{SPECIES}}
- class: {{CLASS}}

Task:

Given the fixture below, produce a concise workflow output packet that a project-local runner would write for `page_xml_normalize_spec_v0`. This is a calibration from public-safe structural metadata only. Do not run commands, browse, inspect files, create files, mutate XML, or claim that you did. Do not include raw XML, runtime absolute paths, generated project output payloads, credentials, cookies, or project-private material. Return only the output packet.

Required output shape:

1. `profile_metadata`
2. `normalization_input_summary`
3. `page_module_spec_plan`
4. `page_module_spec_sidecars`
5. `module_spec_manifest`
6. `module_spec_index`
7. `provenance_update`
8. `normalization_warnings`
9. `downstream_handoff`
10. `boundary_review`
11. `open_questions`

Quality rules:

- Preserve the 11-page source order and stable page ids `page_001` through `page_011` from the upstream split manifest.
- Treat source page XML assets as read-only immutable inputs; do not rewrite, normalize, rename, or save over source XML.
- The primary output is one `page_module_spec_v0.yaml` sidecar per source page, referenced by stable page id and checksum.
- Each sidecar must include the required blocks: `identity`, `module_definition`, `interfaces`, `performance`, `composition`, and `evidence_review`.
- Each sidecar must include interface containers `inputs`, `outputs`, `bidirectional`, and `passive_or_none` even when empty. Keep `local_internal_candidates` separate from external interface containers.
- Keep `normalized_page_ref` and `normalized_sha256` blank unless an explicit optional derived review XML variant exists. Annotation variants are disabled by default and review-only when enabled.
- Classification, module scope, channelization, local/internal labels, and function hints are review-required rationale, not confirmed design truth.
- Do not collect materials, attach MDD files, compose a harness, infer connectivity, or claim final library asset registration.
- Outputs are project-local derived artifacts only; never place generated sidecars, manifests, variants, calibration outputs, or raw XML under `.workflow/`.
- Handoff is to `capture_xml_intake_library_v0` with `page_module_spec_sidecars`, `module_spec_manifest`, and a compact `downstream_handoff` packet.

Fixture:

```json
{{FIXTURE_JSON}}
```

