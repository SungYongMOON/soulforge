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
  timeout. Slack bot or user access tokens are read only from the approved
  private environment name or a single-link, identity-fenced credential file
  and are never returned in stdout.
- Live collection still requires an owner-managed Slack App, exact workspace
  and channel bindings, minimal read scopes, and private token provisioning.
  The current HPP app uses a user access token so no bot membership or Slack
  write scope is required. None are fabricated by the public package.
- Attachment custody is a separately fenced binding feature and remains `OFF`
  unless `attachment_policy.feature_enabled` is explicitly true. Its policy
  fixes a strict-child custody root under `data_root`, per-message file count,
  per-file and total byte caps, MIME/file-type allowlists, request timeout, and
  bounded `429 Retry-After` retry limits. Policy `OFF` performs no file call.
- When enabled, only Slack-hosted files proven again by `files.info` are
  eligible. The exact workspace/file identity, declared size, MIME/file type,
  hosted/visible/nonexternal state, Slack-owned HTTPS download host, response
  framing, and streamed byte count must all agree. External files, unfurls,
  Slack Connect, `check_file_info`, deleted/tombstoned files, redirects, and
  unknown states fail closed to an explicit metadata-only `HOLD`.
- Accepted attachment bytes use message-batch atomic SHA-256
  content-addressed custody plus single-file-ID identity receipts. Every file
  in one message is downloaded and checked before any content/identity object
  is committed; a later page/state failure rolls back only the exact objects
  created by that transaction. Exact retries and restart dedupe are
  idempotent; changed file ID/revision/content evidence, target tampering, and
  reparse escapes fail closed. Persistent state reads require a stable,
  single-link regular file through opened-handle pre/post identity checks. Raw
  message custody replaces authenticated file and thumbnail locators with
  bounded digest proofs.
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

`slack_app_manifest.yaml` is the public-safe owner-managed app template for the
current polling collector. It requests only `channels:read`,
`channels:history`, and `files:read`; it has no message-write, file-write,
channel-join, user-directory, Socket Mode, bot-user, or Events API authority.
The app must still be installed by the owner and its private user access token
must be provisioned outside Git. The token can read only channels and files
already visible to the installing account; the private stable-ID allowlist
remains the narrower runtime boundary.

The connected interactive Slack reader does not provide a reusable background
token to this Node harness. HPP continuous collection instead uses the
separately installed owner-managed read-only app and a private v3 access-token
binding outside Git. The exact project-channel allowlist is collected in one
bounded batch at 02:00 and 12:00 KST; `IgnoreNew` prevents overlapping runs.

Attachment collection additionally requires owner-approved `files:read` on
that same access token. `files.info` metadata and the selected
`url_private_download` (falling back to `url_private`) are used only in memory;
the token and authenticated locator are not written to state, receipts, raw
custody, pointers, stdout, or errors.

`createSlackWebApiPollingTransport` is the bounded live pull transport.
`slack_live_cli.mjs` is an explicit `--apply` entrypoint and prints only
aggregate counts and coverage gaps. Web API polling cannot prove deletions or
reconstruct edit history that predates activation; those gaps stay explicit.
Full deletion/event fidelity requires a later Events API or Socket Mode
adapter.

`slack_batch_live_cli.mjs` runs one SHA-256-pinned private allowlist of project
channel bindings. Each channel retains its own state root, cursor, lease, and
attachment custody. A failure in one channel is reported only as a redacted
aggregate and does not prevent the remaining allowlisted channels from
running. The batch is bounded by per-channel page and event limits. If a
provider cursor still has another page when `max_pages` is reached, the batch
records `max_pages_continuation_pending` instead of implying complete catch-up.

The HPP scheduler is one hidden current-user Windows task with exactly two
daily local-time triggers: `02:00` and `12:00` KST. It has no persistent polling
loop or repetition trigger, uses `IgnoreNew`, and verifies the Node executable,
runtime manifest, complete runtime file allowlist, batch binding, and plan
digests before execution. Registration is dry-run first and re-attests the
exported task XML after mutation. A failed attestation removes the new task or
restores and re-attests the exact prior exported definition; rollback failure
leaves the task disabled. The scheduler does not change five-lane writer
authority; Slack remains the H07 communication-history extension.
The registrar computes file digests with a local .NET SHA-256 stream helper;
it does not depend on the optional `Get-FileHash` command being discoverable in
the noninteractive Windows PowerShell process.
Its two scheduled launches pass through the runtime-owned hidden VBS launcher;
the existing PowerShell and Node arguments remain part of the attested action.

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
opaque custody ref, a MIME type, an optional content hash, and an optional byte
count. It cannot contain bytes, URLs, local paths, or promotion authority. A
file-bearing message is accepted only after every file has a complete custody
receipt; any partial failure holds the whole message and adds
`attachment_custody_incomplete` to coverage gaps.

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
`leases/slack-continuous.lock` or the batch `leases/slack-batch-live.lock`; the
harness does not guess that either is stale or auto-delete it. That lock is a
manual recovery blocker: an owner/operator must first prove that no writer is
live, then remove it only through the approved private runtime procedure. It
does not authorize live Slack activation.

A blocked batch lease stays fail-closed but is no longer silent. Before
rethrowing, `runSlackBatchLive` publishes `health/store_slack_custody.json`
with `status: "error"` and the exact `batch_lease_unavailable` code, preserving
the prior `last_success_at`, `validation_digest` and `validated_count`. It does
not read the lease-guarded custody store, does not touch the lock, does not
rewrite `state/slack-batch-live.json`, and creates no transport. Without that
receipt an abandoned lock only stops the health lane from being refreshed, so
every later scheduled run exits `1` with no machine-readable reason and the
Watchtower `slack_batch` and `store_slack_custody` heartbeats merely age.

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

