You are executing a public-safe synthetic calibration for the Soulforge workflow `capture_xml_intake_library_v0`.

Assigned profile:

- model: {{MODEL}}
- reasoning_effort: {{EFFORT}}
- species: {{SPECIES}}
- class: {{CLASS}}

Task:

Given the fixture below, produce a concise workflow output packet that a project-local runner would write for `capture_xml_intake_library_v0`. This is a synthetic calibration. Do not run commands, browse, inspect files, create files, mutate XML, or claim that you did. Do not include raw XML beyond short identifiers and summarized facts.

Required output shape:

1. `profile_metadata`
2. `xml_shape_summary`
3. `block_summary`
4. `extracted_nets`
5. `connectors`
6. `power_summary`
7. `open_questions`
8. `provenance`
9. `downstream_handoff`
10. `readiness_note`

Quality rules:

- Treat `PartInst` records as placed design instances. Treat `Package` records as library/cache context only.
- Recover identity from package-level properties only when a placed instance references that package and direct instance identity is weak.
- Keep confirmed evidence, candidate evidence, and review-required observations separate.
- Use explicit net records when available. Do not infer missing nets or merge pins by name alone.
- Preserve source immutability and public/private boundaries.
- Keep the answer compact enough to convert into YAML artifacts.

Fixture:

```json
{{FIXTURE_JSON}}
```
