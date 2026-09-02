# Linear collection lane (`linear_history`)

Read-only Linear collector for the Main Node (HPP), scheduled every 15 minutes
like the mail and Slack lanes. It mirrors the operating pattern of
`guild_hall/slack_history/` (SHA-256-pinned private binding, exact forbidden
roots, writer authority/epoch fencing, fail-closed lease, exact-runtime
launcher, dry-run-first Scheduled Task registrar, refs-only receipts) and adds
one deliberate improvement: the health receipt is written **before** any
fail-closed rejection returns, so a broken binding never exits `1` silently.

Owner decision (2026-09-02): Linear collection is frequent like mail/Slack
(collection is not backup); the server-side Linear API key is stored only in a
private credential file the Owner places (`credentials.api_key_file`);
non-quiesced snapshots are accepted.

## Current posture

- Code state: **candidate**. No private binding, API key, runtime lane copy,
  or Scheduled Task exists in this repository or is created by it.
- Activation is `HOLD` until the Owner places the key file, writes the private
  binding, emits the runtime lane, and runs the registrar (dry-run, then
  `-Register`). See "Activation order" below.
- The lane sends only GraphQL `query` documents to `https://api.linear.app/graphql`.
  There is no mutation document, no write helper, and no write capability name
  anywhere in the module; the lane test scans the sources for both.
- Collection is not backup. LB1 backup generations, isolated restore and human
  acceptance remain owned by `guild_hall/backup_controller/`.

## Files

| File | Role |
| --- | --- |
| `linear_graphql_client.mjs` | Minimal read-only GraphQL POST client, API-key loading through the Slack-rule credential boundary (`credentials.api_key_env`, then `credentials.api_key_file`), query documents, normalizers, live transport |
| `linear_collect_runner.mjs` | Binding contract, lane context, health-first fail-closed flow, lease, bounded `updatedAt` delta/backfill window, create-only custody, receipts, read-evidence envelopes, lane record |
| `linear_collect_receipt.mjs` | Refs-only run receipt + cursor contract and validator (also imported by the path_registry adapter) |
| `linear_custody.mjs` | Guarded private paths, atomic state writes, create-only content-digested objects, fail-closed lease |
| `linear_collect_cli.mjs` | `--preflight` / `--apply` entrypoint, reachable only through the launcher attestation |
| `linear_collect_launcher.mjs` | Exact-runtime launcher: Node sha pin, runtime manifest sha pin, full-tree inventory, `--verify-only` |
| `linear_runtime_manifest_emitter.mjs` | Emits the source-lane copy (`install/source-lanes/linear-collect-v1`) and its `runtime_manifest.json` |
| `linear_synthetic_transport.mjs`, `fixtures/synthetic_linear_workspace.json` | Recorded synthetic GraphQL-shaped fixture and transport for tests; no network |
| `ops/register-linear-collect-hpp-task.ps1` | Scheduled Task registrar: dry-run plan digest, `-Register -ExpectedDryRunDigest`, `-ExpectedExistingTaskSha256`, launcher preflight, exported-XML attestation, rollback |
| `ops/run-linear-collect-hidden.vbs` | Hidden window wrapper used by the registered action |
| `ops/test-register-linear-collect-hpp-task.ps1` | Structural guard for the registrar |
| `../path_registry/src/linear_source_lane_adapter.mjs` | Pure receipt -> `capture_generation` adapter for `source.linear` |

## Binding contract (`soulforge.linear_collect.binding.v1`)

Exact keys, all required:

| Key | Rule |
| --- | --- |
| `schema_version` | `soulforge.linear_collect.binding.v1` |
| `feature_enabled` | must be `true` (a disabled binding is rejected, not skipped) |
| `lane_id` | opaque safe ref, e.g. `hpp-linear-collect` |
| `private_root` | absolute; must exist; disjoint from every forbidden root |
| `data_root` | absolute strict child of `private_root`; the Linear custody root (`<data_root>/<url_key>/...`); disjoint from `state_root` and every forbidden root |
| `state_root` | absolute strict child of `private_root`; disjoint from `data_root` |
| `forbidden_roots` | >= 2 unique absolute roots; must contain the exact repository root and runtime root passed at run time |
| `writer.authority_id`, `writer.epoch` | safe ref + positive integer; persisted state is fenced to both |
| `credentials.api_key_env` | `null` or an environment variable name (`^[A-Z][A-Z0-9_]{2,127}$`); when set and non-empty at run time it is used before the file, exactly like the Slack lane's `access_token_env` |
| `credentials.api_key_file` | absolute strict child of `private_root`; disjoint from `data_root`, `state_root`, the binding file, and every forbidden root; a normal single-link file of 1..4096 bytes |
| `workspace.url_key` | Linear workspace URL key; verified against `organization.urlKey` on every run (`workspace_mismatch` otherwise) |
| `workspace.organization_id` | `null` or the organization UUID; when set it is verified too (pin it after the first run from the receipt) |
| `workspace.project_scope_map` | sorted unique `{linear_project_id, project_scope_ref}` entries used for read evidence; unmapped issues get `linear.project:<id>` / `linear.project:unassigned` |
| `cursor.overlap_seconds` | 0..86400 re-read overlap below the watermark (default 300) |
| `cursor.initial_updated_at` | `null` (from epoch) or the first lower bound |
| `cursor.page_size` | 1..100 |
| `cursor.max_pages_per_run` | 1..200 pages per collection per run |
| `cursor.timeout_ms` | 100..60000 per HTTP request |

