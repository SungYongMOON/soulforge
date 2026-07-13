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

Early operation may use agent-authored manual ledger entries. Persisted metadata
RAG and source-text answer runs now append `retrieve` rows for evidence selected
into answer context. Other routers, Wiki reads, ordinary file reads, citations,
and project applications still require an explicit writer integration or
record. In every case, the row records why a ref was used and where the resulting
work output lives by reference only.

`retrieve`, `read`, `cite`, and `apply` are intentionally distinct. A search hit
does not prove that a source was applied to a decision or artifact. Retrieval
rows include only opaque/exact refs, run/rank metadata, project/gate/branch when
known, and output refs; raw questions and source/chunk bodies stay out of the
ledger.

Automatic RAG answer writes create a metadata-only pending receipt before the
answer artifact, append the validated event batch, and then mark the receipt
recorded after read-back verification. Receipts stay in the matching
`_workmeta/<project|system>/reports/knowledge_access/receipts/**` history owner,
not beside `_workspaces` payloads. A failed append leaves the receipt pending
for explicit reconciliation into the recovering PC's separate shard. Persisted
answer run paths are exclusively reserved and occurrence-immutable, and each
event carries an output revision hash. Event identity and logical dedupe ignore
physical ledger or shard location; the validator recomputes logical dedupe keys.

## Outputs

- `knowledge_access_event_batch`
- `normalized_access_event_log`
- `usage_rollup`
- `retention_label_packet`
- `link_strength_analysis`
- `knowledge_accumulation_delta`
- `graph_update_packet`
- `orphan_redundancy_candidate_register`
- `boundary_review_note`

## Boundary

This workflow and its ledger/register rows do not own source truth, knowledge
payloads, ontology acceptance, archive execution, retire execution, or owner
decisions. Hot, warm, cold, `cold_essential`, stale, archive, retire, strong, weak, orphan, and
redundant labels are candidate signals until a project policy or owner decision
accepts the action.

Retention combines usage with authority, applicability, project dependencies,
uniqueness, lifecycle/conflict state, and access-log coverage. Low use alone is
never an archive or retire authority. Important low-use knowledge is a
`cold_essential` candidate; an applicable ref with no retrieval is a search
coverage review candidate.

Knowledge accumulation delta rows are also candidate signals. They may describe
metadata-only changes in use, relation strength, concept linkage, or review
route, but they do not accept knowledge, mutate ontology, or promote canon.

## Current Maturity

`validation_level: reviewed_public_safe_draft`

The package is registered as public-safe workflow canon from a workflow-evolution
builder run. Its first public-safe writer integration covers persisted RAG answer
runs. It has not been profile-optimized, does not yet observe all Wiki/general
reads or project applications, and has not completed the exact-source-revision
private project pilot.
