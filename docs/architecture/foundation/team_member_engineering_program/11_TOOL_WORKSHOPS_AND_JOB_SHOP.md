# Specialist Tool Workshops and Resource Job Shop

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose

Specialist tools are treated as constrained shared resources, not an unlimited capability a generic agent may switch to on demand. A Tool Workshop manages queue, lease, capacity, fencing, exact tool/library/PC version, input/output bundles, validator, custody, retry, timeout, rollback, and operator handoff.

## Workshop classes

| Workshop | Typical work | Required reproducibility evidence |
| --- | --- | --- |
| Document | DOCX/PDF authoring, render/inspection | Template family/revision/hash, renderer version, native readback and visual/semantic QA |
| Data / Excel | XLSX/data model/analysis | Workbook/schema/formula/chart/version, range checks, native round-trip/print evidence |
| HWPX | HWP normalization, HWPX document operations | HWPX input/export provenance, structural validator, render verification |
| Presentation | PPTX/diagram/render QA | Approved storyboard/content packet, template/version, editable output/readback/render QA |
| Allegro / PCB / CAD | EDA/CAD/CAE design work | Tool/library/version, input baseline, DRC/ERC/export/validator, artifact manifest |
| Sonar / test analysis | Dataset processing and analysis | Capture/run/calibration/version context, data integrity manifest, analysis/report validator |
| Archive | Catalog/retention/restore preparation | Inventory/hash/classification, no path traversal/archive bomb, restore test |
| Recovery | Isolated recovery and verification | Approved generation, target isolation, manifest/hash/readback, rollback receipt |

## Resource-job lifecycle

```text
approved task + Work Brief
  -> workshop request
  -> capability / version / project-scope check
  -> queue and exclusive lease
  -> fencing token
  -> immutable input bundle
  -> bounded tool run
  -> validator + output/evidence bundle
  -> custody receipt
  -> release lease / retry / rollback
  -> review and human acceptance path
```

### Capacity and fencing

- Capacity-one tools/PCs/licenses use one active lease per resource; UI idle or a process listing is not a lease release.
- A run includes `workshop_id`, `resource_id`, `lease_id`, fencing token, tool/library/PC version refs, input manifest, timeout, retry policy, and cancellation/recovery condition.
- Expired/invalid fence rejects output promotion. A timed-out tool does not cause automatic task completion or delete its workspace.
- Tool outputs are candidates until custody/revision/review/acceptance; workshop “success” is not acceptance.

## Team and project isolation

The same Workshop binary may be reused by multiple projects, but project team identity, project context, assignment, workspace, input bundle, output revision, and outbox/cache are isolated. A workshop does not become a cross-project knowledge or memory store.

## Tool Bot, job workspace, and persistent work-product ownership

A Tool Bot is the actual specialist executor, not merely a dispatcher. One PPT
Bot may serve many requesters, projects and files, but the shared ability and
the per-project/per-artifact state remain separate.

```text
project role WORK
  -> Tool Bot FIFO request
  -> TOOL/<tool>/JOBS/<project>/<job>/
  -> validated closeout receipt
  -> PJT/<year>/<project>/SHARED/WORK_PRODUCTS/<artifact>/
  -> Project Git metadata receipt
  -> independent review / Human Acceptance
  -> authorized accepted/current materialization
  -> separate backup generation
```

Logical target shape, not yet a physical-folder activation:

```text
<project_work_root>/
├─ TOOL/<tool>/JOBS/<project-code>/<job-id>/
│  ├─ REQUEST/        exact project, task, assignment, Work Brief, artifact,
│  │                   parent revision, tool/version, lease/fence and clocks
│  ├─ INPUT/          immutable job input bundle
│  ├─ WORK/           volatile active editing state
│  ├─ OUTPUT/         candidate output of this attempt
│  ├─ CHECKPOINTS/    closed meaningful-edit checkpoints for this job
│  ├─ VALIDATION/     native readback/render/semantic/format checks
│  └─ RECEIPT/        closeout, custody and cleanup eligibility metadata
└─ PJT/<year>/<project>/SHARED/
   ├─ WORK_PRODUCTS/<artifact-id>/
   │  ├─ artifact.yaml
   │  ├─ REQUESTS/{QUEUED,ACTIVE,REVIEW,DONE,HOLD}/
   │  ├─ WORKING/       one mutable head under one active writer/lease
   │  ├─ CHECKPOINTS/   closed Cxxxx edit checkpoints
   │  ├─ REVISIONS/     immutable Rxxxx candidate revisions
   │  ├─ VALIDATION/
   │  └─ RECEIPTS/
   └─ PROJECT_GIT/      manifest/hash/receipt/review metadata only
```

