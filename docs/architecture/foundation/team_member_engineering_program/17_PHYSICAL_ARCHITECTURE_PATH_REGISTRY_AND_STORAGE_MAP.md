# Physical Architecture, Path Registry, and Storage Map

> Status: `OWNER_REVIEW_DRAFT` — the Human Owner confirmed on 2026-08-30 that the whole Soulforge physical organization must be fixed before further product expansion. This document records that direction without moving, copying, or deleting any existing payload.

## Purpose

Soulforge already has product seams, Modules, Packs, source connectors, Agent profiles, project work folders, knowledge projections, and several operational data/control roots. The missing organizing spine is one physical architecture that tells every human and Agent:

- which root owns source, runtime, data, control, project work, tools, recovery, and external originals;
- where each logical asset class belongs;
- how current paths remain usable while target organization is introduced;
- how a caller resolves a path without embedding a host-local absolute path;
- how 4192 reports storage, capture, backup, restore, and migration readiness; and
- which evidence is required before a physical move or readiness claim.

The immediate goal is **structure now, movement later**. Defining and enforcing the map cannot be deferred; destructive relocation can and must be staged.

## Owner direction captured on 2026-08-30

1. The scope is the whole Soulforge estate, not Linear or the Agent Platform alone.
2. Linear, Slack, mail, voice/PLAUD, cloud/Drive, Buzz, PC activity, team files, and later connectors must appear through the same source-oriented catalog shape.
3. Project assets, knowledge/ontology/context, AI workforce assets, artifacts, templates, BOM/material data, datasets, backup generations, receipts, and restore evidence must be locatable without reading conversation history.
4. 4192 must expose a read-only Storage & Backup Map for all registered roots and sources without exposing raw bodies, private memory, credentials, or deep collaboration data.
5. Existing source/runtime/data/control/Bot paths are registered first. They are migrated one bounded class at a time only after backup, restore, caller, and rollback evidence passes.
6. New work resolves a registered logical path or stops with an unregistered-path HOLD.

## Product and physical axes

```text
Product axis                         Physical-root axis
Soulforge Engineering OS             source_checkout
├─ Soulforge ERP                     runtime_root
├─ Soulforge Engineering Engine      data_root
└─ Soulforge Agent Platform          control_root
                                      project_work_root
                                      tool_root
                                      recovery_root
                                      external_owner_store
```

A product can use several physical roots, and a physical root can serve several products. Product folders are catalog views and release manifests, not a reason to duplicate bytes or create competing sources of truth.

## Current observed public-safe shape

Host-local path values remain private/runtime configuration. Read-only metadata observation confirms these classes exist:

| Alias | Observed contents | Current interpretation |
| --- | --- | --- |
| `source_checkout` | canonical roots, docs, `guild_hall`, UI workspace | public source/canon, not runtime data |
| `runtime_root` | runtime checkout and installed compatibility surfaces | runtime compatibility, not a new canon |
| `data_root` | backups, config, ingress, ingress-MCP, manifests, quarantine, runtime, state, timeline | existing custody/data plane with mixed lifecycle-oriented layout |
| `control_root` | backup controller, history, ingress control, local activity, mail, rollback, Slack, tools, voice label, Watchtower | protected control and receipt plane |
| `project_work_root` | `COMMON`, `MFG`, `PJT`, `TOOL`; project/year/role branches | operational Bot/project work organization, not Official Task or artifact truth |
| `tool_root` | specialist tool support | tool/runtime owner, not project canon by itself |
| `recovery_root` | isolated recovery-test targets | test-only recovery surface |
| `external_owner_store` | source SaaS, Drive, NAS, source repositories | original/source-local authority under its ACL |

The current `data_root` already has mail, Slack, voice, PC activity, team-file, run-log, quarantine, runtime, checkpoint, receipt, and timeline surfaces. The problem is not an empty disk: people see processing stages while they need a stable source- and asset-oriented catalog view. Linear, cloud/Drive, Buzz, Hermes, knowledge, and cross-project asset views are not yet materialized as one coherent ERP-facing catalog.

## Target data-root catalog view

Numeric prefixes are presentation order, not authority or database keys.

