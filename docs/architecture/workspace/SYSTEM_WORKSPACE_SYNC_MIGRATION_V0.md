# SYSTEM_WORKSPACE_SYNC_MIGRATION_V0

## Purpose

This document is a public-safe coordination note for resolving drift in
`_workspaces/system/` across multiple PCs.

The goal is to let the team see the migration plan on GitHub without exposing
actual workspace files, raw payloads, PC names, cloud absolute paths, secrets,
or company/private source material.

## Current Finding

`_workspaces/system/` can contain reusable workflow lab outputs, fixture
materialization, generated RAG or knowledge-view outputs, and other
project-agnostic runtime files.

When several PCs each have an independent local `system` folder, the folders
can drift. A direct overwrite or blind OneDrive conflict resolution would risk
losing useful files or preserving the wrong generated output as if it were
canon.

Claim ceiling: observed. The current issue is a runtime layout drift and
migration-planning problem, not proof that every file under `system` should be
promoted into a shared canonical store.

## Public Boundary

Do not commit these items to the public repository:

- files under `_workspaces/system/**`
- copied raw payloads, source documents, attachments, generated binaries, or
  local cache/build outputs
- PC names, user names, cloud account names, local absolute paths, or sync
  provider account details
- secrets, credentials, cookies, sessions, tokens, or local env files

Public GitHub may contain only the runbook, decision criteria, safe schemas,
and placeholder examples.

## Immediate Freeze

Before migration starts, pause new writes into `_workspaces/system/` on every
participating PC.

If a workflow needs temporary output during the freeze, write it to a clearly
temporary local scratch location and do not treat it as migration input unless
the owner explicitly approves it.

## Inventory Rule

Each PC should generate a metadata-only manifest for its local
`_workspaces/system/` tree.

The manifest may include:

- relative path from `_workspaces/system/`
- item type: file or directory
- byte size for files
- modified timestamp
- SHA-256 hash for files
- collection timestamp
- local node role or generic node alias

The manifest must not include file contents, excerpts, document titles, raw
source text, private payload values, or secrets.

Suggested private metadata location:

```text
_workmeta/system/reports/system_workspace_sync/<migration_id>/
```

Suggested public-safe manifest shape:

```yaml
schema_version: soulforge.system_workspace_manifest.v0
migration_id: system_workspace_sync_YYYYMMDD
node_alias: node_a
source_root_ref: _workspaces/system
collected_at: "YYYY-MM-DDTHH:MM:SSZ"
entries:
  - relative_path: example_family/example_file.ext
    item_type: file
    size_bytes: 1234
    modified_at: "YYYY-MM-DDTHH:MM:SSZ"
    sha256: "<sha256>"
```

## Comparison Classes

After manifests are collected, classify entries by relative path and hash.

| Class | Meaning | Default action |
| --- | --- | --- |
| Same path, same hash | Duplicate across PCs | Keep one copy in the candidate shared tree. |
| Same path, different hash | Path collision | Do not auto-merge. Keep all variants under conflict review. |
| Exists on one PC only | Unique local item | Preserve as a candidate until owner classifies it. |
| Generated or cache-like output | Rebuildable runtime material | Prefer regeneration over migration unless explicitly needed. |
| Source or reusable fixture material | Possibly shared input | Preserve and require owner classification. |

## Candidate Shared Root

The shared target should be an owner-approved shared worksite outside the public
tracked tree. Each PC then materializes:

```text
_workspaces/system -> <owner-approved shared system worksite>
```

The public repository must not record the machine-local absolute target path.
Store actual target paths only in owner-only local binding or private metadata.

## Migration Procedure

1. Freeze writes to `_workspaces/system/` on all participating PCs.
2. Generate metadata-only manifests on each PC.
3. Copy each PC's current `system` folder into a private migration holding area
   without deleting the original local folder.
4. Compare manifests and produce a review table grouped by comparison class.
5. Split contents into:
   - shared keep
   - conflict review
   - local archive
   - regenerate or discard
6. Build the owner-approved shared `system` tree from the shared keep set.
7. Rename each original local folder to a dated local backup name.
8. Create the local junction or symlink from `_workspaces/system/` to the shared
   target on each PC.
9. Run a dry read check from each PC.
10. Resume writes only after the owner accepts the shared root and conflict
    disposition.

No step should delete original local material until backup and manifest checks
are complete.

## Decision Points

Owner decisions still needed:

- Whether `_workspaces/system/` remains local-only by canon and only selected
  subtrees move to a shared worksite.
- Whether the whole `_workspaces/system/` view becomes a shared junction on
  owner PCs.
- Which subtrees are source or reusable fixture material versus generated
  runtime output.
- How long local pre-migration backups are retained.
- Whether the existing `WORKSPACE_PROJECT_MODEL.md` local-only wording should
  be revised after the migration decision.

Until these decisions are made, this document is a migration runbook and
coordination note, not a canon replacement for the current workspace model.

## Safe Implementation Notes

- Prefer copy plus checksum verification before replacing any local folder with
  a junction.
- Treat same-path/different-hash files as conflicts even if one has a newer
  modified timestamp.
- Do not rely on cloud sync conflict renaming as the migration mechanism.
- Do not use public GitHub to distribute actual `_workspaces/system` contents.
- Keep generated RAG, graph, preview, cache, and build outputs below a weaker
  preservation priority unless an owner needs the exact output.
- Keep private migration evidence under `_workmeta/system/` as metadata only.

## Related Documents

- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
- [`INSTALLATION_MANUAL_V0.md`](INSTALLATION_MANUAL_V0.md)
- [`WORKMETA_MINIMUM_SCHEMA.md`](WORKMETA_MINIMUM_SCHEMA.md)
