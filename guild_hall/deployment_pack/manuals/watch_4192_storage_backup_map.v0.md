# 4192 Storage and Backup Map — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.watch_4192_storage_backup_map.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or operator exercise acceptance is recorded.

## Purpose

Build and inspect the read-only 4192 Storage & Backup Map from a Path Registry snapshot and bounded evidence overlay. The map shows coverage/readiness/HOLD state; it never writes source, backup, or runtime data.

## Prerequisites

- A validated registry snapshot and only approved public-safe evidence references are supplied.
- Each row has an owner pointer and any state claim has a matching evidence clock.
- The operator understands that a map is a projection, not a backup, restore, acceptance, or writer authority.

## Allowed and forbidden actions

- Allowed: create the projection, inspect coverage/unclassified/drift totals, check aggregate precedence, and open safe owner pointers.
- Forbidden: creating a topology node, writing a backup, changing a registry row, exposing raw source/body/credential material, marking missing evidence healthy, or filing an action beyond the Watch request boundary.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:watch-storage-map
npm.cmd run validate:watch-bastion
```

- `guild_hall/path_registry/src/storage_map_projection.mjs` provides `buildStorageMap` and `aggregateStorageMapState`.
- `guild_hall/path_registry/src/path_registry_core.mjs` provides `registrySnapshot` and `verifyRegistrySnapshot`.
- `guild_hall/watch_panel_contract/src/watch_panel_contract.mjs` provides the Watch state and safe-pointer contract.

## Expected readback and evidence

- Registry snapshot reference/digest, row totals, expected/registered coverage, unclassified count, drift state, and aggregate Watch state.
- For each evidence-bearing row, only capture/backup/restore references, freshness, acceptance state, owner pointer, and typed HOLD details.
- Missing evidence renders `unknown` or `hold`; `not_applicable` requires an explicit registry row.

## HOLD / stop

Stop when snapshot verification fails, registry coverage is incomplete, unclassified count is nonzero, evidence is missing/mismatched/stale, a row has no safe owner pointer, or any raw/writer/protected field is presented. Do not infer readiness from a rendered map.

## Rollback and escalation

The map has no rollback side effect. Preserve its snapshot/evidence references, correct the owner-source evidence through the owning system, and request a fresh projection. Escalate any restoration or backup request through Watch/Bastion and the exact source owner.

## Known issues

- The current map is a 41-row public-safe seed/contract projection, not a served runtime snapshot.
- It deliberately separates a NAS source asset from a NAS backup destination and treats both as held without their own evidence.
- This candidate has no `last_verified_release` and no operator exercise receipt, so it cannot release a 4192 storage/backup workflow.
