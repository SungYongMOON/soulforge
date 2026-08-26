# PCB Compliance Integration Request v0

## Domain-local result

This branch adds only `guild_hall/engineering_engine/engines/pcb_compliance/**`.
It implements a candidate deterministic adapter, schema, public-safe source packet, fixture,
tests, manual, zero-write runner, and pre-release manifest factory. It does not modify the shared
Core, profile schemas, root package scripts, whole-engine manifests/topology/release, or
Watchtower federation.

## Requested sequential integration checks

1. Register `pcb_compliance` in the shared engine discovery/topology/manifest surface using the
   factory integration lane; do not copy this package into the Core.
2. Add any whole-engine test entry only after the domain-local focused suite is accepted.
3. Regenerate shared topology/release/manifest only from the integration branch's canonical tool.
4. Preserve the controlled-IPC `UNKNOWN/HOLD` behavior. Do not add standard body text, inferred
   acceptance criteria, project payload, or an applicability default during integration.

## Shared-surface decision requests

- `HOLD`: whether a future cross-domain evidence-field vocabulary should be promoted. This v0
  intentionally uses domain-local field names and `null` artifact mappings.
- `HOLD`: whether a lawful, Owner-approved private project binding may introduce a controlled
  standard adapter; this public package has no authority to do so.
- `HOLD`: any production registration, release, writer/action authority, or actual project run.
