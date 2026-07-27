# HPP all-project local activity

`guild_hall/local_activity` collects three HPP-local views for an exact private
project allowlist:

1. project workspace file observations through the existing
   `guild_hall/file_activity` scanner;
2. Codex work-result summaries from the project five-field ledger;
3. a relation-only Codex-origin view over the same result summaries.

It also provides a separate explicit `Codex work-context event` writer for the
current HPP. A project may have many local work IDs: each distinct real job
opens a new ID, while the leader, child, continuation, and verifier tasks that
continue that same job share its ID. They add bounded checkpoints and close
the ID with result and verification references. This replaces neither the
future ERP WorkSession nor the H05 machine-verifiable run receipt.

The work-result summary and Codex-origin view share one `native_occurrence_id`.
They are not counted as two business events.

`Codex work-result summary` is the owner-facing data name. The v1 schema,
binding key, IDs, and machine-local directory retain the internal
`bounded_work` name for compatibility. This is a Codex-authored summary, not
PC surveillance, a formal WorkSession, or an automatically generated Codex
execution/verification receipt. The latter data class is named `Codex
execution/verification evidence` and remains the separate H05 run-receipt
lane.

## Boundary

- The collector reads only exact project workspace and five-field paths from a
  private binding. It does not discover projects.
- It never reads Codex conversation history, screen content, keyboard input,
  whole operating-system activity, mail, voice, Slack, or an ERP database.
- Workspace file bytes may be streamed for SHA-256 by the existing file
  activity scanner. Bytes are not retained.
- Output first lands in a machine-local HPP outbox. It does not directly mutate
  `_workmeta`, an accepted project timeline, an official task, or ERP.
- Team-PC history still requires the planned MCP/client-plugin WorkSession
  path. This collector proves only the current HPP-local lane.
- Codex work-context events never copy a whole conversation. They keep only
  explicit start, attachment, checkpoint, and completion summaries plus
  bounded source/file/run pointers.
- The work ID is local context evidence. Closing it does not complete an ERP
  task, approve project context, or grant H03/H05 acceptance.

## Private binding

The private JSON binding uses
`soulforge.hpp_all_project_local_activity_binding.v1` and lists every project
explicitly. It contains host-local absolute paths and therefore stays under
ignored local state or the HPP control root, never public Git.

For each project it binds:

- `workspace_root`;
- `workmeta_root`;
- one `workspace_binding_id`;
- file scan limits;
- the exact
  `reports/procedure_capture/five_field_log.jsonl` source.

New projects are not silently collected. Project onboarding must add one exact
binding row and re-pin the private binding digest.

The separate Codex work-context binding uses
`soulforge.hpp_codex_work_context_binding.v1`. It pins the HPP `state_root`,
`node_id`, and an explicit `{project_code, enabled}` list. It does not contain
conversation text, task summaries, or credentials.

## Output

```text
<state_root>/
|- batches/<YYYY-MM-DD>/<batch_digest>.json
`- projects/<project_code>/
   |- current.json
   |- state/
   |  |- file_scan_cache.json
   |  `- file_inventory_state.json
   `- outbox/
      |- file_activity_delta/<YYYY-MM>/<delta_digest>.json
      `- bounded_work/<snapshot_digest>.json
```

The explicit work-context writer uses a separate append-only surface:

```text
<state_root>/projects/<project_code>/codex_work_context/
|- leader_events/<event_id_digest>.json
`- work_units/<local_work_id>/
   |- events/<time>-<event_digest>.json
   `- current.json
```

`events/**` is the evidence owner. `current.json` is a rebuildable convenience
snapshot. A project may contain many independent work IDs. One local work ID
may include the project leader task and any number of attached worker,
continuation, or verifier tasks for that same job. A leader that performs the
work directly is recorded as `leader_executor`.

The first successful inventory writes one metadata-only baseline delta. Later
scans still enumerate the exact project root but persist only new or changed
observations plus non-authoritative absence candidates. They do not persist a
second full observation packet when nothing changed. The mutable inventory
state retains one compact row per currently observed path so unchanged files
can be suppressed without an LLM. An incomplete listing preserves previously
seen rows and cannot emit absence candidates.
All non-exact hash queue reasons are normalized to one stable `pending`
inventory state so byte-budget ordering does not create false file-history
growth.

