# Physical Folder Compatibility, Packaging, and Migration Map

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Public-safe inventory convention

This document uses stable physical aliases instead of publishing host-local absolute paths. Exact local roots and bindings remain private/runtime configuration. The aliases are `OBSERVED_METADATA_ONLY` as of this planning task: directory shape was read-only observed, while operational ownership, health, contents, ACLs, backups, and runtime activation remain `VERIFY_PHYSICAL` unless a separately accepted receipt says otherwise.

| Alias | Observed current role/layout | Owner interpretation |
| --- | --- | --- |
| `source_checkout` | Canonical repository roots, documentation, guild modules, and UI workspace | Source code/canon owner; not installed runtime data. |
| `runtime_checkout` | Separate runtime checkout with canonical-like roots plus data/rollback-related surfaces | Runtime compatibility checkout; not a new canon or source migration target. |
| `data_plane` | Separate existing folders for backups, configuration, ingress, ingress-MCP, manifests, quarantine, runtime, secrets, state, and timeline | Runtime/custody data owner; secrets are excluded from plan inspection/copy. |
| `control_plane` | Separate backup, history, ingress, local-activity, mail, rollback, tools, voice-label, and Watch control surfaces | Protected controller/config/receipt owner, distinct from data and checkout. |
| `buzz_runtime` | Existing backup, data, installer, log, runtime, server, and source surfaces | Buzz-native operational owner; deep collaboration data stays source-local. |
| `bot_worktree` | Existing `COMMON`, `MFG`, `PJT`, and `TOOL` hierarchy | Operational/project Bot work organization; not a second Official Task SoR. |

### Existing project-Bot compatibility semantics

The observed `bot_worktree` project hierarchy includes year/project/role branches. One current project tree has role folders such as Board, configuration, schedule, system engineering, quality, safety, software, test, and shared areas; its Board branch carries inbox/ready/active/review/hold/done working states. Another project includes PM/system engineering/shared/test roles, with PM backup/rules/work areas.

These filesystem states are operational or transitional native state. They do not replace Linear Official Task status, Vault ArtifactRevision, human acceptance, or a future canonical WorkSession ledger. They can be referenced by an approved adapter/manifest after scope and restore tests pass.

An inspected behavior-profile rule folder is explicitly OFF and contains reusable contract/templates/candidates only. Its species/class/hero heuristic changes recommendation behavior only; it cannot change source truth, official priority/state/owner, approval, authority, tool, workspace, MCP, or memory permission. Tests, sessions, usage, compiled prompts, and active runtime bindings stay outside that rule folder. This is retained as a compatibility invariant for the Bot model below.

## Target source-tree policy

Use current canonical owners; do not create a new top-level source root without a later Owner-approved migration analysis.

| Kind of source | Exact owner path family |
| --- | --- |
| Application UI | `ui-workspace/apps/<app>` |
| Reusable UI package | `ui-workspace/packages/<package>` |
| Cross-project product logic | `guild_hall/<exact_owner_module>` |
| Reusable skill/tool/knowledge/profile | `.registry/<kind>/<id>` |
| Workflow / Party / Mission | `.workflow/<id>`, `.party/<id>`, `.mission/<id>` |
| Root-level architecture contract | `docs/architecture/<owner-group>` |

Every new module receives an exact owner path before code is created. Ad hoc root folders, parallel “new platform” trees, and scattered copies of module logic are prohibited.

## Target installed/runtime layout (logical only)

Current layouts are intentionally kept separate. This plan does not recommend merging them under a new common runtime parent before a private inventory, caller graph, backup/restore, and migration-risk review. The target layout is an alias model for pack manifests:

```text
runtime_root/
  server-pack/<version>/{bin,modules,manifests,health,release}
  team-client/<version>/{client,config-template,cache,outbox,doctor,release}
  tool-workshop/<workshop>/<version>/{adapter,health,lease,release}
  project-ai-team/<project>/<deployment>/<version>/{binding,cache,outbox,release}
  restore-staging/<operation-id>/
```

