# HPP all-project local activity

`guild_hall/local_activity` collects three HPP-local views for an exact private
project allowlist:

1. project workspace file observations through the existing
   `guild_hall/file_activity` scanner;
2. bounded PC-work facts from the project five-field ledger;
3. a relation-only Codex execution view over the same bounded work facts.

The PC-work fact and Codex execution view share one `native_occurrence_id`.
They are not counted as two business events.

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
├── batches/<YYYY-MM-DD>/<batch_digest>.json
└── projects/<project_code>/
    ├── current.json
    ├── state/file_scan_cache.json
    └── outbox/
        ├── file_activity/<YYYY-MM>/<scan_id>.json
        └── bounded_work/<snapshot_digest>.json
```

`bounded_work` keeps a bounded work summary, verification summary, refs, and a
full-record SHA-256. The same source ID with different full content is held.
The packet is still a candidate projection, not H03/H05 or P1 acceptance.

## Commands

Dry-run is the default:

```powershell
node guild_hall/local_activity/cli.mjs `
  --binding <private-absolute-binding.json> `
  --binding-sha256 sha256:<digest>
```

`--apply` writes only the machine-local outbox. The scheduler wrapper pins the
same binding digest and uses a hidden Windows task with `IgnoreNew`.

## Verification

```powershell
node --check guild_hall/local_activity/local_activity.mjs
node --check guild_hall/local_activity/cli.mjs
node --test guild_hall/local_activity/local_activity.test.mjs
```
