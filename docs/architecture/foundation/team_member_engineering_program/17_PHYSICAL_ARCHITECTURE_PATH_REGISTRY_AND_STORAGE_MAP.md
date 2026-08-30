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
Product axis (stable IDs; display names remain draft)
product.erp       Soulforge ERP
product.engine    Soulforge Engineering Engine
product.agent     Soulforge Agent Platform

Portfolio axis
SF-P01 Work Discovery     SF-P02 ERP & Assets       SF-P03 Operations
SF-P04 AI Workforce       SF-P05 Knowledge          SF-P06 Engine Family
SF-P07 Tool Workshops     SF-P08 Security/Recovery  SF-P09 Adoption

Physical-root axis (independent enum)
source_checkout | runtime_root | data_root | control_root | project_work_root
tool_root | recovery_root | external_runtime_root | external_owner_store
secret_owner_root
```

A product can use several physical roots, and a physical root can serve several products. Product folders are catalog views and release manifests, not a reason to duplicate bytes or create competing sources of truth.

## Current observed public-safe shape

Host-local path values remain private/runtime configuration. Read-only metadata
observation confirms the existing classes identified below; target-only rows are
explicitly labeled and are not existence claims:

| Alias | Observed contents | Current interpretation |
| --- | --- | --- |
| `source_checkout` | canonical roots, docs, `guild_hall`, UI workspace | public source/canon, not runtime data |
| `runtime_root` | runtime checkout and installed compatibility surfaces | runtime compatibility, not a new canon |
| `data_root` | backups, config, ingress, ingress-MCP, manifests, quarantine, runtime, state, timeline | existing custody/data plane with mixed lifecycle-oriented layout |
| `control_root` | backup controller, history, ingress control, local activity, mail, rollback, Slack, tools, voice label, Watchtower | protected control and receipt plane |
| `project_work_root` | `COMMON`, `MFG`, `PJT`, `TOOL`; project/year/role branches | operational Bot/project work organization, not Official Task or artifact truth |
| `tool_root` | specialist tool support | tool/runtime owner, not project canon by itself |
| `recovery_root` | isolated recovery-test targets | test-only recovery surface |
| `external_runtime_root` | source-local Buzz/Hermes and later managed runtime bindings | external/runtime owner; not Soulforge installed runtime or ERP truth |
| `external_owner_store` | source SaaS, Drive, NAS, source repositories | original/source-local authority under its ACL |
| `secret_owner_root` | OS/Secret Manager protected identity and credential custody | `TARGET/VERIFY_PHYSICAL`; never materialized in public canon or `data_root`; registry stores `secret_ref` only |

### Alias crosswalk with plan 15

| Plan 15 alias | Plan 17 root class |
| --- | --- |
| `source_checkout` | `source_checkout` |
| `runtime_checkout` | `runtime_root` |
| `data_plane` | mixed legacy container: classify child bindings as `data_root`, `runtime_root`, or `secret_owner_root`; no whole-root mapping |
| `control_plane` | `control_root` |
| `buzz_runtime` | mixed legacy container: classify source/data/backup children under `external_owner_store` or `data_root`, and executable/session children under `external_runtime_root` |
| `bot_worktree` | `project_work_root` |

`_workmeta` and `private-state` are nested private repositories whose current
physical containment may be under a source checkout, but their logical records
belong to `data_root` and `control_root` respectively. `_workspaces` is a
project-materialization surface mapped to `project_work_root` or the exact
approved `external_owner_store` binding by project policy. R1 must register
these as explicit multi-axis rows rather than infer ownership from containment.

The seven canonical roots remain the public structural authority and take
precedence over physical aliases:

| Canonical root | Physical interpretation |
| --- | --- |
| `.registry` | canonical catalog/knowledge/skill/tool owner inside `source_checkout` |
| `.unit` | active Unit owner inside `source_checkout`; runtime bindings remain separate |
| `.workflow` | workflow canon inside `source_checkout` |
| `.party` | reusable orchestration template canon inside `source_checkout` |
| `.mission` | held mission plan owner inside `source_checkout` |
| `guild_hall` | cross-project Module owner inside `source_checkout`; runtime state binds separately |
| `_workspaces` | project materialization root, additionally registered under `project_work_root` or exact external binding |

Physical-root classes are aliases for storage/runtime resolution, not new
canonical roots or replacement owner surfaces.

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
├─ 10_SOURCE_CAPTURE_CATALOG/
│  ├─ linear/
│  ├─ slack/
│  ├─ mail/
│  ├─ voice-plaud/
│  ├─ cloud-drive/
│  ├─ buzz/
│  ├─ hermes/
│  ├─ git/
│  ├─ nas/
│  ├─ pc-activity/
│  ├─ team-files/
│  └─ run-logs/
├─ 20_PROJECT_ASSET_INDEX/
│  └─ <project-ref>/
├─ 25_EVENT_TIMELINE_INDEX/
│  ├─ occurrences/
│  ├─ correlations/
│  ├─ decisions/
│  ├─ validity-intervals/
│  └─ supersession/
├─ 30_KNOWLEDGE_INDEX/
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
├─ 50_AI_WORKFORCE_INDEX/
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
│  ├─ git/
│  ├─ nas/
│  └─ projects/
├─ 70_QUARANTINE/
├─ 80_CUSTODY_RECEIPT_INDEX/
├─ 90_PROJECTIONS/
│  └─ watch-4192/
└─ 99_RESTORE_REQUEST_REFS/
```

