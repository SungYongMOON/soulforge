# HPP all-project local activity

`guild_hall/local_activity` collects three HPP-local views for an exact private
project allowlist:

1. project workspace file observations through the existing
   `guild_hall/file_activity` scanner;
2. Codex work-result summaries from the project five-field ledger;
3. a relation-only Codex-origin view over the same result summaries.

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

## Verification

```powershell
node --check guild_hall/local_activity/local_activity.mjs
node --check guild_hall/local_activity/cli.mjs
node --test guild_hall/local_activity/local_activity.test.mjs
```
