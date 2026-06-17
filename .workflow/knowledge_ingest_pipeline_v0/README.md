# knowledge_ingest_pipeline_v0

`knowledge_ingest_pipeline_v0` is the registered, owner-gated orchestration
workflow for taking a bounded knowledge ingest request through:

1. optional copy-only unlock preprocessing,
2. `knowledge_source_audit_v0`,
3. `knowledge_wiki_pipeline_v0`,
4. `owner_decision_packet_v0` authority gates,
5. `post_development_review_gate_v0` closeout.

The preprocessing stage accepts either an existing `unlocked_output_manifest`
or an explicit owner-approved request to delegate copy-only unlock work to
`project_password_unlock_copy_only_v0`. It never brute-forces, guesses, exposes
passwords, or mutates originals.

## Boundary

- `default_route_safe: false`
- Owner-gated by design.
- Public workflow files are metadata and orchestration only.
- Google Drive upload, NotebookLM upload or query, public canon promotion,
  source-text extraction, index build, replacement, migration, and controlled
  internal source handling are not granted here.
- Stronger actions must route through `owner_decision_packet_v0` plus the
  downstream workflow or tool that actually owns that authority.
- Unlocked output manifests are input pointers, not replacement authority.

## Current State

`validation_level: structure_only_public_safe`

The workflow is registered as a reusable public package, but it does not claim
pilot execution, production readiness, default-route safety, or side-effect
authority.