This target is an ERP-facing catalog/index view, not a second project-context,
timeline, ontology, Agent-memory, receipt, or recovery-byte authority. Entries
point to current approved source/custody owners, immutable revision stores,
backup generations, or rebuildable projections. `_workmeta/<project>/` remains
project-context canon; approved source/Drive lineage remains ontology authority;
source-native, routing, project, and accepted World-Tree timelines retain their
distinct owners. `20`, `25`, `30`, and `50` store pointers, typed relations,
scope, accepted-generation refs, and status unless an exact custody policy
separately authorizes bytes. A physical copy is permitted only by its
source-kind policy and exact promotion/backup gate.

### NAS의 두 역할은 별도 자산이다

`NAS`라는 한 단어를 두 방향에 재사용하지 않는다.

| 역할 | 흐름 | ERP/Registry가 기록하는 것 | 현재 판정 |
| --- | --- | --- | --- |
| NAS backup target | Soulforge/ERP/HPP/project custody bytes → approved NAS lane | 보호 대상 source generation, destination custody ref, manifest/hash, backup generation, restore readback·acceptance | Backup Controller 계약 존재; public tree만으로 actual NAS health·최신 backup/restore는 `UNKNOWN/HOLD` |
| NAS source asset | NAS에 원래 존재하는 설계·시험·공유 자료 → source catalog/custody decision | `source.nas` identity, ACL/owner, observed revision, hash/manifest pointer, project binding, 별도 backup/restore evidence | exact native capture receipt와 source policy가 없어 `HOLD` |

`60_BACKUP_GENERATIONS/nas/`의 `nas`는 **보호 대상 source kind가 NAS**라는
뜻이다. Soulforge 데이터를 NAS에 보냈다는 뜻은 destination ref/receipt가 소유하며,
폴더명으로 추정하지 않는다. 반대로 NAS source asset을 ERP DB에 통째로 복제하지
않는다. 기본은 metadata/pointer이고, bytes는 exact custody policy와 acceptance가
있을 때만 승인된 byte owner가 보관한다. NAS backup target의 사본을 다시
`source.nas`로 자동 인입하여 재귀 백업하는 것도 금지한다.

4192는 실제 evidence가 연결될 때 `NAS backup target`과 `NAS source asset`을
서로 다른 row/status로 보여야 한다. 전자는 backup/restore readiness, 후자는
capture/project-binding/custody readiness다. 둘 중 하나의 green으로 다른 하나를
green 처리하지 않는다.

`25_EVENT_TIMELINE_INDEX` indexes durable event memory owned by its exact
source/project/accepted-context surface; `90_PROJECTIONS` is rebuildable
presentation. They must not be merged, and the index cannot widen project scope.
The `secret_owner_root` has no directory in this target tree: plaintext secret
material is a forbidden materialization class.

Custody/data receipts may be indexed at `80`; writer-authority, lease,
operational checkpoint, action, and rollback receipts remain under
`control_root`. `99` contains restore request/proof refs only. Actual restore
bytes and staging targets belong under an exact `recovery_root` binding.

## Uniform external-source lane

```text
10_SOURCE_CAPTURE_CATALOG/<source-id>/
├─ binding/
├─ capture-generations/
├─ manifests/
├─ backup-generation-refs/
├─ restore-tests/
├─ receipts/
├─ quarantine-refs/
├─ current-projection/
└─ legacy-path-map/
```