## Slack Archive Query read model and MCP adapter

The query layer (`slack_archive_query.mjs`, `slack_archive_mcp_adapter.mjs`, and `slack_archive_mcp_server.mjs`) is a pure, read-only consumer over validated Slack history archive records:

- **Strict role separation.** The MCP query layer is strictly read-only (`readOnlyHint: true`, zero mutation). It never owns collection, repair, deletion, custody writes, or backup.
- **Pure read model.** Ingests validated archive records (binding, channel facts, revisions, delivery evidence, coverage receipt) and computes a deterministic in-memory index.
- **Multiple distinct time dimensions.** Preserves actual Slack message time (`message_ts`), revision time (`revision_ts`), thread linkage (`thread_ts`), and collection/received time (`received_at`) as distinct, unconflated fields. Chronological timeline ordering is strictly determined by `message_ts`, not by backup or arrival timestamp.
- **Deterministic read-only query operations:**
  - `slack_archive_status`: reports archive coverage state, gap codes, message/thread/revision/attachment counts, and time bounds.
  - `slack_archive_search`: bounded, filtered search across retained messages by actor, query, explicit time range (`since_message_ts`, `until_message_ts`, `since_message_time`, `until_message_time`, `since_received_at`, `until_received_at`), attachment filter, or deleted inclusion.
  - `slack_archive_thread`: resolves a complete conversation thread by root `thread_ts`, returning root message and replies in chronological order.
  - `slack_archive_timeline`: provides a chronological message timeline ordered strictly by `message_ts`.
  - `slack_archive_attachment_metadata`: queries attachment metadata (file ID, pointer ref, MIME type, size, SHA-256) without returning raw bytes, download URLs, or local paths.
- **Partial archive posture & honest content boundary.** Status is `PUBLIC_SYNTHETIC_IMPLEMENTED / NOT_BOUND_TO_REAL_ARCHIVE / PARTIAL/HOLD`. Current live collector custody is metadata/digest-only without a custody→archive projector. Live text search is unavailable until a separately reviewed custody→archive projector and content-retention policy decision. Message text in this slice exists solely for synthetic optional fixture research.
- **Coverage fail-closed.** Accepted coverage state in v0 must be explicitly `partial` with non-empty `gap_codes`; any complete, missing, or malformed coverage state fails closed as unsupported or forgery.
- **Safety and output bounds.** All queries are strictly clamped. The output sanitizer (`assertSafeArchiveOutput`) allows ordinary public documentation URLs in text while strictly forbidding authenticated Slack locators (`files.slack.com`), local filesystem paths, secrets/tokens, or binary bytes.
- **Runtime binding envelope & exact scope check.** The Archive Query MCP uses a separate strict runtime binding envelope (`soulforge.slack_archive_mcp.binding.v0`) requiring exact keys: `schema_version`, `feature_enabled: true`, absolute `private_root`, strict-child `archive_path`, pinned `archive_sha256`, bounded `max_archive_bytes`, and exact `scope` (`binding_id`, `workspace_id`, `channel_id`, `project_code`). The archive's embedded canonical Slack project binding (`soulforge.slack_history.binding.v1`) is validated separately with `validateSlackBinding`, and the exact scopes are matched without identifier leakage.
- **Local stdio JSON-RPC MCP adapter.** Exposes the 5 query tools over newline-delimited JSON-RPC 2.0 stdio with owner-supplied runtime binding scope verification. Fails closed on scope mismatch, corrupt timestamps, or unknown tools. No discovery, network, or provider calls are made. Per-call durable receipts are not implemented; runtime activation remains `HOLD`.
- **Next work.** Collector policy is unchanged in this slice. Capturing `conversations.replies` thread history, live delete events via Events API/Socket Mode, custody→archive projector implementation, quarantine metadata handling, shared MCP dispatcher integration, and automated archive export are separate future next work.

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
node --check guild_hall/slack_history/slack_live_cli.mjs
node --check guild_hall/slack_history/slack_batch_live_runner.mjs
node --check guild_hall/slack_history/slack_batch_live_launcher.mjs
node --check guild_hall/slack_history/slack_batch_live_cli.mjs
node --check guild_hall/slack_history/slack_archive_query.mjs
node --check guild_hall/slack_history/slack_archive_mcp_adapter.mjs
node --check guild_hall/slack_history/slack_archive_mcp_server.mjs
node --test guild_hall/slack_history/slack_history.test.mjs guild_hall/slack_history/slack_source_inventory.test.mjs guild_hall/slack_history/slack_continuous.test.mjs guild_hall/slack_history/slack_batch_live.test.mjs guild_hall/slack_history/slack_archive_query.test.mjs
```

The tests compile the schemas, validate synthetic fixtures, exercise
retry/replay and append-only lineage, verify bounded cursor behavior, cover all
six coverage states, enforce exact metadata-only input fields, verify private
custody/lease/restart behavior, prove that live activation and embedded
secrets fail closed, and verify the pure archive read model, deterministic query
operations, timeline ordering by message_ts vs backup time, edit/delete handling, thread
grouping, result clamping, attachment metadata bounds, and stdio MCP adapter.
Hosted-file fixtures cover PNG/DOCX, duplicate content,
file-ID retry/conflict, framing and byte caps, timeout/network/429 behavior,
redirect isolation, locator/secret nonpersistence, unsafe file states, reparse
escape, tamper detection, partial-message HOLD, and restart dedupe without a
live Slack call.
