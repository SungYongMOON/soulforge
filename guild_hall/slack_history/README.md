# Slack history foundation

This package is the public-safe, source-native foundation for the Task Engine
Slack communication-history extension (`H07A -> H07B`). It is not a sixth lane
in the shared five-lane project-history envelope.

## Current posture

- The v1 synthetic collector remains feature `OFF` by default.
- The source-native history module remains pure and read-only.
- A private-custody continuous harness now validates one exact joined public
  project-channel binding at a time, writer lease/epoch fencing, immutable raw
  event custody for accepted records, restart-safe cursor/dedupe,
  edits/deletes/replies, metadata-only HOLD routing, and common source-arrival
  timeline annotations.
- A v2 private binding can use bounded Web API polling. It verifies the exact
  token workspace with `auth.test` and the joined public nonshared project
  channel with `conversations.info`, then reads at most 15 history objects per
  request. Each request, including body parsing, has a 15-second wall-clock
  timeout. Bot tokens are read only from the approved private environment name
  or a single-link, identity-fenced credential file and are never returned in
  stdout.
- Live collection still requires an owner-managed Slack App, exact workspace
  and channel bindings, minimal `channels:history` access, bot membership, and
  private token provisioning. None are fabricated by the public package.
- Public fixtures are synthetic metadata. Live cursor values, credentials,
  message bodies, attachment bytes, authenticated locators, and private paths
  do not belong here.

The separate `slack_source_inventory_cli.mjs` is a query-only sanitizer. It
accepts only a pre-observed, metadata-only Slack inventory on standard input
and returns fingerprints and aggregate counts. It does not authenticate,
connect to Slack, discover channels, read messages, or persist its input. The
connected Slack tool remains the read-only source transport and must pass only
the allowlisted fields into this sanitizer.

Live app creation, scope selection, membership changes, token provisioning,
retention/legal-hold policy, user mapping, and production activation remain
private gates.

The connected interactive Slack reader does not provide a reusable background
token to this Node harness. Continuous collection therefore remains blocked
until an owner-managed Slack App and token are bound.

`createSlackWebApiPollingTransport` is the bounded live pull transport.
`slack_live_cli.mjs` is an explicit `--apply` entrypoint and prints only
aggregate counts and coverage gaps. Web API polling cannot prove deletions or
reconstruct edit history that predates activation; those gaps stay explicit.
Full deletion/event fidelity requires a later Events API or Socket Mode
adapter.

## Identity and revision contract

- Workspace/channel identity is `workspace_id + channel_id`.
- Logical message identity is
  `workspace_id + channel_id + message_ts`.
- An outer delivery `event_id` and its retry evidence never become message
  identity.
- A reply is its own logical message and preserves the root `thread_ts`.
- Message, reply, edit, delete, and tombstone revisions are append-only.
  Supersession cannot cross logical messages, branch, go backward in time, or
  continue after a tombstone.
- Replaying the same delivery evidence is idempotent. Reusing one `event_id`,
  revision ref, page ID, or accepted checkpoint with different evidence fails
  closed.

The module stores only a source metadata digest and attachment pointer
candidates. An attachment pointer can contain an opaque Slack file ID, an
opaque pointer ref, an optional content hash, and an optional byte count. It
cannot contain bytes, URLs, local paths, or promotion authority.

## Project scope

An owner-approved, effective-dated
`workspace_id + channel_id -> project_code` binding can establish the default
project scope only when the exact channel is joined and allowlisted.

The following remain `HOLD` unless the binding names the matching exception and
the channel observation carries an explicit rule ref:

- DM
- `general`
- common/shared channel
- archived channel
- Slack Connect channel

An unmapped workspace/channel or `unmapped` channel kind always remains
`HOLD`. Channel name is display metadata only; rename does not change identity
or project scope. A missing user-to-ERP mapping leaves the actor unknown and
never permits display-name inference.

In this harness, `HOLD` is an irreversible exclusion with a metadata receipt,
not reviewable raw custody. The receipt binds the page ID and event ID to the
raw digest, retry metadata, hold reasons, and opaque source refs. Replaying the
exact receipt is idempotent; changing evidence for the same held event fails
closed. The held raw event is neither written nor recoverable from state. Any
future need for reviewable raw HOLD requires a separately approved private
custody policy before collection.

## Cursor and coverage

Backfill pages are bounded by whole-page and event limits. A page is accepted
only after its complete metadata batch validates; a page is never split to
advance the cursor. The cursor retains opaque digests, immutable page receipts,
and cumulative delivery-attempt evidence so an `event_id` conflict cannot be
hidden across page or restart boundaries. Replaying a completed page never
replaces the persisted provider cursor with an older page token. Its generation
digest must match the retained revision set before another page is accepted.
An immutable page-evidence receipt digests every validated record's metadata,
raw digest, and accepted/HOLD disposition, so changing HOLD membership under an
accepted page ID also fails closed. Exact page replay performs no raw-custody or
state rewrite.

The private binding declares `private_root`, a strict-child `data_root`, and one
or more `forbidden_roots` for public repositories and runtime trees. Runtime
validation rejects a data root outside/equal to its private owner root and
rejects either direction of overlap with every forbidden root. Absolute path
syntax alone is not a custody boundary.

The writer lease is fail-closed. A process crash can leave
`leases/slack-continuous.lock`; the harness does not guess that it is stale or
auto-delete it. That lock is a manual recovery blocker: an owner/operator must
first prove that no writer is live, then remove it only through the approved
private runtime procedure. It does not authorize live Slack activation.

Coverage uses the shared six states:

- `complete_with_events`
- `complete_no_events`
- `partial`
- `failed`
- `not_collected`
- `not_applicable`

Feature `OFF` is `not_collected` with an explicit gap, never
`complete_no_events`. `not_applicable` requires an explicit applicability rule.

## Authority ceiling

The output is source history metadata only. Requests, commitments, and
decisions remain downstream candidates. A message, reply, reaction, pin,
delete, or bot action cannot create or complete an ERP task and cannot promote
content into RAG or Wiki knowledge.

## Validation

Run the package without any live binding:

```powershell
node --check guild_hall/slack_history/slack_history.mjs
node --check guild_hall/slack_history/slack_source_inventory.mjs
node --check guild_hall/slack_history/slack_source_inventory_cli.mjs
node --check guild_hall/slack_history/slack_custody.mjs
node --check guild_hall/slack_history/slack_transport.mjs
node --check guild_hall/slack_history/slack_continuous_runner.mjs
node --check guild_hall/slack_history/slack_continuous_cli.mjs
node --test guild_hall/slack_history/slack_history.test.mjs guild_hall/slack_history/slack_source_inventory.test.mjs guild_hall/slack_history/slack_continuous.test.mjs
```

The tests compile the schemas, validate synthetic fixtures, exercise
retry/replay and append-only lineage, verify bounded cursor behavior, cover all
six coverage states, enforce exact metadata-only input fields, verify private
custody/lease/restart behavior, and prove that live activation and embedded
secrets fail closed.