An absence candidate is never a deletion. This HPP collector has the `tool_pc`
role, so it cannot confirm deletion even after repeated scans. Exact hashes are
cached by unchanged size/mtime/ctime and may use an owner-bound TTL up to 30
days; pending or large hashes do not prevent path/size/time observations from
being retained.

The legacy internal `bounded_work` packet keeps a Codex work-result summary,
verification claim, refs, and a full-record SHA-256. The same source ID with
different full content is held. The packet is still a candidate projection,
not a formal H03 WorkSession, H05 execution/verification evidence, or P1
acceptance.

The CLI lock carries a process identity and owner token. A live owner always
blocks another run. A dead legacy or current owner lock is atomically
quarantined and removed after the next successful acquisition, so a crashed
Node process does not permanently stop the 30-minute scheduler.

## Commands

Dry-run is the default:

```powershell
node guild_hall/local_activity/cli.mjs `
  --binding <private-absolute-binding.json> `
  --binding-sha256 sha256:<digest>
```

`--apply` writes only the machine-local outbox. The scheduler wrapper pins the
same binding digest, uses `IgnoreNew`, and launches PowerShell with a hidden
window. The Task Scheduler definition itself is not claimed to have
`Hidden=true`.

Codex work-context commands use a separate pinned private binding and one
JSON payload. The CLI supplies the event ID and KST-normalized occurrence time.
Pin the event ID when a write may need to be retried; the first accepted event
time remains authoritative on replay. `--occurred-at` remains available when
the caller must preserve a known source time:

```powershell
node guild_hall/local_activity/codex_work_context_cli.mjs `
  --binding <private-absolute-binding.json> `
  --binding-sha256 sha256:<digest> `
  --operation begin_work `
  --project P26-014 `
  --payload-json '{"work_id":null,"leader_thread_ref":"<opaque-ref>","executor_thread_ref":"<opaque-ref>","title":"bounded title","request_summary":"bounded summary","source_refs":[]}'
```

Supported operations are `register_leader`, `begin_work`, `attach_thread`,
`checkpoint`, `finish_work`, `supersede_work`, and read-only `status`. A
completed work unit is never edited in place; a correction marks it
`superseded` and may point to one already-started, non-superseded replacement
work ID in the same project. Self-replacement, missing replacement, and
replacement chains that point at another superseded unit are rejected. Event
occurrence time must not move backwards within a work ID. The writer is fenced
by one HPP-local lock. Dead locks are recovered; a live owner blocks a second
writer for a bounded 15-minute lease, after which a stale or PID-reused lock is
recovered. PowerShell callers should prefer `--payload-base64` because native
Windows argument parsing can remove JSON quote characters; direct process
callers may use `--payload-json`.
The payload cannot override CLI-owned `operation`, `project_code`,
`occurred_at`, or `event_id`. When `begin_work.work_id` is `null`, the generated
ID is deterministic for the pinned event ID so a retry cannot create another
work unit. A replay also reconstructs `current.json` from immutable events, so
an interrupted snapshot replacement does not leave the work unit permanently
stale. The CLI does not automatically collect the whole conversation. All text
fields are structurally bounded, but callers remain responsible for submitting
short operational summaries and references rather than chat transcripts or
source contents.

Windows project-leader tasks should pass a PowerShell object through the
tracked wrapper so JSON quoting and UTF-8 text survive native argument parsing:

```powershell
$payload = @{
  work_id = $null
  leader_thread_ref = "<opaque-ref>"
  executor_thread_ref = "<opaque-ref>"
  title = "bounded title"
  request_summary = "bounded summary"
  source_refs = @()
} | ConvertTo-Json -Compress

& <runtime-root>\guild_hall\local_activity\ops\invoke-codex-work-context.ps1 `
  -Operation begin_work `
  -Project P26-014 `
  -PayloadJson $payload `
  -RuntimeRoot <runtime-root> `
  -BindingPath <private-binding> `
  -BindingSha256 sha256:<digest> `
  -EventId <stable-event-id> `
  -OccurredAt <optional-known-source-time>
```

For read-only `status`, the wrapper may omit `-PayloadJson`; it defaults to an
empty object and the CLI supplies `work_id=null`.

## Verification

```powershell
node --check guild_hall/local_activity/local_activity.mjs
node --check guild_hall/local_activity/cli.mjs
node --check guild_hall/local_activity/codex_work_context.mjs
node --check guild_hall/local_activity/codex_work_context_cli.mjs
node --test guild_hall/local_activity/local_activity.test.mjs guild_hall/local_activity/codex_work_context.test.mjs
```
