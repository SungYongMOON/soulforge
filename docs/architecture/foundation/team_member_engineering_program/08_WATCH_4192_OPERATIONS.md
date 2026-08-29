# Watch / 4192 Operations and Control Architecture

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose and correction

4192 is the Watch projection: an aggregate, typed, read-only operational view plus an approval-request surface. It is not a copied Buzz chat browser, a generic Bot session/memory inspector, a task writer, a queue, a control-plane executor, or a recovery controller.

An exact safe pointer may open the owning Buzz record when the caller is authorized. Watch retains only pointer metadata, not copied raw collaboration content.

## Required coarse projection

| Domain | Show | Do not show / do |
| --- | --- | --- |
| HPP / Windows / WSL / service/container | Reachability, version, configured health/readiness, held incident, freshness | Shell histories, secrets, raw service logs, automatic restart |
| Buzz relay / Postgres / Redis / MinIO / Git volume | Coarse availability, backup/restore readiness, version drift, incident code | Deep message/session/memory/status inspection |
| Hermes | Gateway/process/profile availability, deployment aggregate, stale/unknown state | Profile credential, full session, raw tool output |
| Task / Run / result | Aggregate task/run/result state and receipt count by permitted scope | A second Official Task truth or auto-Done |
| Tool workshop | Queue length, lease/fencing state, capacity/held reason | Tool payload, license secret, process control |
| Engineering Engine | Module version, validator/result health, unsupported/unknown state | Project acceptance or Engine decision override |
| Token / quota / cost | Aggregated measurement/freshness/confidence | Raw prompt/reasoning or hidden conversation content |
| Connector | Freshness, last accepted capture generation, gap/hold/error class | Source bodies or implicit connector write |
| Backup / restore | Generation/manifest/verification/restore-test readiness | A recovery action without Bastion authorization |

## Control boundary

```text
4192 typed projection
  -> human reviews an incident or request
  -> approved action request with policy/target/expiry
  -> Bastion controller validates and executes the authorized restart/isolation/restore/rollback
  -> receipt returns to Watch as a new projection
```

The Watch UI cannot execute its own request. A green panel, terminal idle state, or a provider response cannot replace an action receipt or human acceptance.

## Current topology-oracle hold

The public Watchtower topology adapter tests currently pass a federated snapshot contract. A Fable5 advisory found an incompatible topology oracle/count expectation. This plan keeps the issue open until the intended producer, recursive topology scope, and UI oracle are pinned in one versioned contract. The future test must reject node/edge count or digest drift rather than relying on a remembered count.

## Health model

Every panel reports one of `healthy`, `degraded`, `stale`, `unavailable`, `unknown`, or `hold`, plus an evidence time and owner pointer. Missing evidence is `unknown`, not green. A value is current only if its source-specific freshness window is met. This panel enum is Watch-local; the coarse runtime-availability vocabulary in [07](07_BUZZ_HERMES_COLLABORATION.md) is a distinct source-local enum that adapters map into these panel states rather than merge.

## Independence and release contract

Watch is detachable when it consumes versioned typed projections only. It publishes a module manifest, compatible schema range, capability discovery/readiness, source freshness policies, no-writer proof, synthetic/integration fixtures, UI release note, and rollback behavior. A Watch upgrade may be rolled back without changing Vault, Forge, Guild, Buzz, or Bastion when the projection schema contract remains compatible.

## Related plans

- [Buzz / Hermes boundary](07_BUZZ_HERMES_COLLABORATION.md)
- [Bastion action/recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Testing and dogfood](13_TEST_DOGFOOD_ACCEPTANCE.md)
