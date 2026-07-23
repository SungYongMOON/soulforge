# Structured PC WorkSession source foundation v1

## State

This slice is additive and feature OFF. It does not add an HTTP/MCP route,
production binding, scheduler, live migration, or official ERP completion
writer. The existing `erp_mcp_work_session` one-shot publisher remains a
separate compatibility record and is not reinterpreted as a lifecycle event.

`createErpMcpService()` initializes the new tables only when
`workSessionLifecycleEnabled: true` is supplied explicitly. The production
default is `false`.
Every exported lifecycle method checks this gate before account, item, project,
session, or receipt lookup, so disabled calls neither disclose domain state nor
initialize lifecycle tables.

## Server lifecycle contract

`src/work_session_lifecycle.mjs` owns the synthetic lifecycle store and the
strict metadata-only command validator.

- A start is bound to explicit `item_id`, `project_id`, `assignment_epoch`,
  account, registered node, and `ws_thread_sha256:<digest>` opaque thread ref.
  Raw provider thread IDs are not accepted. Client `started_at` is retained only
  as the occurrence clock; immutable server `accepted_at` is the receipt
  `recorded_at` and lifecycle SLA clock.
- A partial unique index permits one active primary for
  `{assignment_epoch, account}`.
- Events are a digest chain: accepted start at sequence 0, zero or more ordered
  checkpoints, then one terminal closeout. A gap is held without projection
  advance. A sequence/digest conflict is quarantined. A terminal or binding
  mismatch is rejected.
- Same idempotency key, sequence, and digest returns `duplicate` with the
  original accepted receipt ID and digest. This proof is distinct from a new
  accepted projection.
- Terminal closeout kinds are `completed_candidate`, `blocked`, `handoff`, and
  `abandoned`. Only `completed_candidate` requires and may carry a
  `task_completion` proposal whose authority state is `proposal_only`; the
  other terminal kinds reject a proposal.
- An active session cannot be superseded. Node/thread handoff first accepts a
  terminal `closeout_kind=handoff` without a completion proposal. A successor
  start may then supersede only that exact same account, item, project, and
  assignment-epoch predecessor. Cross-task, cross-assignment, direct-active,
  non-handoff, already-consumed, or omitted predecessors are rejected whenever
  the same account and assignment epoch already has a session. A first-ever
  start in a new assignment epoch needs no predecessor. The two records keep
  immutable predecessor/successor links.
- Every accepted event persists
  `task_delta=history_delta=knowledge_delta=0` and
  `official_completion=false`; `core_item.status` is not written.
- Missing-closeout candidates are computed only from accepted active starts
  whose server `accepted_at` is older than the configured synthetic SLA.
  Backdated or future client `started_at` values cannot trigger or evade the
  cutoff. A client-local pending outbox entry is not a server missing-closeout
  fact.

Receipt statuses are `accepted`, `duplicate`, `held_gap`, `quarantined`, and
`rejected`. Only the first two can prove accepted server durability, and a
duplicate must identify the earlier accepted receipt and exact event digest.

## Client outbox contract

`src/work_session_outbox.mjs` requires an explicit absolute client-local
directory. It does not infer a drive, share, cloud folder, or runtime binding.
Each command is normalized, metadata-checked, content-digested, written through
an exclusive temporary file, file-fsynced, and atomically renamed.

The persisted states are:

1. `pending`
2. `accepted`
3. compacted absence

`held_gap`, `quarantined`, and `rejected` receipts are recorded as the latest
receipt but remain `pending`. `accepted`, or `duplicate` with the earlier
accepted receipt/digest proof, is only structurally eligible. Before changing
state, and again before deletion, the outbox requires an injected trusted
verifier. The internal feature-OFF server verifier reconstructs the expected
receipt from the accepted DB row and validates account, session, sequence,
command kind, digest, idempotency key, original receipt, and deterministic
duplicate proof. Fabricated structurally valid receipts remain pending.
Deletion is refused until that verified accepted ack is durably stored.
Restart reopens the same entry, idempotency key, command digest, attempt count,
and ack.

Exact production path ownership, directory-fsync support, at-rest encryption,
retention, backup, node enrollment, and operational missing-closeout SLA remain
`VERIFY_HP` activation gates. Production receipt authentication, transport
integrity, verifier binding, and key ownership also remain `VERIFY_HP`. This
feature-OFF slice must not be treated as a team rollout receipt.

## Capture boundary

The JSON schemas in `docs/contracts/` and the runtime validator use exact
allowlists. Unknown or raw fields are rejected, including whole
conversation/task chat, raw conversation/completion hook, transcript-begin
markers, task-chat completion hooks, screen capture/recording,
keyboard/keystroke capture or logging, broad OS
activity/monitoring/surveillance, credential-like values, Windows/UNC/private
POSIX/`_workspaces`/`file://` paths, and multi-turn user/assistant dialogue.
Runtime summary rejection is compiled from the exported
`WORK_SESSION_BOUNDED_SUMMARY_FORBIDDEN_PATTERN`; the JSON Schema stores that
exact same string. The dependency-free test asserts byte-for-byte equality,
compiles the schema pattern, and evaluates the shared sentinel set. Only
bounded summaries and opaque typed refs are eligible.

## Focused validation

```powershell
node --test ui-workspace/apps/dev-erp/test/work_session_source_foundation.test.mjs
node --test ui-workspace/apps/dev-erp/test/erp_mcp_service.test.mjs
node --test ui-workspace/apps/dev-erp/test/erp_mcp_server.test.mjs
git diff --check
```