```text
data_root/
├─ 00_CATALOG/
│  ├─ path-registry/
│  ├─ owners/
│  ├─ storage-classes/
│  ├─ asset-classes/
│  └─ legacy-path-map/
├─ 10_EXTERNAL_SOURCES/
│  ├─ linear/
│  ├─ slack/
│  ├─ mail/
│  ├─ voice-plaud/
│  ├─ cloud-drive/
│  ├─ buzz/
│  ├─ pc-activity/
│  ├─ team-files/
│  └─ run-logs/
├─ 20_PROJECTS/
│  └─ <project-ref>/
├─ 30_KNOWLEDGE/
│  ├─ source-catalog/
│  ├─ ontology/
│  ├─ project-context/
│  ├─ accepted-generations/
│  ├─ rag-indexes/
│  ├─ wiki-projections/
│  └─ notebooklm-bindings/
├─ 40_ASSETS/
│  ├─ artifacts/
│  ├─ templates/
│  ├─ bom-material/
│  ├─ datasets/
│  ├─ test-results/
│  └─ revisions/
├─ 50_AI_WORKFORCE/
│  ├─ agent-families/
│  ├─ agent-marks/
│  ├─ runtime-profiles/
│  ├─ deployments/
│  ├─ runs/
│  └─ memory-generations/
├─ 60_BACKUP_GENERATIONS/
│  ├─ linear/
│  ├─ slack/
│  ├─ mail/
│  ├─ voice/
│  ├─ cloud/
│  ├─ buzz/
│  ├─ hermes/
│  └─ projects/
├─ 70_QUARANTINE/
├─ 80_RECEIPTS/
├─ 90_PROJECTIONS/
│  └─ watch-4192/
└─ 99_RESTORE_STAGING/
```

This view does not require all bytes to move. A catalog entry may point to a current approved source/custody root, immutable revision store, backup generation, or rebuildable projection. A physical copy is permitted only by its source-kind policy and exact promotion/backup gate.

## Uniform external-source lane

```text
10_EXTERNAL_SOURCES/<source-id>/
├─ binding/
├─ capture-generations/
├─ manifests/
├─ backup-generations/
├─ restore-tests/
├─ receipts/
├─ quarantine-refs/
├─ current-projection/
└─ legacy-path-map/
```

`legacy-path-map` is metadata, not a symlink, silent fallback, or second writer. Each source remains independently scoped, credentialed, retained, backed up, and restored.

## Path Registry contract

Every registered path record contains at least:

| Field | Meaning |
| --- | --- |
| `logical_path_id` | stable caller-facing ID, independent of drive letter |
| `root_class` | source, runtime, data, control, project work, tool, recovery, external owner |
| `product_refs` | ERP, Engine, Agent Platform consumers; never inferred ownership |
| `module_owner_ref` | exact Module/interface owner |
| `asset_or_source_class` | source, project, knowledge, artifact, agent, backup, receipt, projection, etc. |
| `physical_binding_ref` | private/runtime binding ref; no public absolute path |
| five owner refs | logical, byte, revision, acceptance, backup/restore owners |
| `sensitivity` / `acl_policy_ref` | access classification and current authorization source |
| `write_policy` | sole writer, append/create-only, read-only, rebuild-only, or forbidden |
| `backup_class` / `retention_policy_ref` | authoritative, rebuildable, runtime-local, or forbidden |
| `current_state` | current, target, reference-in-place, migrating, deprecated, held, unknown |
| `manifest_ref` / `latest_receipt_ref` | exact evidence without payload |
| `migration_ref` / `rollback_ref` | bounded change and recovery pointers |

Callers use a resolver such as `resolve(logical_path_id, actor_context)` and do not embed new absolute paths. An unregistered write fails closed. The resolver is not source truth, task, acceptance, or promotion authority.

## Existing-path migration rule

```text
read-only inventory
  -> classify owner and data class
  -> register reference-in-place binding
  -> manifest/hash/coverage evidence
  -> accepted backup generation
  -> isolated restore/readback
  -> caller and dependency map
  -> bounded materialization canary
  -> caller switch with compatibility adapter
  -> rollback rehearsal
  -> later retirement decision
```

Move, rename, delete, junction replacement, mirror/purge, and writer migration are forbidden until their exact leaf passes. New captures may adopt a target lane earlier only when old/new writers cannot conflict and source policy authorizes the target.

## 4192 Storage & Backup Map

4192 owns a read-only projection over registered roots and source lanes. It shows root/source identity, owner pointer, binding availability, latest accepted capture and backup generation, coverage, freshness, retention/RPO policy presence, isolated restore/readback, human restore acceptance, unclassified path count, path drift, migration state, and held reason.

```text
source_id | binding_state | latest_capture_ref | backup_generation_ref
coverage_state | freshness_state | restore_test_ref | human_acceptance_state
rpo_policy_state | migration_state | evidence_at | owner_pointer | hold_code
```

