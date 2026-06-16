# WORKSPACE_PATH_IDENTITY_POLICY_V0

## Purpose

This document fixes the path identity rule for `_workspaces/**` across owner
PCs and team member PCs.

The problem it prevents is simple: the same repo-relative path, such as
`_workspaces/system`, must not mean different physical folders on different
PCs unless it is explicitly marked as PC-local. Same name, different contents is
a drift hazard.

## Core Rule

Every direct child of `_workspaces/` has one of two identities:

| identity | meaning | allowed shape |
| --- | --- | --- |
| shared view | the same repo-relative name must point to the same owner-approved shared worksite on participating PCs | junction, symlink, or equivalent link view |
| PC-local view | the contents are intentionally local to one PC | must live under a clearly local namespace |

A shared view path must not be a normal per-PC folder. A PC-local folder must
not reuse a shared view name.

## Folder Purposes

| path | purpose | identity |
| --- | --- | --- |
| `_workspaces/<project_code>/` | Actual project files, source snapshots, document outputs, and project-local materialization. | Shared view when more than one PC must access the same project data; otherwise bounded local project view. |
| `_workspaces/SE_TEMPLATE_LIBRARY/` | Owner-approved reusable SE artifact materials, templates, sample outputs, authoring rules, and manifests. | Shared view or owner-approved library store. |
| `_workspaces/system/` | Reusable workflow lab outputs, fixture materialization, project-agnostic source/reference material, generated RAG manifests, and generated knowledge views. | Path-identity controlled shared view candidate. |
| `_workspaces/knowledge/` | Owner-approved cross-project private knowledge/RAG source-text worksite and derived private proof payloads. | Registered shared non-project alias. |
| `_workspaces/general_work/` | Cross-project general work payloads that are not owned by a delivery project. | Registered shared non-project alias. |
| `_workspaces/P00-000_INBOX/` | Unresolved project intake workspace and project candidates before assignment. | Registered shared project/candidate inbox. |
| `_workspaces/_local/<node_id>/` | PC-specific scratch, cache, local tool installs, temporary exports, and machine-only state. | PC-local view. |
| `_workspaces/_local_hold/<workspace_alias>/...` | Preserved local copies from before a shared-view migration. | PC-local migration hold. |

## Shared View Rules

- Registered project workspaces, approved non-project aliases, and the reserved
  `_workspaces/system` path are path-identity controlled.
- If a path is path-identity controlled, all participating PCs must materialize
  it as a link view to the same logical shared target.
- The host-local absolute target path is runtime state. It must not be written
  to public docs, Git-tracked examples, or shared prompts.
- Binding files may store only aliases, repo-relative link paths, cloud or
  worksite root aliases, and portable relative target identifiers.
- A path-identity controlled name that already exists as a normal local folder
  must be preserved before conversion; it must not be overwritten in place.

## PC-Local Rules

PC-local files are allowed, but their boundary must be visible from the path.

Preferred locations:

```text
_workspaces/_local/<node_id>/
_workspaces/_local_hold/<workspace_alias>/<timestamp>_<node_id>/
```

Use `_workspaces/_local/<node_id>/` for ongoing PC-specific scratch, caches,
local tool installs, temporary exports, and machine-only state.

Use `_workspaces/_local_hold/<workspace_alias>/...` for pre-migration preserved
copies when a formerly local folder is being converted to a shared view.

Do not place PC-only data directly under:

```text
_workspaces/system/
_workspaces/<project_code>/
_workspaces/<registered_alias>/
```

unless that data is intended to be visible through the shared worksite for that
alias.

## Tool-Worker PC Rules

Some workflows require hardware, licensed EDA tools, GPU or large-memory hosts,
or local-only installs. A PC with Allegro, Cadence, OrCAD, or a similar
installation is a tool-worker node, not a reason to make `_workspaces/system`
PC-specific.

Tool installs, license-bound runtimes, local caches, scratch folders,
temporary exports, and machine-only logs stay PC-local under:

```text
_workspaces/_local/<node_id>/
```

or in the tool's owner-approved local OS location. They must not be stored
directly under `_workspaces/system/`.

Only owner-classified outputs may cross the local/shared boundary:

- project-specific outputs move to the owning `_workspaces/<project_code>/...`
  worksite.
- reusable project-agnostic fixtures or exports may move to the shared
  `_workspaces/system/` view after owner classification.
- execution metadata, tool profile notes, input/output pointers, sizes, hashes,
  and blockers are recorded in `_workmeta/system` or the owning
  `_workmeta/<project_code>` as metadata only.

Participating PCs that do not have the tool installed should consume the shared
outputs and metadata, or request a rerun from the tool-worker PC. They should
not create divergent local `_workspaces/system` contents to compensate for the
missing toolchain.

## System Workspace Decision

`_workspaces/system` is now treated as a path-identity controlled shared view
candidate for reusable workflow lab outputs, fixture materialization, and
project-agnostic source or reference material.

The path should converge to this shape:

```text
_workspaces/system -> <owner-approved shared system worksite>
```

Existing per-PC `_workspaces/system` folders are not deleted or merged
directly. They are first preserved under `_workspaces/_local_hold/system/`, then
compared by metadata and hash before any content is promoted into the shared
target.

## System Entry Classification Rules

Before `_workspaces/system` can move from `state: planned` to `state: active`,
each participating PC must run the read-only inventory gate:

```text
npm.cmd run guild-hall:workspace-system:inventory -- --json
```

The command reads metadata only. It does not read file contents, print
host-local absolute paths, create links, move files, delete files, or promote
content.

For cross-PC collection without a long prompt, each PC may also write the same
metadata-only finding into the private metadata repo:

