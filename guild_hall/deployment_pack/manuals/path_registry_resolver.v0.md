# Path Registry and resolver — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.path_registry_resolver.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or operator exercise acceptance is recorded.

## Purpose

Inspect the public Path Registry contract, resolve an explicit logical reference, and verify that unavailable, stale, ambiguous, unregistered, or unauthorized operations fail closed. This procedure does not register physical bindings or authorize writes.

## Prerequisites

- An exact logical path ID, actor context, operation, and registry snapshot are supplied by their owners.
- The requested scope and registry version are explicit; no environment/default/legacy path fallback is allowed.
- Private binding bytes, sole-writer details, and physical activation evidence remain outside this manual.

## Allowed and forbidden actions

- Allowed: schema/seed validation, read-only snapshot inspection, `resolvePath` readback, `registryReadiness` status, and authorization-denial verification.
- Forbidden: `registerBinding`, `updateRecord`, inventing a physical location, applying a binding, writing through a target/current row, or treating a typed HOLD as a fallback prompt.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:path-registry
```

- `guild_hall/path_registry/src/path_registry_core.mjs` provides `createPathRegistry`, `resolvePath`, `authorizeOperation`, `registrySnapshot`, `verifyRegistrySnapshot`, and `registryReadiness`.
- `guild_hall/path_registry/data/registry_seed_v0.mjs` is the public held-seed reference.
- `docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md` owns the R1 resolver and operation-aware policy boundary.

## Expected readback and evidence

- Registry schema/version, snapshot digest, logical path reference, scope result, and typed resolution or HOLD code.
- For an operation check, exact registry revision, binding epoch, writer identity reference, and an allow/deny result without a physical location.
- A readiness result showing why activation remains held when private binding/readback evidence is absent.

## HOLD / stop

Stop when the registry is unavailable, schema-incompatible, unregistered, ambiguous, out of scope, expired, held, or missing an approved operation-aware grant. Stop on destructive `delete` or `move` requests; they are gated until their migration leaf is accepted.

## Rollback and escalation

Do not mutate the registry to repair a resolver result. Escalate the logical reference, snapshot digest, and typed HOLD code to the public registry owner and protected binding/policy owners. A physical binding or migration rollback requires its own approved procedure.

## Known issues

- The tracked seed intentionally contains OD-10 hold sentinels and no physical binding data.
- The contract produces in-memory/public-safe results only; it does not enforce a live writer.
- This candidate has no `last_verified_release` and no operator exercise receipt, so it cannot release a resolver workflow.
