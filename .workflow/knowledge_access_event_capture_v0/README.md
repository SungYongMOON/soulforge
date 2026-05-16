# Knowledge Access Event Capture v0

`knowledge_access_event_capture_v0` records how existing Soulforge knowledge
refs are used by workflows, skills, missions, user tasks, tools, and advisory
handoffs.

The workflow is metadata-only. It captures actor, target knowledge ref, access
type, work context, timestamp, outcome/usefulness, and optional relation hints.
It then produces usage counts, candidate retention labels, relation-strength
analysis, and graph-update packets for later visualization.

## Outputs

- `knowledge_access_event_batch`
- `normalized_access_event_log`
- `usage_rollup`
- `retention_label_packet`
- `link_strength_analysis`
- `graph_update_packet`
- `orphan_redundancy_candidate_register`
- `boundary_review_note`

## Boundary

This workflow does not own source truth, knowledge payloads, ontology acceptance,
archive execution, retire execution, or owner decisions. Hot, warm, cold, stale,
archive, retire, strong, weak, orphan, and redundant labels are candidate signals
until a project policy or owner decision accepts the action.

## Current Maturity

`validation_level: reviewed_public_safe_draft`

The package is registered as public-safe workflow canon from a workflow-evolution
builder run. It has not been profile-optimized and has not run a private project
pilot yet.