```text
npm.cmd run guild-hall:workspace-system:report
```

If `guild_hall/state/local/node_identity.yaml` is not available on that PC, use
a generic owner-approved alias:

```text
npm.cmd run guild-hall:workspace-system:report -- --node-id node_alias
```

The report command writes JSON, Markdown, and CSV under
`_workmeta/system/reports/workspace_system_inventory/<timestamp>_<node_id>/`.
It refuses to run if `_workmeta/.git` is missing. It is a metadata capture step
only; it does not execute migration, mutate `_workspaces/system`, or approve
any content for the shared system worksite.

The default command must perform a full recursive metadata scan. If an operator
uses `--max-depth` or `--max-entries`, any `scan_limited` row is an activation
blocker and the counts must not be used as complete migration evidence.

Inventory rows use these classes:

| class | meaning | default action |
| --- | --- | --- |
| `shared_generated_view` | Generated system views such as `_workspaces/system/rag/**` and `_workspaces/system/knowledge_view/**`. | Keep or regenerate after the shared link is ready. |
| `shared_fixture_candidate` | Project-agnostic fixture, reference, XML, or materialization candidates. | Preserve and owner-classify before sharing. |
| `project_reference_payload_review` | Project-code-like reference payloads such as `p25_054_reference_payloads`. | Do not move directly to the project root. Owner-map to the project payload relocation or reference surface first. |
| `project_move` | Project-code-like payloads or project-owned material that is not specifically a reference-payload review case. | Move to the owning `_workspaces/<project_code>/...` after owner mapping. |
| `knowledge_move` | Cross-project knowledge payload candidates. | Move to `_workspaces/knowledge/...` after owner mapping. |
| `pc_local_runtime_tool` | Local LLM installs, venvs, tool drops, executable runtime folders, or machine-only tooling. | Move runtime/install material to `_workspaces/_local/<node_id>/...` or an owner-approved OS/tool location. Reinstallable repo-local bootstrap tools may be recreated under ignored `guild_hall/state/tools/**` from install docs, but migrated tool payloads and license-bound toolchains must not be moved there. |
| `pc_local_cache_temp` | Logs, pid files, locks, caches, temp/scratch output, and rebuildable local state. | Keep local or discard only after owner review. |
| `repo_promote_review` | Portable scripts or reusable helpers found under `system`. | Promote to a tracked repo owner surface or move local. |
| `conflict_review` | Same-path conflict candidates or explicitly conflict-like names. | Preserve all variants; never auto-merge. |
| `unknown_review` | Anything the deterministic classifier cannot place. | Owner review required before activation. |

`state: planned` means the path identity decision is recorded, not that cleanup
is complete. The `system` binding may become `state: active` only after
inventory blockers are cleared and `_workspaces/system` is a link view.

## Implementation Implications

- `guild_hall/rag` writes generated system RAG outputs under
  `_workspaces/system/rag/**` only when the `system` binding is active and the
  local path is a link view. During migration, choose
  `_workspaces/_local/<node_id>/system/rag/**` explicitly.
- `guild_hall/knowledge_graph` writes generated graph and Obsidian view outputs
  under `_workspaces/system/knowledge_view/**` only when the `system` binding
  is active and the local path is a link view. During migration, choose
  `_workspaces/_local/<node_id>/system/knowledge_view/**` explicitly.
- PC-local generated experiments that should not be shared must choose an
  explicit `_workspaces/_local/<node_id>/...` output root instead of the default
  system root.
- Tool-worker runs must write temporary or license-bound outputs under
  `_workspaces/_local/<node_id>/system/<tool_or_run>/...` unless the owner has
  classified a specific output for project workspace or shared system
  promotion.
- The workspace junction audit checks `state: active` binding rows. A
  `state: planned` row records policy intent without requiring every PC to have
  completed the local link repair already.

## Migration Order

1. Freeze new writes to the drifted path on participating PCs.
2. Record a metadata-only manifest for each PC.
3. Produce a dry-run classification and cleanup plan, including the shared
   target alias, local hold alias, tool-worker local moves, and conflict
   disposition proposal.
4. Stop until the owner explicitly approves the dry-run plan and the allowed
   mutation set.
5. After approval, preserve the existing normal folder under
   `_workspaces/_local_hold/...` without deleting the original material.
6. Compare preserved local holds and candidate shared material by metadata and
   hash.
7. Stop until the owner accepts the shared keep, project move, regenerate,
   PC-local keep, and conflict disposition.
8. Build the shared target from the owner-accepted shared keep set.
9. Rename the original local folder and create the shared-view link at the
   original repo-relative path.
10. Verify the link view without printing host-local target paths.
11. Leave any non-accepted preserved content in local hold or owner-approved
   PC-local storage until a later owner decision.

## Guardrails

- Do not use cloud sync conflict files as the migration mechanism.
- Do not auto-merge same-path different-hash files.
- Do not treat generated views, local caches, process ids, local tool installs,
  or temporary logs as shared truth without owner review.
- Do not use `_workspaces/system/tools` or similar shared-looking paths for
  local installs, license-bound toolchains, or PC-only runtime caches.
- Do not commit `_workspaces/**` payload files to public Git.
- Do not record PC names, user names, local absolute paths, account-specific
  cloud paths, secrets, or raw payload content in public docs.

## Related Documents

- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`SYSTEM_WORKSPACE_SYNC_MIGRATION_V0.md`](SYSTEM_WORKSPACE_SYNC_MIGRATION_V0.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
- [`INSTALLATION_MANUAL_V0.md`](INSTALLATION_MANUAL_V0.md)