`config-template`, `binding`, and `release` contain references/checksums/policy only. Plaintext secrets are never placed in a release artifact. Project payload, canonical source, agent memory/session, local scratch/cache, secret references, backup generation, release bundle, and restore staging each have a different owner and retention policy.

## Bot folder model (target, not materialized here)

```text
agent_families/<family-id>/
  marks/<mark-id>/<revision>/
    soul_ref  skill_tool_profile_refs  authority_policy  evaluation  rollback
  current_pointer

project_teams/<project-ref>/<role-id>/
  deployment_binding  assignment_refs  runtime_refs  secret_ref
  memory_generations/        # metadata/ref, not raw cross-project context
  sessions_runs/             # bounded refs/receipts
  workspace_cache_outbox/    # client/runtime-local state under policy
  result_evidence_refs
  backup_restore_refs
```

Project context remains a separately owned accepted-context/Vault surface. Client-local memory is disposable/recoverable runtime state; neither becomes a default cross-project knowledge store. Existing Bot role folders remain reference-in-place operational views until their bindings, callers, backup/restore, and Official-SoR non-conflict gates pass.

## Module skeleton rule

Every new `guild_hall` module or app-local deep module uses this structure or an owner-approved equivalent:

```text
<module>/
  README.md                 # owner, scope, current/target, no-authority claims
  module.manifest.json      # semantic interface, dependencies, capabilities, release fields
  interfaces/ adapters/ schemas/ src/
  tests/ fixtures/ validators/
  migrations/ docs/ manual/
  release/                  # compatibility, SBOM/checksum refs, release notes
  health/                   # start/stop/doctor/preflight contracts
  recovery/                 # backup/restore/rollback contract
```

The manifest declares required/optional dependencies, schema compatibility, data owner, config/secret refs, default-off state, health/readiness, startup/shutdown, migration, rollback/deprecation, backup/restore, synthetic fixtures, integration contract, and release evidence. Dependency DAG and cycle detection run before startup. A module with compatible semantic interfaces can upgrade/roll back without forcing unrelated product upgrades.

## Physical move decision table

| Surface / decision | Disposition | Rule |
| --- | --- | --- |
| Canonical roots and existing source checkout | KEEP_IN_PLACE | No big-bang source migration. |
| Existing `dev-erp`, `dev-erp-mcp`, Engine, Watch, backup, workspace paths | REFERENCE_IN_PLACE | Add manifests/adapters before any deeper change. |
| New bounded module | NEW_TARGET | Create only at an exact current owner path after leaf approval. |
| Existing callers | COMPATIBILITY_PATH | Keep until caller, dependency, upgrade, rollback, and restore tests pass. |
| Bot filesystem role/Board/Work views | SPLIT_LATER | Classify operational native state vs canonical records; do not promote by folder name. |
| Common runtime parent | MERGE_LATER / HOLD | Consider only after inventory/risk/restore/caller analysis. |
| Unused legacy adapter | DEPRECATION_CANDIDATE | Keep until a compatibility and restore gate approves retirement. |
| Any actual move/rename/delete | HOLD | Requires dry run, pointer/caller map, backup/restore, owner approval. |

## Implementation order for physical design

1. Build product/module/pack indexes and manifests without moving code or data.
2. Add skeleton/compatibility adapter for one approved module only.
3. Prove callers/dependencies, cycle/startup, unit/integration, upgrade/rollback, and restore behavior.
4. Deepen or relocate one module only after its prior path remains compatible and every caller/restoration gate passes.
5. Record release artifact, checksums, SBOM, release notes, install/upgrade/rollback manual; do not deploy it in this planning task.

## Related plans

- [Deployment packs](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Guild runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Bastion recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Roadmap](14_ROADMAP_GATES_AND_DAG.md)
