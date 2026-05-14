You are executing a public-safe CLI calibration for the Soulforge workflow `whole_xml_page_split_v0`.

Assigned profile:

- model: {{MODEL}}
- reasoning_effort: {{EFFORT}}
- species: {{SPECIES}}
- class: {{CLASS}}

Task:

Given the fixture below, produce a concise workflow output packet that a project-local runner would write for `whole_xml_page_split_v0`. This is a calibration from real-sample-derived structural metadata only. Do not run commands, browse, inspect files, create files, mutate XML, or claim that you did. Do not include raw XML, runtime absolute paths, raw page payloads, credentials, cookies, or project-private material.

Required output shape:

1. `profile_metadata`
2. `page_boundary_summary`
3. `page_split_plan`
4. `page_manifest`
5. `page_index`
6. `source_provenance`
7. `page_role_hints`
8. `split_readiness`
9. `downstream_handoff`
10. `open_questions`

Quality rules:

- Treat the fixture's `Page` nodes as the authoritative boundary candidates: there are 11 page nodes.
- Do not trust the titleblock `Page Count` value of 8 as the real split count; record it as a manifest warning.
- Derive stable ids as `page_001` through `page_011` from source order because page-number signals are missing/non-contiguous.
- Preserve page order and page-local XML payloads; do not normalize XML, refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity.
- Outputs are project-local derived artifacts only; never place page XML assets under `.workflow/`.
- Public/reusable artifacts may contain compact structural metadata, ids, checksums, warnings, and refs, but not raw XML bodies or host-specific paths.
- Page role hints are non-authoritative routing hints only.
- Handoff is to `page_xml_normalize_spec_v0` with page XML assets plus manifest/provenance context.

Fixture:

```json
{{FIXTURE_JSON}}
```
