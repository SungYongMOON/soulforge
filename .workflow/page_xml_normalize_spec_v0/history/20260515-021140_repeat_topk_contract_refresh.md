# page_xml_normalize_spec_v0 repeat Top-K contract refresh

Calibration id: `20260515-021140_repeat_topk_contract_refresh`

Result: keep the primary workflow profile as `gpt-5.4 / medium / elf / auditor`.

This repeat calibration re-ran the saved Top-K profile family after the workflow contract added stronger `system_contract`, interface-group, annotation-variant, and harness-readiness expectations. The fixture remained public-safe structural metadata derived from the already public-safe `whole_xml_page_split_v0` calibration archive.

The frozen quality gate required per-page `page_module_spec_v0.yaml` sidecars to include `identity`, `module_definition`, `interfaces`, `performance`, `system_contract`, `composition`, and `evidence_review`; it also required `readiness_contract.harness_ready` to remain boolean `false` unless later source-backed enrichment exists.

`gpt-5.4 / medium / elf / auditor` passed the refreshed gate with the best balance of completeness and telemetry: 5,650 output tokens, 182 reasoning tokens, and 109.419 seconds in CLI proxy telemetry. `gpt-5.5 / xhigh / elf / auditor` remained a shadow with strong quality but higher proxy cost: 6,379 output tokens, 516 reasoning tokens, and 121.483 seconds.

The `gpt-5.4-mini` candidates were rejected for refreshed-contract gaps: one altered source identity, one left `system_contract` too empty, and one collapsed required per-page sidecar blocks into shared sections.

No raw XML bodies, generated page XML payloads, runtime absolute paths, `_workspaces` outputs, `_workmeta` raw truth, credentials, cookies, or private-state material were archived.
