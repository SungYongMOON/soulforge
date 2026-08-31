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
| `bot_worktree` | Existing `COMMON`, `MFG`, `PJT`, and `TOOL` hierarchy | Mutable Agent work surface under `project_work_root`; not `_workspaces`, ERP canon, or a second Official Task SoR. |

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

## Product composition and source-ownership target

The three logical products need visible composition roots, but shared Modules
must not be copied into all three products. Source overlap is allowed only as a
versioned Interface dependency; one Module keeps one owner and one
Implementation.

### PC0 — current source/Module/Pack audit

- ERP product-specific source is partly concentrated in
  `ui-workspace/apps/dev-erp`, while Vault/Forge and related Modules remain under
  separate `guild_hall` owners.
- Engineering Engine already has the clearest product-local source root at
  `guild_hall/engineering_engine`.
- Agent Platform source is distributed across Agent Observation, Engineering
  MCP, Tool Workshop, Deployment Pack and runtime Adapters; no composition root
  exists.
- 29 Module manifests and four tracked Pack specs exist, but no
  `product.manifest` exists for ERP, Engine or Agent Platform.

### PC1 — no-move composition manifests

Before creating or moving a product folder, register the current owners through
three product manifests:

```text
ui-workspace/apps/dev-erp/product.manifest.json             # TARGET product.erp composition
guild_hall/engineering_engine/product.manifest.json         # TARGET product.engine composition
guild_hall/agent_platform/product.manifest.json              # TARGET product.agent composition-only root
```

Each manifest records product ID/version, product-specific Module refs, shared
Module dependencies, UI/entrypoint refs, required Interface versions, validator
closure, Pack/release refs, migration/rollback and deprecation state. It points
to existing source; it does not duplicate files or imply deployment.

Initial classification candidate:

| Product owner | Product-specific current source candidates | Shared dependencies, not copied source |
| --- | --- | --- |
| `product.erp` | `dev-erp`, `dev-erp-mcp`, Vault Revision, Forge Intent and exact ERP composition code | Path Registry, Backup/Recovery, RAG/Knowledge, identity/policy contracts |
| `product.engine` | Engineering Engine Core, Domain Engines, profiles, bindings and engine release | accepted-context/query, shared validation and custody refs |
| `product.agent` | Agent Observation, execution coordination, Engineering MCP, Hermes/Buzz Adapters, Tool Workshop and Deployment Pack composition | Path Registry, Backup/Recovery, identity/authority, Ledger contracts |
| shared operations | 4192/Watch and Bastion integration | typed read projections and approved action Interfaces only |

The classification is not final merely because a path is listed. PC2 must
resolve one logical owner, one Interface and current callers for every Module.

### PC2–PC3 — classification and product release closure

PC2 classifies every current Module as Product-owned or Shared and pins one
owner, one Interface, current callers and rejected duplicate paths. PC3 adds
product-level dependency closure, integration validators, Pack/release refs and
rollback/deprecation evidence without moving source.

### PC4 — physical product-root decision

The long-range product-first target may use either a new top-level `products/`
root or a `guild_hall/products/` hierarchy. This is an Owner decision because it
changes the canonical source tree. The candidate shape is:

```text
products/                                    # TARGET/OWNER_DECISION; not created
├─ erp/{apps,modules,interfaces,tests,manual,release}/
├─ engineering-engine/{core,domains,profiles,bindings,tests,manual,release}/
└─ agent-platform/{modules,interfaces,tests,manual,release}/

shared/                                      # TARGET/OWNER_DECISION; not created
├─ ledger/  identity-authority/  path-registry/
├─ custody-transfer/  backup-recovery/  policy/
└─ schemas/  validation/
```

PC4 cannot begin until PC1–PC3 have accepted root ownership candidates,
caller/import graph, Path Registry, Module/Pack manifests, product integration
tests and release/rollback closure. PC5 may then move one Module while a
compatibility Adapter keeps the prior path usable; PC6 repeats the bounded move
and retires a prior path only after caller/readback acceptance. No big-bang
move, copy, symlink tree or source duplication is allowed.

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

`_workspaces/<project_code>` is not part of this Bot folder model. It is the
ERP/Vault canonical project-file materialization address. Bots work in the
separate `bot_worktree` and submit result/evidence through the approved data
plane. ERP/Vault controls how the submitted project asset is revisioned and
materialized in `_workspaces`; the materialized revision may still be candidate,
under review, accepted, baselined, or released. A file's presence identifies the
canonical ERP surface, not any one of those acceptance states.

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

## Target Ledger, RAG, analytics, and learning-data placement (logical only)

No directory below is created or treated as active by this plan. Existing ledgers
stay reference-in-place until owner, caller, persistence, backup/restore and
compatibility gates pass.

