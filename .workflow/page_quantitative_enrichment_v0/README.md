# Page Quantitative Enrichment v0

`page_quantitative_enrichment_v0` is a public-safe workflow contract for adding a source-backed quantitative overlay to `page_module_spec_v0` sidecars. It sits after page normalization and optional intake/source/material/layout evidence, then before `xml_harness_composition_v0` decides whether a join can move out of blocked or review-required states.

The workflow does not replace the normalized sidecar. It writes an enrichment packet and patch-like overlay that preserve the original sidecar, source XML, intake packets, source packets, materials packets, and layout guide packets as read-only upstream authority.

## Inputs

- Required normalized page contract inputs: `page_module_spec_v0.yaml`, `module_spec_manifest.yaml`, `provenance_update.yaml`, and `downstream_handoff.yaml`.
- Optional evidence inputs: capture intake packets, official source packet manifests or inventories, component materials packets, layout guide packets, owner-recorded constraints, and previous harness blocker packets.
- Previous harness blockers may show which quantities matter, but they are not evidence for the values themselves.

## Outputs

- `quantitative_claims`: one record per source-confirmed, derived, review-required, missing, blocked, or conflicting quantitative slot.
- `enriched_sidecar_overlay`: patch-like overlay targeting existing `page_module_spec_v0` slots.
- `source_gap_report`: machine-readable missing values, missing sources, source conflicts, and blocked evidence chains.
- `owner_followup_needed`: concrete owner or source-acquisition actions that can unblock reruns.
- `harness_readiness_delta`: before/after readiness delta for harness consumers, not final composition approval.
- `enrichment_provenance` and optional `quantitative_enrichment_summary`.

## Claim States

- `source_confirmed`: a value is directly supported by approved evidence with a source ref, target slot, scope, and unit when unit-bearing.
- `derived`: a value is calculated from source-confirmed operands and keeps formula, operand refs, and derived status.
- `review_required`: evidence is plausible or relevant but not sufficient to fill the value.
- `missing`: no approved evidence supports the value, or source packets record the value as missing or blocked.
- `conflict`: approved or candidate evidence disagrees and owner/source review is required.

Missing values are first-class outputs. They should appear in `quantitative_claims`, `source_gap_report`, owner follow-up when actionable, and the harness-readiness delta when they affect safe composition.

## Boundary Rules

- Do not guess electrical quantities from names, labels, common defaults, memory, component reputation, or harness pressure.
- Do not promote values from unapproved snippets, mirrors, copied tables without provenance, or unapproved local files.
- Do not close a missing value with a placeholder or non-value.
- Do not overwrite the normalized sidecar or mutate source XML, intake packets, source packets, materials packets, layout guides, vendor collateral, or owner-provided sources.
- Do not claim final harness connection validity, final circuit synthesis, or automatic source-supported composition.

## Current Maturity

`validation_level: pilot_executed_private_fixture`

The package has completed controlled private helper-card pilots across three representative page families: a power page (`lt8624s`), an interface-heavy page (`ext_io_conn`), and an ambiguous/channelized page (`02_4ch_vga_ch5_8`). The pilots proved that the workflow can write bounded source-backed device-scope quantitative rows while preserving page-scope missing or review-required gaps instead of guessing.

The package is still conservative: it does not yet have a calibrated execution profile, and the optional overlay and harness-readiness-delta paths still need explicit pilot coverage before any stronger maturity claim.
