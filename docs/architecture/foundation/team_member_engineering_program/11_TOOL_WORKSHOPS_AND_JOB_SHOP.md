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

## Build skeleton

Each future Workshop module contains an owner README, module manifest, interfaces/adapters, schemas, source, tests/fixtures/validators, migration notes, docs/manual, release/compatibility metadata, health/start/stop/doctor contract, and backup/restore declaration. A new Workshop starts default-off with synthetic fixtures; no license/PC discovery or external action is implicit.

## Current status

2026-09-07 CURRENT: the isolated XLSX workshop now uses a durable SQLite journal
with transaction-bound leases, fencing, cancellation and restart replay. The
fixed Node writer and separate validation child produce exact hash/size candidate
receipts; both reuse the existing project-history XLSX implementation. The bounded
PPTX adapter reuses the existing template text-replacement code, separately verifies
native contents, and reimports the actual candidate for PNG review. Its configured
27 tests and independent review cover resource/profile mismatch, database-lock
expiry, strict existing-state reopening, drift and candidate validation. Native
openpyxl and python-pptx readback confirm the isolated samples. Without the explicit
synthetic PPTX runtime binding, 26 tests pass and one actual rendering test is skipped.
The Tool Workshop Pack carries the actual source dependency closure and the same
source/installed smoke suite. Node 24+ is required for the durable runtime.

The PPTX profile is currently two ASCII text slides only; general/Korean presentation
profiles and HWPX/CAD/PCB adapters remain implementation, rather than Owner approval.
This evidence does not establish a physical Tool PC, Office round-trip/printing,
operational disaster recovery, upstream execution authorization, artifact
acceptance or the remaining specialist adapters. Those implementation and
integration steps remain in the whole release-candidate goal. Operational inputs
and activation require their existing owner bindings.

## Related plans

- [Guild runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Deployment packs](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Acceptance plan](13_TEST_DOGFOOD_ACCEPTANCE.md)
