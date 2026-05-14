# Page Module Trace Matrix v0

`page_module_trace_matrix_v0` is a public-safe governance workflow for building a row-level trace matrix over the current page XML lane.

It reads page/module sidecars, intake packets, source packets, materials packets, layout packets, quantitative overlays, and harness packets. It writes trace and review-planning outputs that preserve which claims are `source_confirmed`, `derived`, `review_required`, or `missing`.

It does not collect sources, mutate page assets, fill quantitative values, approve harness joins, complete verification, or make review decisions.

## Inputs

- `page_xml_normalize_spec_v0` page module sidecars, manifests, provenance, and downstream handoffs.
- `capture_xml_intake_library_v0` page-level or whole-asset intake observations and open questions.
- `official_source_packet_collect_v0` source manifests, source inventories, source gaps, owner follow-up records, and downstream-ready refs.
- `exp_xml_component_materials` component inventories, source packets, material manifests, and review queues.
- `component_pcb_layout_guide_extraction` layout guide manifests, source maps, extraction manifests, and layout source-gap packets.
- `page_quantitative_enrichment_v0` quantitative claims, source gaps, owner follow-up, harness-readiness deltas, and provenance.
- `xml_harness_composition_v0` connection candidates, blocked/review-required/candidate-safe/source-supported connection groups, open questions, and readiness packets.

## Outputs

- `trace_matrix.yaml`
- `evidence_authority_map.yaml`
- `trace_gap_register.yaml`
- `harness_trace_delta.yaml`
- `verification_seed_matrix.yaml`
- `review_gate_evidence_index.yaml`
- `trace_provenance.yaml`
- `boundary_review_note.md`

## Contract

- Every trace row has a stable `trace_row_id`.
- Every non-missing row has either an allowed evidence ref or a derivation rule with inputs.
- Every `missing` or `review_required` row has a gap, owner action, owning-workflow retry route, or downstream impact.
- Harness deltas carry claim-strength ceilings only; they do not approve final connections.
- Verification seed rows prepare later verification planning; they are not verification results.
- Review-gate index rows help later packets cite evidence; they are not review decisions.
- Upstream artifacts remain read-only. Repairs go back to the owning workflow.

## Boundary Rules

- The trace matrix is not source evidence authority.
- Owner-provided files are not evidence until the owning workflow re-indexes them with provenance, checksum, approval scope, and source-state evidence.
- Hidden references, verifier reports, accepted outputs, and repair packets cannot become construction evidence.
- Public canon contains only portable rules and templates. Raw project payloads, source files, vendor text, runtime absolute paths, `_workspaces` outputs, and private run truth stay outside `.workflow`.

## Current Maturity

`validation_level: pilot_ready_contract_only`

The package is registered as a first public-safe contract. A controlled project-local pilot is still required before claiming pilot-executed, usable, or production-ready behavior.

Best first pilot: the representative mixed page lane already used across the page workflows: one power-oriented page with source/material/layout/quantitative evidence, one interface-oriented page with connector or owner-map gaps, one ambiguous or channelized page, and one harness packet containing blocked and review-required connections.
