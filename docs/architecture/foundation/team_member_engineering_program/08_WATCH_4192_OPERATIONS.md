# Vigil(포트 4192) Operations and Control Architecture

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose and correction

Vigil is the Vigil projection: an aggregate, typed, read-only operational view plus an approval-request surface. It is not a copied Buzz chat browser, a generic Bot session/memory inspector, a task writer, a queue, a control-plane executor, or a recovery controller.

An exact safe pointer may open the owning Buzz record when the caller is authorized. Vigil retains only pointer metadata, not copied raw collaboration content.

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

The Vigil UI cannot execute its own request. A green panel, terminal idle state, or a provider response cannot replace an action receipt or human acceptance.

## Current topology-oracle hold

RESOLVED 2026-08-30: the intended producer, topology scope, and UI oracle are now pinned in one versioned contract, `guild_hall/watchtower/topology/federated_topology.v1.contract.json` (summary, per-provider counts, artifact SHA-256). The producer test verifies the tracked artifact against the fresh emit and the pin; the Board unified-view tests derive every count expectation from the same pin. Node/edge/provider/digest drift now fails closed on both sides instead of relying on a remembered count; deliberate topology growth updates the pin in the same change.

## Health model

Every panel reports one of `healthy`, `degraded`, `stale`, `unavailable`, `unknown`, or `hold`, plus an evidence time and owner pointer. Missing evidence is `unknown`, not green. A value is current only if its source-specific freshness window is met. This panel enum is Vigil-local; the coarse runtime-availability vocabulary in [07](07_BUZZ_HERMES_COLLABORATION.md) is a distinct source-local enum that adapters map into these panel states rather than merge.

## Storage and backup map

The whole-estate physical organization is specified in
[17](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md). Vigil must
project every registered root and external-source lane through one read-only
Storage & Backup Map: binding state, latest accepted capture, backup generation,
coverage, freshness, restore test, human restore acceptance, retention/RPO
policy presence, migration state, unclassified count, and held reason. Missing
evidence is `unknown` or `hold`, never green.

Source bodies, project payload, credentials, private Agent memory, deep
Buzz/Hermes session detail, and raw logs remain excluded. This requirement does
not authorize a storage writer, migration, backup execution, or recovery action.

## Soulforge Operations Console App Platform target

`4192` remains the compatibility/runtime handle. The official functional
description is `Soulforge Operations Console`; the memorable software brand is
Owner-deferred and will later use `[software name] — Soulforge Operations
Console`. This is a detachable App Platform, not a fourth product, and adds
versioned Apps without turning the UI into each domain's source of truth.

Initial Apps cover Product/System Health, Project/Task/Run/Artifact projection,
Agent/Tool/Workshop status, Connector/App install/version/scope/freshness,
Storage/Collection/Backup/Restore, Token/Quota/Cost, Authority & Access and
Incident/Action Request.

Later Apps may expose Process Mining, activity/time/rework/cost, request-channel
mix, project/work type diversity, Agent/Tool performance, bottleneck analysis and
R&D source crawling/candidate discovery. These remain evidence-backed
projections; no automatic personnel score, surveillance expansion or domain
acceptance is allowed.

### Owner Authority & Access App

The Owner must be able to request grant, expiry, revoke and emergency STOP for
Person/Agent/Device/Connector × Project/TaskType/Action capability envelopes.
The UI shows current A0–A6/JM state, writer epoch, scope, expiry, revocation and
before/after/readback receipts. Vigil remains request/projection only. The ERP
AuthorityPolicy store is the canonical sole writer; Bastion performs pre-write
validation, enforcement and emergency STOP. Neither the UI nor a projected
receipt may write policy directly.

## Independence and release contract

Vigil is detachable when it consumes versioned typed projections only. It publishes a module manifest, compatible schema range, capability discovery/readiness, source freshness policies, no-writer proof, synthetic/integration fixtures, UI release note, and rollback behavior. A Vigil upgrade may be rolled back without changing Vault, Forge, Guild, Buzz, or Bastion when the projection schema contract remains compatible.

## Related plans

- [Buzz / Hermes boundary](07_BUZZ_HERMES_COLLABORATION.md)
- [Bastion action/recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Testing and dogfood](13_TEST_DOGFOOD_ACCEPTANCE.md)
- [Physical architecture and Path Registry](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md)
