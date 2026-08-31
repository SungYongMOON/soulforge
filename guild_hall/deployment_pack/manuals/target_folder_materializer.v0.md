# Target folder materializer — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.target_folder_materializer.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or operator exercise acceptance is recorded.

## Purpose

Plan a new empty materialization surface from approved registry data and, only after the exact physical canary gate, apply or roll back directories created by that operation. Existing payload is never moved by this procedure.

## Prerequisites

- The approved logical root is `pathref:recovery.physical_spine_canary` and its private binding/ACL/readback gate is accepted outside this manual.
- The plan has a registry snapshot and backup classification for every proposed surface.
- The operator has no conflicting writer and no existing payload may be present at the target.

## Allowed and forbidden actions

- Allowed: plan generation, hostile-path validation, dry-run inspection, idempotent replay check, and empty-only rollback of directories created by the same receipt.
- Forbidden: moving, renaming, deleting, mirroring, purging, overwriting, replacing a reparse point, creating a non-empty target, or applying without the exact Owner-approved canary.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:target-materializer
```

- `guild_hall/path_registry/src/target_materializer.mjs` provides `planTargetMaterialization`, `applyTargetMaterialization`, and `rollbackTargetMaterialization`.
- `guild_hall/shared/knowledge_root_resolver.mjs` is the hostile-path containment defense referenced by the materializer.
- `guild_hall/path_registry/src/path_registry_core.mjs` provides the registry snapshot/readiness inputs.

## Expected readback and evidence

- Plan reference, registry snapshot digest, approved root reference, proposed directory count, and backup classifications.
- An apply receipt, if separately approved, with created-directory references, `payload_moved: 0`, and idempotent replay result.
- A rollback receipt listing only still-empty directories created by that exact operation.

## HOLD / stop

Stop when the approved root is held, a binding/ACL/readback is absent, a target is non-empty or occupied, a reparse/realpath/UNC/alias/traversal guard fails, the registry changes, or any proposed data class lacks its recovery classification.

## Rollback and escalation

Only call `rollbackTargetMaterialization` with the matching receipt and current approved containment context. If any directory is not empty or cannot be proven to be operation-owned, leave it untouched and escalate the receipt, snapshot digest, and hold code.

## Known issues

- The materializer is a public-safe contract; physical apply/readback remains held.
- It creates empty folders only and does not migrate existing work.
- This candidate has no `last_verified_release` and no operator exercise receipt, so it cannot release a materialization procedure.