Token-like values (`lin_api_...`, `lin_oauth_...`, Slack, JWT) and secret-named
fields are rejected anywhere in the binding. The tracked public-safe sample is
`docs/architecture/workspace/examples/linear_collect_lane/linear_collect.binding.example.json`;
the lane test binds its placeholders and validates it.

## Credential placement (Owner action)

The credential mechanism is the Slack lane's, not a new rule:
`guild_hall/slack_history/slack_transport.mjs` `loadSlackAccessToken` /
`readApprovedCredentialFile` read the token from the binding's
`credentials` object (environment name first, then an absolute file path)
and require the file to be a strict child of `private_root`, outside
`data_root`, outside every forbidden root, a normal single-link file of
1..4096 bytes, re-checked through `realpath` and an opened-handle identity
check. `linear_graphql_client.mjs` `loadLinearApiKey` applies exactly that
rule to `credentials.api_key_env` / `credentials.api_key_file`.

On the Main Node the Slack lane's private config directory was observed by
directory listing only (no file contents were read) as
`<PRIVATE_ROOT>\config\slack_history\` holding `slack_batch_live.binding.json`,
`bindings\<PROJECT>.json`, and `credentials\user_access_token.txt`, where
`<PRIVATE_ROOT>` is the `Soulforge-data` root on the Main Node's data drive
(the coordinator-fixed value; tracked files keep the placeholder because the
repository path policy rejects concrete local absolute paths). The Linear lane
uses the sibling layout with the coordinator-fixed file name:

```text
<PRIVATE_ROOT>\config\linear_history\linear_collect.binding.json           # private binding (pinned by SHA-256)
<PRIVATE_ROOT>\config\linear_history\credentials\linear_api_key.txt       # Owner writes the Linear API key here
<PRIVATE_ROOT>\ingress\linear\                                           # data_root (custody), never holds the key
```

Binding fields: `credentials.api_key_file` is that absolute path;
`credentials.api_key_env` stays `null` on the Main Node (the Scheduled Task
has no such variable). The Owner is creating a read-only scoped personal API
key named `soulforge-collect`; a key with write scopes is never required
because the lane only sends `query` documents.

Rules for `linear_api_key.txt`:

- one line, the personal API key (`lin_api_...`) or an OAuth access token
  (`lin_oauth_...`), no BOM, optional trailing newline, UTF-8 without other
  content, at most 4096 bytes;
- created by the Owner, never by an agent, script, chat, or installer;
- NTFS ACL restricted to the interactive account that owns the Scheduled Task
  (the lane only checks that it is a normal single-link file; it does not
  widen or repair ACLs);
- never copied into the runtime lane, the repository, `_workmeta`,
  receipts, custody, health, stdout, or error messages. The runtime launcher
  refuses any runtime member named like a secret (`api_key*`, `*token*`,
  `.env*`, key files).

The lane needs read-only scope only. A key created with write scope still
cannot be used to mutate through this lane, but the Owner should still create
it with the narrowest scope Linear offers.

## Private state and custody layout

```text
<state_root>/
  leases/linear-collect.lock            # fail-closed writer lease (never auto-removed)
  state/linear-collect.json             # cursor, generation_seq, object index; fenced to lane identity + writer
  health/linear_collect.json            # soulforge.linear_collect.health.v1, written first on every run
  receipts/<run_id>.json                # soulforge.linear_collect.run_receipt.v1 (refs-only, create-only)
  receipts/<run_id>.lane_record.json    # nine-key capture_generation for source.linear
<private_root>/ingress/linear/<url_key>/
  workspace/<organization_id>/<sha256>.json
  teams|users|projects|labels|states|cycles/<id>/<sha256>.json
  issues/<issue_id>/<sha256>.json       # one file per observed issue revision
  comments/<comment_id>/<sha256>.json
  read_evidence/<issue_id>/<sha256>.json  # official_task_read_evidence.v0 envelope per issue snapshot