`legacy-path-map` is metadata, not a symlink, silent fallback, or second writer.
`backup-generation-refs` points to the canonical generation/index owned by
`60_BACKUP_GENERATIONS`; it never duplicates generation bytes. Each source
remains independently scoped, credentialed, retained, backed up, and restored.
`pc-activity`, `team-files`, and `run-logs` use `source_class: internal_capture`;
Linear, Slack, mail, voice, cloud, Buzz, Hermes, Git, and NAS use the exact
external/runtime/source-owner class rather than being silently treated as
equivalent. The R1 source inventory is registry-driven and contains every Plan
10 source as a row, including explicit `HOLD` rows; a self-selected source list
cannot satisfy full coverage.

## Path Registry contract

Owner assignment recorded 2026-08-31: `guild_hall/path_registry` owns the public
schema/logical entries, resolver runtime, and protected binding-adapter contract;
actual private binding bytes remain under the `control_root` sole writer.
`guild_hall/bastion_action` owns operation-aware write-policy validation with
Human Owner final authority. `guild_hall/watch_panel_contract` owns the 4192
projection contract and Team Ops Board is the read-only consumer. The approved
materializer canary logical ref is `pathref:recovery.physical_spine_canary`;
private physical binding, ACL, and apply/readback evidence remain `HOLD`.

Every registered path record contains at least:

| Field | Meaning |
| --- | --- |
| `logical_path_id` | stable caller-facing ID, independent of drive letter |
| `physical_root_class` | exact enum: `source_checkout`, `runtime_root`, `data_root`, `control_root`, `project_work_root`, `tool_root`, `recovery_root`, `external_runtime_root`, `external_owner_store`, `secret_owner_root` |
| `logical_owner_class` / `parent_binding_ref` | logical authority and physical-containment relation are separate |
| `product_refs` / `portfolio_refs` | stable `product.*` and `SF-Pxx` IDs; display names remain draft |
| `module_owner_ref` | exact Module/interface owner |
| `asset_or_source_class` | source, project, knowledge, artifact, agent, backup, receipt, projection, etc. |
| `project_or_org_scope_ref` | exact project or approved organization/common scope; no implicit cross-project view |
| `binding_refs` | current/target/shared/PC-local binding refs with node/site, binding revision, epoch, and expiry; no public absolute path |
| five owner refs | logical, byte, revision, acceptance, backup/restore owners |
| `sensitivity` / `acl_policy_ref` | access classification and current authorization source |
| `write_policy` | sole writer, append/create-only, read-only, rebuild-only, or forbidden |
| `backup_class` / `retention_policy_ref` | authoritative, rebuildable, runtime-local, or forbidden |
| `current_state` | current, target, reference-in-place, migrating, deprecated, held, unknown |
| `manifest_ref` / `latest_receipt_ref` | exact evidence without payload |
| `migration_ref` / `rollback_ref` | bounded change and recovery pointers |

Callers use a resolver such as `resolve(logical_path_id, actor_context)` and do
not embed new absolute paths. Registry schema version and resolver version are
explicit. Registry unavailable, schema incompatible, ambiguous binding, scope
mismatch, expired binding, or unregistered write returns a stable HOLD with no
legacy/default/environment fallback. The write guard initially binds the R1/R2
materializer and every newly changed program writer; existing live collectors
remain reference-in-place until their named R5 migration leaf, where guard
adoption and writer cutover are proven. The resolver is not source truth, task,
acceptance, or promotion authority.

Write authorization is operation-aware and binds exact registry revision,
binding epoch, writer identity, actor scope, and operation
`read|create|append|overwrite|delete|move`. `read_only`, `forbidden`, stale
current/target bindings, unauthorized overwrite/delete, and wrong sole writer
are denied before filesystem access. Tests must cover append-vs-overwrite,
delete/move denial, stale resolution, current/target fencing, and writer
revocation rather than only unregistered paths.

When the same source has both data and control paths, payload/capture/generation
bytes and their manifests resolve under `data_root`; writer authority, leases,
operational checkpoints, rollback instructions, and control receipts resolve
under `control_root`. A control receipt may reference data but cannot own or
rewrite it.

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
  -> writer quiescence and cutover epoch/fence
  -> compare-and-swap caller switch with compatibility adapter
  -> rollback rehearsal
  -> later retirement decision