The Tool-job folder is one execution attempt and crash-recovery surface. The
project shared `WORK_PRODUCTS` folder is the persistent mutable/candidate
payload owner. Neither is Vault acceptance or ERP canon. Role-private drafts may
stay under `<role>/WORK`; transfer to `SHARED/WORK_PRODUCTS` requires the exact
artifact, parent revision, active writer/lease and copy/hash/readback receipt.

## Checkpoint, revision, and human-facing version

Three independent identifiers prevent ordinary filename history from becoming
the only lineage:

| Identifier | Meaning | Example |
| --- | --- | --- |
| `artifact_id` | Stable logical file/product identity across renames | `ART-<project>-PPT-001` |
| `checkpoint_id` | One closed meaningful edit state inside a job/branch | `C0003` |
| `revision_id` | Monotonic immutable candidate revision for the artifact | `R0007` |
| display version | Human-facing label and optional filename suffix | `V1.3` |

Autosave and ordinary intermediate saves remain volatile cache. A meaningful
slide/sheet/geometry edit may close a checkpoint. A validated work-request
bundle may select one checkpoint path and finalize one candidate revision. A
failed or rejected checkpoint remains a branch and never overwrites its parent.

```text
R0001
  -> C0001 slide 3 good
       -> C0002 slide 4 rejected
       -> C0003 slide 4 corrected
  -> R0002 / V1.1 selected from C0001 -> C0003
```

`V1.1` is a label, never parsed as a numeric authority. `R0002` and its content/
manifest digest own system lineage. Same bytes with a different parent still
form a separately identified revision event.

The finalization sequence is copy, full content hash, destination readback,
create-only revision finalize, validator/custody receipt, and later cleanup. A
Tool Bot never cuts/moves the only copy and never modifies an immutable
checkpoint or revision in place.

## FIFO, file-level writer isolation, and LLM context

The first physical profile fixes `capacity=1` and one global FIFO queue. The
existing pure core sorts priority then submission order; the FIFO profile sets
the same priority for every accepted job, producing submission order exactly.
Different tools/resources may have separate capacity, but one PowerPoint
resource processes one job at a time. The same artifact additionally has one
active writer/lease even if more Tool capacity is later added.

FIFO scheduling is independent from LLM context. A Tool Bot has:

1. one stable common instruction/Tool/Skill prefix suitable for provider prompt
   caching;
2. project context isolated by project/channel/session binding;
3. artifact state loaded from the exact ledger/checkpoint, not recalled from a
   global conversation; and
4. one request-specific suffix.

```text
global FIFO: A1 -> B1 -> A2 -> B2
session A: ALPHA marker, A artifact and A checkpoints only
session B: BRAVO marker, B artifact and B checkpoints only
```

Switching jobs persists the artifact checkpoint/compact state and releases the
active resource before another project's state is loaded. Project payload must
not enter a shared Skill, common prompt cache or cross-project memory. Prompt
cache is a cost optimization, not durable memory or evidence; missing cache
usage telemetry remains `UNKNOWN` rather than a failure of project continuity.

## Cache cleanup and retention

Cleanup is a separate two-phase operation: eligible -> soft-trash/quarantine ->
delayed purge. It never deletes from the persistent revision owner while
cleaning a job cache.

Conservative initial proposals, subject to project/customer/legal policy:

| State/data | Earliest automatic eligibility |
| --- | --- |
| autosave/temp after a successful closed revision | 14 days |
| successful closed job WORK/OUTPUT cache | 30 days after revision readback and required backup receipt |
| failed/cancelled job | 90 days after issue disposition |
| ACTIVE/REVIEW/HOLD, open lease, dispute or legal hold | no automatic expiry |
| immutable revisions, manifests, validators and receipts | no default automatic deletion |
| soft-trash before purge | 7 additional days |

Deletion is forbidden when a job is the only copy, parent/digest/manifest
diverges, the candidate revision is not create-only finalized, required
validation/receipt/backup evidence is absent, a writer/lease is open, or a
blocker/dispute/hold remains. Every cleanup plan and result is metadata-only,
exact-path scoped and recoverable during the grace period.

## NAS backup and recoverability axis

