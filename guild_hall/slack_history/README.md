# Slack history foundation

This package is the public-safe, source-native foundation for the Task Engine
Slack communication-history extension (`H07A -> H07B`). It is not a sixth lane
in the shared five-lane project-history envelope.

## Current posture

- The collector is feature `OFF` by default.
- The module is pure and read-only. It has no CLI, Slack client, network call,
  file writer, database writer, scheduler, projector, or task/knowledge writer.
- Enabling validation without an explicit private runtime binding fails closed.
  Even a valid private binding only reaches `BOUND_READ_ONLY`; this package has
  no live transport.
- Public fixtures are synthetic metadata. Live cursor values, credentials,
  message bodies, attachment bytes, authenticated locators, and private paths
  do not belong here.

Live app creation, scope selection, membership, event subscription, backfill,
retention/legal-hold policy, user mapping, one-channel canary, and production
activation remain separate owner-approved private gates.

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

## Cursor and coverage

Backfill pages are bounded by whole-page and event limits. A page is accepted
only after its complete metadata batch validates; a page is never split to
advance the cursor. The cursor retains opaque digests, immutable page receipts,
and cumulative delivery-attempt evidence so an `event_id` conflict cannot be
hidden across page or restart boundaries. Its generation digest must match the
retained revision set before another page is accepted.

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
node --test guild_hall/slack_history/slack_history.test.mjs
```

The tests compile `slack_history.schema.json`, validate the synthetic fixture,
exercise retry/replay and append-only lineage, verify bounded cursor behavior,
cover all six coverage states, and run negative boundary checks.
