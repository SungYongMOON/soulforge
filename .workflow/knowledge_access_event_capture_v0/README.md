# Knowledge Access Event Capture v0

`knowledge_access_event_capture_v0` normalizes and analyzes lightweight
knowledge access ledger/register rows that record how existing Soulforge
knowledge refs are used by workflows, skills, missions, user tasks, tools, and
advisory handoffs.

The primary low-friction record is the ledger/register row appended during
ordinary work when an agent or tool actually uses a knowledge ref. This workflow
does not have to be run for every single access. Instead, it is the periodic or
explicit workflow that ingests those rows, normalizes actor/target/context/time
metadata, rolls up usage, analyzes relation strength, and routes review
candidates.

Early operation may use agent-authored manual ledger entries. Later automation
may append equivalent metadata-only events from routers, search, tooling, or
other approved access surfaces. In both cases, the row records why a ref was
used and where the resulting work output lives by reference only.

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

This workflow and its ledger/register rows do not own source truth, knowledge
payloads, ontology acceptance, archive execution, retire execution, or owner
decisions. Hot, warm, cold, stale, archive, retire, strong, weak, orphan, and
redundant labels are candidate signals until a project policy or owner decision
accepts the action.

## Current Maturity

`validation_level: reviewed_public_safe_draft`

The package is registered as public-safe workflow canon from a workflow-evolution
builder run. It has not been profile-optimized and has not run a private project
pilot yet.
