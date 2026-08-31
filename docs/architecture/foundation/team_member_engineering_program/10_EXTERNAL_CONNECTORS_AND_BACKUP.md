# External System Connectors and Backup Plan

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Rule

Every external system remains source-local for its native objects. A connector/adaptor is not proof of source truth, approval, writer authority, or successful backup. Each source needs an explicit identity/project binding, read/write scope, immutable capture generation, retention/ACL policy, backup manifest/hash, isolated restore method, and acceptance evidence.

## Connector/App lifecycle

Connectors are installable, removable and independently versioned capabilities:

```text
candidate → vetted → installed_off → configured → granted → active
→ degraded|held → upgrade|rollback → revoke → uninstall → tombstone
```

The catalog records stable connector/app ID, version, managed/custom/hybrid
ownership, source/action capabilities, account/project binding, read/write scope,
expiry/revocation, `secret_ref`, health/freshness/cursor, data/retention/backup
class, update/rollback and uninstall state. Soulforge Operations Console may display and
request these changes; it does not own credentials or silently activate actions.

## Collection, custody, sync and NAS disaster backup

These terms are not interchangeable.

| Term | Meaning |
| --- | --- |
| Capture/Collection | read/observe data from a source |
| Custody/Ingest | preserve exact bytes/manifest in an approved D: or owner store |
| Sync/Materialization | expose the same source/revision through a work or ERP view |
| Backup/DR | copy an accepted protected generation to the company NAS for server-PC failure recovery |
| Restore | reconstruct the generation in an isolated target and reconcile it |
| Human Restore Acceptance | authorized person accepts the restored state |

```text
source → D: capture/custody                  # not backup
accepted protected generation → company NAS # backup
NAS → isolated restore → reconciliation → human acceptance
```

NAS source assets and NAS backup targets stay separate; a backup copy cannot be
recursively re-ingested as a new source.

The current D: project byte owner remains the exact per-project approved backing
worksite already bound to `_workspaces/<project_code>` where such a binding
exists. No new company-wide D: canonical root is implied. Moving a project to a
different backing root requires private Path Registry binding, sole writer/ACL,
caller/Junction migration, backup/restore and rollback acceptance.

## Connector matrix

| System | Source-local SoR / objects | Connector and scope | Capture/revision/backup model | Current plan state |
| --- | --- | --- | --- | --- |
| Linear | Official Task status currently; task, relation, assignee, priority, due, Work Brief revision refs, comment/history, approved attachment refs as permitted | Read-only collector/backup before any writer migration; future task writer remains separately authorized | Immutable generation, ordered cursor/dedupe, manifest/hash, create-only generation, isolated restore and reconciliation | Feature-OFF synthetic foundation; real connection/backup/Human restore HOLD |
| Slack | Workspace/channel/message/thread/file metadata source | Exact bound read-only collector/query adapter | Source revision/cursor, coverage/gap, source-specific retention and capture manifest | Existing selective source foundations; live/project projection not inferred |
| Gmail / Hiworks / Outlook | Mailbox/message/attachment source | Query-only or bounded custodian under account/mailbox binding | Logical occurrence plus mailbox observation, body/attachment classification, source capture generation and restore | Adapter surfaces exist; no universal source promotion/backup acceptance |
| PLAUD | Recording/source occurrence | Approved local capture/normalization adapter | Session/time/provenance, derived text policy, delivery acknowledgement, source retention | No automatic task/knowledge authority |
| Drive | Source warehouse / approved reusable releases | Explicit connector/browser/manual access lane | Release manifest, revision/hash/classification, Drive→staging restore proof | Placement/read does not make canon; actual source access is separate |
| Buzz | Collaboration message/thread/attachment source | Source-local relay and safe pointer adapter | Postgres/media/Git/Redis-classified backup manifest, isolated restore, audit and identity recovery | Pure readiness contract exists; actual capture/restore/human acceptance remain VERIFY_PHYSICAL |
| Git | Source/release history | Repository adapter/read-only commit/reference query | Commit/tag/release manifest, dependency/SBOM checks, clone/restore/reproducible build | Public source is versioned; no team-client deployment claim |
| NAS | Owner-held original/backup target | Explicit owner-authorized source or one-way recovery target | Approved target, manifest/hash, isolated restore; reachability is not approval | No automatic ingest/upload/mutation or assumed access |
| PC history | Node-local activity/source evidence | Bounded, consented local adapter | Occurrence/receipt/capture generation; no surveillance/transcript collection | Never a replacement task or human acceptance record |