NAS is a one-way Backup/DR destination for closed immutable checkpoints/
revisions and required closed-job receipts. It is not the Tool writer, project
work root, current artifact head or reverse-sync winner. Open WORK/cache is
excluded unless an explicit short-retention checkpoint policy includes it.

```text
revision close -> backup enqueue -> native task complete -> manifest/readback
  -> NAS-side snapshot/retention -> isolated restore -> digest reconciliation
  -> Human Restore Acceptance
```

Artifact and backup states are independent:

```text
artifact: working -> candidate_closed -> reviewed -> human_accepted
          -> baselined -> released -> superseded/rejected

backup:   not_scheduled -> enqueued -> captured -> readback_verified
          -> restore_tested -> human_restore_accepted -> stale/failed
```

For a Windows local project-work volume and Synology-class Btrfs destination,
file-oriented Backup Task and whole-volume/PC backup are distinct lanes;
NAS-side snapshots protect the arrived store, while a second/offsite backup is
another layer. A mapped-drive copy or sync-success indicator never proves the
source revision can be restored. Exact device/package/current-state evidence
belongs in a private review packet.

## Hermes and Buzz two-Bot permission pilot

The first live-shaped but zero-project-effect pilot uses:

- one `tool-ppt` Hermes profile with the reviewed PowerPoint Skill and only
  synthetic artifact-state/candidate-receipt MCP calls; and
- one separate `work-product-verifier` profile with no editing Skill and only
  synthetic artifact-state/manifest-verification MCP calls.

Both profiles disable built-in tools for CLI/Buzz, automatic background Skill
review, curator, memory nudge and Skill-management capability. They use separate
home/session/writer identity and one loopback synthetic MCP with no filesystem,
network, credential or project-payload effects.

Observed bounded results (2026-08-31): PowerPoint Skill tests 21/21 passed; Tool
Workshop/FIFO tests 9/9 passed; direct MCP stdio smoke passed all three tools;
standalone Hermes permitted calls succeeded and cross-profile write/verify
negative calls were denied; named A/B sessions returned their own markers after
an A->B->A switch with foreign-marker count zero; both ACP checks passed.

The Buzz-facing ACP comparison found a current runtime limitation. Configured
MCP discovery is asynchronous: configured-MCP opt-in needed a settle interval
before first use. With `HERMES_ACP_SKIP_CONFIGURED_MCP=1`, cached profile schemas
could remain visible, so that variable is not a deny gate by itself. After
settling with configured MCP enabled, each profile exposed its different allowed
write/read tool and calls succeeded, but generic read-only MCP prompt/resource
helper tools also remained visible. The production Agent remains `HOLD` until an
exact Buzz managed-Agent save/readback proves the approved profile, environment,
startup readiness and tool list.

A later bounded physical-file pilot used only synthetic PPT content and the two
approved logical pilot roots. It preserved `C0000`, the good slide-3 `C0001`, a
bad slide-4 branch `C0002`, and a corrected branch `C0003` from `C0001`; only
`C0003` was finalized as `R0001/V1.1`. Independent hash/readback verification
and four-slide PNG rendering passed, and the wrong branch did not enter the
candidate revision. This advances the PPT Workshop fixture to
`physical_file_candidate_verified`; it does not accept the artifact, approve a
backup, bind a production runner, or authorize real project payload. Linear,
NAS, `_workspaces`, OneDrive and acceptance effects remain zero. Buzz Agent
creation/channel smoke are still held because the interactive desktop session
could not be controlled reliably; the profile MCP used for the pilot was a
temporary loopback process and was stopped after the run.

## Build skeleton

Each future Workshop module contains an owner README, module manifest, interfaces/adapters, schemas, source, tests/fixtures/validators, migration notes, docs/manual, release/compatibility metadata, health/start/stop/doctor contract, and backup/restore declaration. A new Workshop starts default-off with synthetic fixtures; no license/PC discovery or external action is implicit.

## Current status

The repository has tool-related skills, the in-memory capacity/fence core, and a
bounded synthetic PPTX file fixture with one private file-level candidate test.
No approved production Team Workshop runtime/lease service, persistent MCP
service, Buzz Agent binding, or real-project file authority is claimed by this
plan. Build the first production Workshop only after the Team Member MCP and
Vault revision vertical prove their core contracts, unless its inputs/effects
are fully isolated and separately approved.

## Related plans

- [Guild runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Deployment packs](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Acceptance plan](13_TEST_DOGFOOD_ACCEPTANCE.md)