Missing evidence renders `unknown` or `hold`, never green. 4192 excludes source bodies, project payload, credentials, private Agent memory, deep Buzz/Hermes sessions, and raw logs. It files an approval request at most; Bastion owns any later action execution.

## Original-vision coverage checklist

| Class | Included examples |
| --- | --- |
| work discovery | Chat schedules, source occurrences, candidate/no-action/correction reasons |
| Official Task and decisions | Linear task/history, Work Brief, assignment and decision refs |
| project assets | source, sonar/test data, BOM/material/inventory, templates, references, artifacts, baselines/releases |
| knowledge/world tree | source catalog, ontology, evidence/claim/decision/time/ACL, project context, RAG/Wiki/NotebookLM |
| Engineering Engine | Core, Domain Engine, rule/profile/binding/result revisions |
| AI workforce | organization graph, Agent Family, Mark, runtime profile, Deployment, Run, memory generation, skill/tool policy |
| collaboration | Slack, mail, voice/PLAUD, Buzz, channel/thread/attachment pointer and receipts |
| team execution | MCP, authenticated binary plane, Team Client, local outbox/checkpoint, Tool Workshop |
| observation | 4192 product/source/storage/backup/restore/usage/health projections |
| assurance and recovery | custody, quarantine, validation, review, human acceptance, backup, restore, rollback, audit |
| rollout and support | Server/Client/Workshop/Project-AI-Team/Backup Packs, training, device/ring/support evidence |

This is broader than the first Linear or KVDS vertical. A first vertical proves interfaces; it does not reduce the final scope.

## Implementation sequence

| Order | Leaf | Exit evidence |
| --- | --- | --- |
| R0 | Physical Architecture rebaseline | reviewed root/data/source/asset map and no-move contract |
| R1 | Path Registry + resolver contract | current paths registered by private binding refs; unregistered write fails closed |
| R2 | Target folder materializer | dry-run/apply to an approved root, idempotent replay, existing payload move 0 |
| R3 | 4192 Storage & Backup Map | full source/root row coverage, unknown without evidence, no writer/raw fields |
| R4 | Linear whole-workspace actual backup | capture, immutable generation, readback, isolated restore, human acceptance |
| R5 | Existing source lanes | Slack, mail, voice, cloud, Buzz, Hermes, knowledge, project assets — one at a time |
| R6 | Agent/project/tool bindings | Project AI Team Pack, Team Client, Workshop, actual project vertical |
| R7 | Physical migration/retirement | caller, restore, compatibility, rollback, and Owner gates pass |

R0–R3 are the organization spine and precede new product/provider expansion. R4 starts after external/storage/restore gates. R5–R7 remain incremental and do not justify a big-bang relocation.

## Acceptance and stop conditions

The spine is accepted only when every known root/high-value path has one registry row or an explicit unclassified/HOLD finding; root classes remain distinct; current and target cannot silently both write; private/raw/secret data stays out of public canon and 4192; source-specific backup evidence cannot be substituted; the materializer is idempotent, path-bounded, non-destructive, and rollback-aware; ambiguous/unregistered writes fail closed; and focused validators plus fresh independent review pass.

Hold the affected branch on unknown owner/SoR, secret requirement, cross-project leak, path overlap, missing restore proof, writer conflict, unresolved caller, destructive migration, or false readiness claim.

## Current claim ceiling

- `CONFIRMED`: public plan/source/module/pack foundations and metadata-observed root classes.
- `OBSERVED_METADATA_ONLY`: runtime/data/control/project-work shape; contents, ACL, health, and backup completeness need accepted receipts.
- `TARGET`: Path Registry, source catalog, 4192 Storage Map, whole-workspace Linear actual backup, and migrations.
- `HOLD`: physical move/delete/rename, new writer, credential use, restore application, and readiness/promotion until exact gates pass.

## Related plans

- [Master decisions](00_MASTER_INDEX_AND_DECISIONS.md)
- [Vault / ERP asset revisions](03_VAULT_ERP_ASSET_REVISIONS.md)
- [Engineering MCP, client, data plane](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [Guild Agent Mark and runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Watch / 4192 operations](08_WATCH_4192_OPERATIONS.md)
- [Bastion security and recovery](09_BASTION_SECURITY_RECOVERY.md)
- [External connectors and backup](10_EXTERNAL_CONNECTORS_AND_BACKUP.md)
- [Deployment and rollout](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Test and acceptance](13_TEST_DOGFOOD_ACCEPTANCE.md)
- [Roadmap and gates](14_ROADMAP_GATES_AND_DAG.md)
- [Folder compatibility](15_FOLDER_COMPATIBILITY_MIGRATION.md)