## Linear backup design

Linear remains current Official Task SoR. The backup lane is intentionally read-only and does not mark tasks complete or migrate the writer.

### Required capture coverage

- tasks and stable external IDs;
- parent/related task relations, state/assignee/priority/due changes;
- task descriptions and Work Brief revisions only when separately permitted by scope/classification;
- comments/history and approved attachment descriptors/bytes only when explicit attachment policy permits it;
- pagination/cursor/window completeness, source deletion/edit ambiguity, and per-object source revision;
- source scope, read credential reference, collection run identity, and exact collector version.

### Immutable generation workflow

```text
owner-approved scope + read-only credential ref
  -> claim one bounded collection run
  -> cursor/pagination capture and dedupe
  -> immutable generation manifest + ordered object digest
  -> project index for every catalog project + unassigned bucket
  -> create-only backup generation
  -> isolated restore
  -> source/generation reconciliation
  -> human restore acceptance
```

The collector must make `partial`, `missing`, `deleted`, `failed`, and `unknown` explicit. A CSV/XLSX export by itself is incomplete. Restore cannot write back to Linear as part of a backup test; it reconstructs an isolated read model and checks generation parity.

The source unit is the entire Linear workspace, not one pilot project. The
workspace generation is stored once, then a deterministic project index binds
every catalog project—even a zero-issue project—to its issue refs and places
project-less issues in `unassigned`. This follows the Slack stable-ID rule but
does not duplicate descriptions/comments into twelve copies. Project display
names are mutable labels; workspace/project IDs and generation digests own
identity. The aggregate manifest must prove every issue appears exactly once in
a project row or the unassigned row.

The shared Source backup contract now separates technical restore from human
acceptance. An exact capture and byte-owner manifest can bind a create-only
backup pointer and technical restore candidate. It cannot emit an accepted
restore record until a separately verified authority envelope is bound to the
acceptance owner, source/project scope, backup generation and restore digest.

## Chat-ledger reconciliation

Chat-created ledgers are covered as external/source-local systems even when a Google Sheet is used. A capture generation records why a row/candidate exists, no-action/dedupe/correction/supersession, schedule/run identity, source refs, reviewer/acceptance, freshness, and downstream ERP/Linear reconciliation status. No source sheet or chat transcript becomes ERP truth until its immutable capture and accepted projection pass their own gate.

## Connector lifecycle and detachment

Each connector publishes a module manifest with external system ID, semantic interface/schema versions, supported object/revision coverage, required/optional dependencies, capability discovery, read/write capability, health/readiness, source-binding/secret refs, startup/shutdown, default-off flag, retention/backup/restore strategy, rollback/deprecation policy, fixture, validator, integration contract, and release notes.

When its interface compatibility holds, a connector may upgrade or roll back independently. Consumers see an explicit compatible/incompatible state rather than silently consuming a changed payload. Dependency DAG validation rejects a connector cycle that would make a source system depend on its own projection for collection.

## Required first external proof

For each system, prove in order: synthetic fixture → adapter integration with no live effect → one explicitly scoped read-only source capture → immutable backup generation → isolated restore/reconciliation → human acceptance → repeated bounded runs. Only then consider a downstream Vault/Forge/Guild integration. Connectors may run in parallel only when source scope, credentials, byte stores, and side effects are disjoint.

## Related plans

- [Bastion recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Buzz / Hermes](07_BUZZ_HERMES_COLLABORATION.md)
- [Testing](13_TEST_DOGFOOD_ACCEPTANCE.md)
- [Roadmap gates](14_ROADMAP_GATES_AND_DAG.md)
- [Physical architecture and Path Registry](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md)
