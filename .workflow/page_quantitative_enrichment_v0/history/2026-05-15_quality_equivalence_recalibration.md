# 2026-05-15 Quality Equivalence Recalibration

The workflow optimizer skill was tightened so cheap candidates cannot become primary from minimum requirement satisfaction alone.

`page_quantitative_enrichment_v0` was rerun with a public-safe fixture set covering missing/review-required values, derived values, and approved-source conflicts. Actual `gpt-5.5` candidate profiles were included.

Result:

- Demoted previous `gpt-5.4 / low / elf / auditor` recommendation to `minimum_viable_pass`.
- Selected `gpt-5.4 / medium / dwarf / auditor` as the primary `quality_equivalent_pass`.
- Kept `gpt-5.5 / low / elf / auditor` as the quality shadow for maximum polish.

Exact CLI telemetry remains pending; the rerun conclusion is based on isolated candidate output quality, not exact token deltas.
