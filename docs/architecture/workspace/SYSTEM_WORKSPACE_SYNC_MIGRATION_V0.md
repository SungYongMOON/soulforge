# SYSTEM_WORKSPACE_SYNC_MIGRATION_V0

## Purpose

This document is a public-safe coordination note for resolving drift in
`_workspaces/system/` across multiple PCs.

The goal is to let the team see the migration plan on GitHub without exposing
actual workspace files, raw payloads, PC names, cloud absolute paths, secrets,
or company/private source material.

This runbook follows the path identity rule in
[`WORKSPACE_PATH_IDENTITY_POLICY_V0.md`](WORKSPACE_PATH_IDENTITY_POLICY_V0.md):
the same `_workspaces/<name>` path must not mean different physical folders on
different PCs unless it is under an explicit PC-local namespace.

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

## Tool-Worker PC Procedure

A PC that has Allegro, Cadence, OrCAD, GPU/large-memory local LLM, or another
licensed/local-only toolchain is a tool-worker node.

That toolchain does not make `_workspaces/system` local-only. The installation,
license-bound runtime, scratch, cache, temporary exports, and machine-only logs
stay local under:

```text
_workspaces/_local/<node_id>/system/<tool_or_run>/
```

or under an owner-approved OS/tool location outside `_workspaces/system`.

For each tool-worker run:

1. Keep the tool install and runtime state local.
2. Write temporary output under `_workspaces/_local/<node_id>/...`.
3. Record metadata-only evidence in `_workmeta/system` or the owning
   `_workmeta/<project_code>`.
4. Promote only owner-classified outputs:
   - project-specific outputs to `_workspaces/<project_code>/...`
   - project-agnostic reusable fixtures or exports to the shared
     `_workspaces/system` view
   - knowledge/RAG source-text work to `_workspaces/knowledge/...`
5. Keep hashes, sizes, source refs, tool profile, and blocker notes in
   `_workmeta`; do not copy raw payloads into `_workmeta`.

On a PC without the toolchain, absence of the tool is expected. That PC should
read the shared outputs and metadata, or request a rerun from the tool-worker
node. It should not create a divergent local `_workspaces/system` folder just
to emulate missing tools.

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

Run this read-only gate first on every PC:

```text
npm.cmd run guild-hall:workspace-system:inventory -- --json
```

The command is allowed to inspect only metadata: repo-relative names, item
types, file sizes, modified timestamps, extension counts, and aggregate counts.
It must not read file contents, print host-local absolute paths, create or
repair junctions, move files, delete files, upload files, or change permissions.

The inventory command must return `review_required` while a PC still has a
normal local `_workspaces/system` directory. This is expected during migration;
it is not a failure of the runbook. It means the PC still needs preservation,
classification, and link repair.

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

## Deterministic Local Classes

Each PC must also classify top-level entries with the shared enum below before
any migration action:

| Class | Meaning | Activation blocker |
| --- | --- | --- |
| `shared_generated_view` | Generated RAG or knowledge-view output that can be shared or regenerated. | No, unless the owner wants exact output preservation. |
| `shared_fixture_candidate` | Reusable fixture/reference/materialization candidate. | Yes, until owner-classified. |
| `project_move` | Project-owned material found under `system`. | Yes, until mapped to `_workspaces/<project_code>/...`. |
| `knowledge_move` | Cross-project knowledge payload candidate. | Yes, until mapped to `_workspaces/knowledge/...`. |
| `pc_local_runtime_tool` | Local installs, venvs, tool drops, executable runtime, or machine-only tooling. | Yes, runtime/install material must move local or to an owner-approved OS/tool location. Reinstallable repo-local bootstrap tools may be recreated under ignored `guild_hall/state/tools/**` from install docs, but migrated tool payloads and license-bound toolchains must not be moved there. |
| `pc_local_cache_temp` | Logs, pid files, locks, caches, scratch, temp output. | Yes, keep local or discard only after review. |
| `repo_promote_review` | Portable scripts or reusable helpers found under `system`. | Yes, until promoted to a repo owner surface or moved local. |
| `conflict_review` | Same-path/different-hash or conflict-like material. | Yes, never auto-merge. |
| `unknown_review` | Not deterministically classifiable. | Yes, owner review required. |

`_workspaces/system` may move to `state: active` only when:

- `_workspaces/system` is a link view on that PC.
- the read-only inventory has no activation blockers.
- all PC-local tools, caches, logs, pid files, and temp outputs are outside
  `_workspaces/system`.
- project-specific payloads are mapped to their owning project workspaces.
- unknown and conflict rows have an owner decision recorded in private
  metadata.

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
3. Identify any tool-worker-only entries and place them in the dry-run plan for
   `_workspaces/_local/<node_id>/...`, not to the shared system target.
4. Produce the dry-run classification table, shared-target alias, local hold
   alias, and conflict disposition proposal.
5. Stop until the owner explicitly approves the dry-run plan and the allowed
   mutation set. Approval is required before any copy, rename, junction/symlink
   creation, shared-tree build, upload, delete, or permission change.
6. After approval, copy each PC's current `system` folder into a private migration holding area
   without deleting the original local folder.
7. Compare manifests and produce a review table grouped by comparison class.
8. Split contents into:
   - shared keep
   - conflict review
   - local archive
   - regenerate or discard
9. Stop until the owner accepts the shared keep, project move, local keep,
   regenerate/discard, and conflict disposition decisions.
10. Build the owner-approved shared `system` tree from the shared keep set.
11. Rename each original local folder to a dated local backup name.
12. Create the local junction or symlink from `_workspaces/system/` to the shared
   target on each PC.
13. Run a dry read check from each PC.
14. Resume writes only after the owner accepts the shared root and conflict
    disposition.

No step should delete original local material until backup and manifest checks
are complete.

## Fixed Policy

The path identity decision is fixed before content cleanup:

- `_workspaces/system/` should converge to a shared view on participating PCs.
- `state: planned` records that decision but does not mean the migration is
  complete.
- Existing per-PC `_workspaces/system/` directories are preserved first under
  `_workspaces/_local_hold/system/<timestamp>_<node>/`.
- PC-specific scratch, caches, local tool installs, temporary views, and
  machine-only state must move to `_workspaces/_local/<node>/...` or remain in
  the local hold until classified.

## Remaining Decision Points

Owner decisions still needed:

- Which subtrees are source or reusable fixture material versus generated
  runtime output.
- How long local pre-migration backups are retained.
- Which tool-worker outputs are worth promoting to shared system or project
  workspaces after local execution.
- Whether the existing `WORKSPACE_PROJECT_MODEL.md` local-only wording should
  be revised after the migration decision.

Until these content decisions are made, this document is a migration runbook and
coordination note. It fixes the path identity policy, but it does not promote
every file under `system` into a shared canonical store.

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