```

Move, rename, delete, junction replacement, mirror/purge, and writer migration are forbidden until their exact leaf passes. New captures may adopt a target lane earlier only when old/new writers cannot conflict and source policy authorizes the target.

R2 reuses or matches the hardened path primitives already present in
`guild_hall/shared/knowledge_root_resolver.mjs`. It rejects junction/reparse
substitution, UNC/device paths outside the approved class, alternate data
streams, Unicode/Windows alias collisions, traversal, and component-by-component
realpath containment drift. Every newly materialized HPP data surface is
classified in the same slice as backed up, deterministically rebuildable, or
forbidden, and its recovery policy plus synthetic restore fixture change
together.

## 4192 Storage & Backup Map

4192 owns a read-only projection over registered roots and source lanes. It shows root/source identity, owner pointer, binding availability, latest accepted capture and backup generation, coverage, freshness, retention/RPO policy presence, isolated restore/readback, human restore acceptance, unclassified path count, path drift, migration state, and held reason.

```text
row_key | row_kind(root|source|asset_class) | logical_id | physical_root_class
registry_snapshot_ref | registry_snapshot_digest | registry_record_ref
binding_state | latest_capture_ref | backup_generation_ref | coverage_state
coverage_registered | coverage_expected | unclassified_count | path_drift_state
freshness_state | retention_policy_state | rpo_policy_state | restore_test_ref
human_acceptance_state | migration_state | applicability_state
watch_state | evidence_at | owner_pointer | hold_code
```

Missing evidence renders `unknown` or `hold`, never green. 4192 excludes source bodies, project payload, credentials, private Agent memory, deep Buzz/Hermes sessions, and raw logs. It files an approval request at most; Bastion owns any later action execution.

The map is an existing-node backup-readiness projection, not a new source
display: the 4192 federated topology (RED-02 pinned artifact) already owns
Slack, mail, PLAUD/voice, collector, and custody-store node identity and
health truth, so map rows resolve to those stable node IDs via registry
`topology_node_refs`/`registry_record_ref`/`owner_pointer` and add only
backup-generation, coverage, freshness, restore-test, path-drift, and HOLD
overlay/detail. Duplicate source identity is rejected at registry
construction; a source without an existing stable topology identity (Linear
today) appears only through the same registry contract.

Adapters map source/storage states into plan 08's Watch-local enum
`healthy|degraded|stale|unavailable|unknown|hold`; no source-specific state
silently widens that enum or creates a green state.
`not_applicable` rows are excluded from expected coverage only by an explicit
registry record. Aggregate precedence is deterministic:
`hold > unavailable > stale > degraded > unknown > healthy`; no evidence is
`unknown`, not `not_applicable` or green.

## Original-vision coverage checklist

| Class | Included examples |
| --- | --- |
| work discovery | Chat schedules, source occurrences, candidate/no-action/correction reasons |
| Official Task and decisions | Linear task/history, Work Brief, assignment and decision refs |
| project assets | source, sonar/test data, BOM/material/inventory, templates, references, artifacts, baselines/releases |
| knowledge/world tree | source catalog, ontology, evidence/claim/decision/time/ACL, project context, RAG/Wiki/NotebookLM |
| Engineering Engine | Core, Domain Engine, rule/profile/binding/result revisions |
| reusable execution canon | Skill, Workflow, Party, Mission, canon-to-mission promotion and local run-truth refs |
| human workforce | organization, role, onboarding/training, privacy/classification and authorized project scope |
| AI workforce | organization graph, Agent Family, Mark, runtime profile, Deployment, Run, memory generation, skill/tool policy |
| collaboration/source estate | Linear, Slack, mail, voice/PLAUD, cloud/Drive, Buzz, Git, NAS, PC/internal captures, channel/thread/attachment pointer and receipts |
| team execution | MCP, authenticated binary plane, Team Client, local outbox/checkpoint, Tool Workshop |
| observation | 4192 product/source/storage/backup/restore/usage/health projections |
| assurance and recovery | custody, quarantine, validation, review, human acceptance, backup, restore, rollback, audit |
| rollout and support | Server/Client/Workshop/Project-AI-Team/Backup Packs, training, device/ring/support evidence |
| isolation | separate project-manager/deep-context bindings, no implicit cross-project memory/source fallback |

This is broader than the first Linear or KVDS vertical. A first vertical proves interfaces; it does not reduce the final scope.

## Implementation sequence

| Order | Leaf | Exit evidence |
| --- | --- | --- |
| R0 | Physical Architecture rebaseline | reviewed root/data/source/asset map and no-move contract |
| R1 | Path Registry + resolver contract | `validate:path-registry` target: exact owner decisions; schema/version/root/logical-owner/scope/current-target binding rows; operation-aware grant; no fallback; guarded writers; unregistered/stale/wrong-writer operation fails closed |
| R2 | Target folder materializer | `validate:target-materializer` target: exact `approved_empty_materialization_root_ref`, hostile Windows/reparse/realpath guards, HPP backup classification, dry-run/apply, idempotent replay, existing payload move 0, rollback removes only empty directories created by this operation |
| R3 | 4192 Storage & Backup Map | `validate:watch-storage-map` target: registry snapshot digest, full registry-driven source/root coverage, row totals/unclassified/drift, state precedence and N/A, unknown without evidence, no writer/raw fields |
| R4 | Linear whole-workspace actual backup | capture, immutable generation, readback, isolated restore, human acceptance |
| R5 | Existing source lanes | Slack, mail, voice, cloud, Buzz, Hermes, Git, NAS, PC/internal captures, knowledge, project assets — one at a time |
| R6 | Agent/project/tool bindings | Project AI Team Pack, Team Client, Workshop, actual project vertical |
| R7 | Physical migration/retirement | caller, restore, compatibility, rollback, and Owner gates pass |

R0–R3 are the organization spine and precede remaining actual-provider and
physical expansion; they do not retroactively block the already-completed
synthetic MCP/Vault/Forge leaves. R4 starts after external/storage/restore
gates. R5–R7 remain incremental and do not justify a big-bang relocation.

Execution status (2026-08-31, `L-PHYS-SPINE`): the R1–R3 CONTRACT surfaces
exist as the synthetic module `guild_hall/path_registry` and the three
validators above are live npm scripts. Integration hardening `e57c4576`
adds authenticated materializer receipts and partial-apply recovery, semantic
clock rejection, registry-digest/safe-ref validation, and OD-10-aware Storage
Map HOLD behavior (17/10/11 tests). The tracked seed also registers nine
whole-estate asset classes (knowledge, project assets, artifacts, templates,
BOM/material, datasets, test results, Engine rules/profiles, and AI workforce)
as explicit held catalog rows, so an unbound or unprotected asset class cannot
disappear from registry-driven coverage. The seed carries four
`hold:od-10.*` authority sentinels, so every mutating authorization fails
closed and no readiness claim is representable. Enforcement wiring, real
binding registration, materializer apply on a real root, 4192 wiring, and any
physical movement remain behind private binding/ACL/canary readback and exact
enforcement wiring. R0 acceptance and OD-10 owner/projection assignments are
recorded; they do not by themselves activate a writer or physical path.

R5 has begun without physical movement: pure Mail, Slack and Voice/PLAUD
adapters transform their exact accepted native capture/custody receipts into
refs-only `capture_generation` records. They emit no backup, restore,
human-acceptance, retention or RPO field, so capture-only evidence remains
`degraded`. No private record writer or actual receipt caller is activated.
An in-memory append-only Source Lane ledger now validates exact replay,
conflict, generation order, ref reuse, time order and capture→backup→restore
digest chains. It projects evidence completeness but owns no persistence,
backup bytes, restore execution, health or acceptance.
The same module now has a separate 9-class asset revision ledger and a
project-bound PC-activity coverage adapter. Asset revision/acceptance/backup/
restore evidence remains refs-only and authority-neutral. Cloud, Git and NAS
stay explicit HOLD rows because no exact native capture receipt was observed.
The 4192 server now also has a default-OFF GET-only storage-map adapter whose
binding bytes, snapshot bytes and registry digest are pinned; no actual private
binding or snapshot is supplied by public code.

## Acceptance and stop conditions

The spine is accepted only when every known root/high-value path has one
unambiguous multi-axis registry entry or an explicit unclassified/HOLD finding;
the seven canonical roots keep precedence; registry/schema/resolver/binding/
write-policy owners are exact; root classes remain distinct; current and target
cannot silently both write; project scope cannot widen; private/raw/secret data
stays out of public canon and 4192; source-specific backup evidence cannot be
substituted; the materializer is idempotent, hostile-path guarded,
non-destructive, and rollback-aware; operation-aware authorization rejects
ambiguous/unregistered/stale/wrong-writer actions; 4192 coverage is
registry-driven; and focused validators plus fresh independent review pass.

Hold the affected branch on unknown owner/SoR, secret requirement, cross-project leak, path overlap, missing restore proof, writer conflict, unresolved caller, destructive migration, or false readiness claim.

## Current claim ceiling

- `CONFIRMED`: inspected public plan/source/Module/Pack facts only.
- `OBSERVED_METADATA_ONLY`: evidenced runtime/data/control/project-work and external root existence or shape; ownership, contents, ACL, health, and backup completeness need accepted receipts.
- `TARGET/VERIFY_PHYSICAL`: `secret_owner_root` and any other target-only root/binding until an accepted existence/ownership receipt is available.
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