```

Every custody file is a canonical JSON object
`{schema_version, kind, object_id, content_sha256, object}` named by the
content digest. Identical bytes are a no-op; different bytes at the same path
fail closed as `custody_digest_conflict`; nothing is overwritten or deleted.
Issue/comment bodies and user e-mail addresses live only under this private
custody root, never in receipts, health, lane records, or stdout.
Linear's float-typed `WorkflowState.position` is stored as its decimal text
(for example `"1.5"`) because canonical custody digests admit only safe
integers; every other numeric field is integral in Linear and stays a number.

`read_evidence` envelopes are `soulforge.linear_collect.read_evidence_envelope.v1`
whose `evidence` member is an exact
`soulforge.linear.official_task_read_evidence.v0` record (`task_id` = Linear
identifier, `forge_task_ref` = `linear.task:<identifier lowercased>`,
`task_status` = workflow state name with unsafe characters removed, e.g.
`In Progress` -> `InProgress`, `read_receipt_digest` computed exactly as the
dev-erp admission seam recomputes it). `evidence_state` is `current` at the
observation; a consumer must take the newest snapshot for an issue from
`state/linear-collect.json` `object_index` or the latest run receipt and treat
older snapshots as stale. The lane test admits an emitted `Todo` envelope
through `forge_linear_execution_packet_admission.mjs` and confirms non-`Todo`
and tampered records HOLD.

## Delta capture

- Window: `[watermark - overlap_seconds, run_start]` filtered on Linear
  `updatedAt` for issues and comments, `includeArchived: true`, bounded by
  `page_size x max_pages_per_run` per collection. Catalog objects (teams,
  users, projects, labels, workflow states, cycles) are re-read fully each run
  and deduplicated by content digest.
- If a collection still has pages when the cap is reached the run records
  `max_pages_continuation_pending`, keeps the watermark, and persists a
  `backfill` window narrowed by the observed order (descending -> upper bound,
  ascending -> lower bound). Later runs finish the backfill before resuming
  normal deltas; a backfill that cannot narrow twice in a row is advanced with
  the explicit gap `backfill_stalled_window_advanced`.
- Polling cannot prove hard deletes; every receipt carries
  `polling_cannot_prove_hard_deletes`.
- The workspace `urlKey` (and `organization_id` when pinned) is verified on
  every run before anything is written.

## Run modes

| Mode | Effect |
| --- | --- |
| launcher `--verify-only` | verifies Node sha, manifest sha, and the exact runtime tree; no binding read |
| `--preflight` | resolves the binding context, checks every boundary and the key file shape; no network, no private writes |
| `--apply` | full collection; writes custody, receipts, state, health |

Both CLI modes require the launcher attestation and the exact registered
arguments: `--repository-root`, `--runtime-root`, `--binding`,
`--expected-binding-sha256`, `--state-root`.

Health codes worth watching: `private_json_digest_mismatch` (binding drifted),
`required_forbidden_root_missing`, `lease_unavailable` (abandoned lock; manual
recovery only), `workspace_mismatch`, `api_key_unavailable`,
`linear_auth_failed`, `linear_rate_limited`, `linear_graphql_<code>` (Linear
answered a GraphQL request or validation error, including HTTP 400 bodies such
as `linear_graphql_input_error`), `custody_digest_conflict`.

## Activation order (Main Node)

1. Emit the runtime lane: `node guild_hall/linear_history/linear_runtime_manifest_emitter.mjs --source-root <repo> --target-root <install root>/source-lanes/linear-collect-v1 --write`.
2. Owner writes `credentials\linear_api_key.txt` and the private binding under `<PRIVATE_ROOT>\config\linear_history\`.
3. Compute the binding, manifest, and Node SHA-256 values; run the registrar without `-Register` (dry-run, plan digest).
4. `--preflight` through the launcher with the exact registered arguments (the registrar does this itself before planning).
5. Run the registrar with `-Register -ExpectedDryRunDigest <digest>` (and `-ExpectedExistingTaskSha256` when replacing).
6. First `--apply` happens on the next 15-minute trigger; check `health/linear_collect.json` and the first receipt, then pin `workspace.organization_id` in the binding and re-register with the new binding digest.

## Rollback

- Scheduled Task: the registrar restores the exact prior exported XML or
  removes the new task when attestation fails; a failed rollback leaves the
  task disabled. Manual rollback is `Disable-ScheduledTask` /
  `Unregister-ScheduledTask` on `Soulforge-HPP-Linear-Collect`.
- Code: `git revert` of this module only; the runtime lane copy is versioned
  (`linear-collect-v1`) and the manifest sha pins it.
- Data: custody and receipts are create-only; nothing needs to be undone.
  Deleting them is an Owner decision, not a lane action.

## Boundary

- Read-only: no mutation, no Linear writer, no task/status/comment write, no
  attachment download.
- Collection is not backup: no backup generation, restore, or acceptance
  record is produced; LB1 stays in `backup_controller/`.
- Not project truth: custody and read evidence are source observations. They
  do not create, complete, or promote ERP tasks or knowledge.

## Validation

```powershell
npm.cmd run validate:linear-collect
npm.cmd run validate:module-operability
```