```text
source_checkout/
└─ guild_hall/event_ledger/                    # TARGET shared mechanical module
   ├─ README.md  module.manifest.json
   ├─ schemas/{event_envelope,ledger_catalog,case_activity,relation,outbox,reconciliation}.schema.json
   ├─ src/{catalog,store,append,projection,outbox,reconciliation,export}.mjs
   ├─ adapters/  tests/  fixtures/  migrations/  recovery/  manual/

data_root/
├─ 00_CATALOG/
│  └─ ledger-catalog/                          # rows/manifests only; not event bodies
├─ 10_SOURCE_CAPTURE_CATALOG/<source-id>/      # refs to source-native custody/cursors/outboxes
├─ 25_EVENT_TIMELINE_INDEX/                    # refs/index over exact owner timelines
├─ 30_KNOWLEDGE_INDEX/rag/
│  ├─ generation-catalog/  evaluation/  active-pointer/  invalidation/
├─ 45_EVENT_STORES/                            # TARGET scoped stores, never one enterprise DB
│  ├─ projects/<project-ref>/<store-id>/
│  └─ organizations/<approved-org-scope>/<store-id>/
├─ 60_BACKUP_GENERATIONS/
│  └─ <registered-source-or-data-class-id>/    # registry-generated; no second hard-coded list
├─ 80_CUSTODY_RECEIPT_INDEX/
└─ 90_PROJECTIONS/{watch-4192,ledger-coverage}/

control_root/
└─ ledger-relay/
   ├─ checkpoints/  reconciliation/  poison-holds/  health/
   └─ rollback-receipts/

external_owner_store or existing source-local data owner/
└─ <source>/
   ├─ authoritative-records/
   ├─ cursor/                                  # where that source already owns it
   └─ transactional-outbox/                    # same owner-local transaction, if supported

_workmeta/<project_code>/
├─ daily_ledger/YYYY/
├─ log/events/YYYY/MM/battle_events.jsonl
├─ runs/<run_id>/{run,validation,closeout}_receipt.*
├─ reports/{procedure_capture,knowledge_access,review,source_coverage}/
├─ project_context/{events,decisions,summary_revisions,accepted_generations}/
└─ knowledge_rag_candidate_ledger/events/YYYY/MM/*.jsonl

_workspaces/system/rag/                        # public-safe/common metadata projections only
_workspaces/knowledge/rag/                     # approved project-agnostic common payload/index
_workspaces/<project_code>/<approved-variant-stage>/<artifact>/
└─ project-local RAG/analytics payload or index  # exact stage/artifact binding
_workspaces/<project_code>/<approved-project-root-extension>/
└─ project-local RAG/analytics payload or index  # separately approved extension
_workspaces/system/analytics/                  # cross-project only after Owner/ACL/consent approval
├─ process_mining/<dataset_id>/<version>/
└─ learning_datasets/<dataset_id>/<version>/
```

There is no universal project-root `reference_payloads/rag/` or `analytics/`
sibling. A project-local RAG or analytics dataset must bind to an exact generated
stage/artifact ID, or to a separately approved project-root extension registered
by the SE variant and Path Registry policy. Older project-knowledge documents
that still name a generic sibling are compatibility/migration inputs, not
activation authority; their callers and pointers must be reconciled before use.

The Catalog is central, but Event storage is partitioned by project/organization,
ACL, retention, legal hold and recovery blast radius. A single-writer SQLite WAL
behind an API/MCP port is allowed only for one bounded single-project pilot; it is
not the enterprise target and is never a file share opened by clients.

Source-native cursor and transactional outbox stay with the authoritative owner.
The central relay owns only delivery checkpoint, reconciliation and poison/HOLD
state. A source-local commit and a central append are not described as one
distributed transaction. Existing `ingress` lifecycle folders remain
reference-in-place and are registered beneath `10_SOURCE_CAPTURE_CATALOG`; this
target block does not create a competing capture writer.

Raw bytes stay in their source/custody owner. `_workmeta` remains metadata-only;
`summary_revisions` and `accepted_generations` keep compact refs/digests rather
than source bodies. RAG indexes are rebuildable projections; the exact source/
ledger cutoff, generation/evaluation/active-pointer/invalidation history has a
separate metadata owner and backup class. Mining/learning datasets are derived
assets with project/org scope, manifest, source digests, ACL/consent/redaction,
feature/label authority, temporal/group split, duplicate/leakage/bias review,
retention and rollback. Operational ledgers are never copied into training
corpora by default.

Domain Modules depend on a shared envelope/writer port; `event_ledger` does not
import Domain semantics. This keeps the dependency direction one-way and allows
the existing module cycle validator to reject a future adapter/store cycle.

The Owner's 2026-08-30 whole-estate clarification is detailed in
[17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md).
It changes priority, not the destructive-action boundary: root classes, Path
Registry, source-oriented catalog view, write guard, and 4192 Storage Map are
defined now; existing payload relocation remains one bounded class at a time
after backup/restore/caller/rollback proof.

## Related plans

- [Deployment packs](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Guild runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Bastion recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Roadmap](14_ROADMAP_GATES_AND_DAG.md)
- [Physical architecture and Path Registry](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md)
