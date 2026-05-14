# Source Gap Follow-Up Packet v0

`source_gap_followup_packet_v0` is a public-safe workflow for consolidating unresolved source and evidence gaps after upstream hardware/XML workflows have already recorded them.

It does not collect sources, extract vendor content, fill quantitative values, or approve harness joins. It turns scattered gaps into deduplicated owner actions, safe source-batch intake templates, narrow retry triggers, and downstream unblock maps.

## Inputs

- `official_source_packet_collect_v0` source gaps, owner follow-up records, download-or-reuse manifests, and downstream readiness refs.
- `exp_xml_component_materials` source discovery gaps, material download manifests, and review queues.
- `component_pcb_layout_guide_extraction` layout source-gap packets, source maps, and extraction manifests.
- `page_quantitative_enrichment_v0` quantitative claims with missing/review/blocked states, source gaps, owner follow-up, and harness-readiness deltas.
- `xml_harness_composition_v0` blocked/review-required connections, harness open questions, owner follow-up, and composition readiness.

## Outputs

- `source_gap_followup_packet.yaml`
- `gap_dedup_index.yaml`
- `owner_action_queue.yaml`
- `owner_source_batch_manifest.template.yaml`
- `download_or_reuse_batch_manifest.yaml`
- `retry_trigger_register.yaml`
- `downstream_unblock_map.yaml`
- `boundary_review_note.md`

## Contract

- Every upstream gap maps to exactly one `aggregate_gap_id`.
- Duplicate owner asks are merged when they share the same bounded scope, source kind, gap family, and owner action.
- Distinct components, pages, interfaces, connection ids, source kinds, approval decisions, or owning workflows remain separate gaps.
- Owner actions must be concrete: provide a file, approve a local file, manually download an account-gated source, confirm identity or revision, approve terms, make a domain decision, accept not-applicable, or allow an agent retry.
- Retry triggers must target the narrowest owning workflow and name the evidence or decision that changed.
- Harness composition should not rerun until upstream source, materials, layout, or quantitative packets that feed it have been refreshed.

## Boundary Rules

- The follow-up packet is not source evidence authority.
- Owner-provided files are not source evidence until the owning workflow re-indexes them with provenance, checksum, approval scope, and source-state evidence.
- Unsupported source, material, layout, quantitative, and harness claims remain `blocked` or `review_required`.
- Agents must not read credentials, cookies, sessions, tokens, secret files, or private account state.
- Public canon contains only portable rules and templates. Raw project payloads, source files, vendor text, runtime absolute paths, `_workspaces` outputs, and private run truth stay outside `.workflow`.

## Current Maturity

`validation_level: pilot_executed_private_fixture`

The package has completed a controlled private pilot over mixed upstream gap sources. The first pilot deduplicated repeated source/material/layout/quantitative/harness gaps into stable aggregate gap ids, wrote bounded owner actions, and produced narrow retry triggers without taking over source authority.

The package is still conservative: broader fixture coverage and independent review are still required before claiming generally usable or production-ready behavior across more source families and owner-decision patterns.
