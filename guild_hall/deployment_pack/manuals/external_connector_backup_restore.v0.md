# External connector backup and restore — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.external_connector_backup_restore.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or human restore acceptance is recorded.

## Purpose

Run the public-safe synthetic backup/isolated-restore proof and describe the evidence required before any separately approved external connector backup or restore. It does not operate a live connector or claim recovery readiness.

## Prerequisites

- The request names one approved source scope and the backup/restore owner; no source body is supplied to this manual.
- Any physical connector, binding, destination, and human acceptance pin are supplied through their protected owner surface.
- The operator understands that a technical restore receipt and a human acceptance receipt are separate artifacts.

## Allowed and forbidden actions

- Allowed: deterministic synthetic canary validation, technical receipt validation, and review of source/backup/restore references.
- Forbidden: reading protected connector configuration, claiming a numeric recovery objective, self-accepting a restore, live extraction, overwrite, or backup-destination changes without the exact physical gate.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:synthetic-recovery-canary
npm.cmd run validate:backup-generation-contracts
npm.cmd run validate:backup-controller
```

Topology v2 check-only preflight, run from the INSTALLED controller runtime and
never from a source checkout:

```powershell
node INSTALLED_PACK_ROOT/payload/guild_hall/backup_controller/topology_v2_cli.mjs check --binding PRIVATE_BINDING_ABSOLUTE_PATH
```

- `guild_hall/backup_controller/synthetic_recovery_canary_runner.mjs` provides `validateSyntheticRecoveryCanaryTechnicalReceipt` and `syntheticRecoveryCanaryTechnicalReceiptDigest`.
- `guild_hall/backup_controller/synthetic_recovery_canary_acceptance.mjs` provides `acceptSyntheticRecoveryCanary` and `validateSyntheticRecoveryCanaryAcceptanceReceipt`.
- `guild_hall/backup_controller/source_backup_generation_contract.mjs` is the generation/manifest contract reference.
- `guild_hall/backup_controller/topology_v2_actual_reader.mjs` reads the bound resources and emits the preflight packet; `topology_v2_actual_port.mjs` is its only filesystem surface and every call on it is a read.

## Expected readback and evidence

- A technical receipt with manifest and backup/restore hash readback, isolated-restore result, and item/byte parity.
- An exact source, backup generation, and restore-test reference; no copied source body.
- If a Human Owner separately accepts it, a distinct acceptance receipt bound to the exact technical receipt digest.
- For the topology v2 check: `reader_status`, `preflight_status`, the binding ref and digest, and the blocker list. `PREFLIGHT_OFF_READY` means only that the frozen binding still matches observed resources. It reports `feature_state: off`, `activation_authority: false` and `backup_run_authorized: false`, and it grants no activation, NAS write, restore or acceptance.

## HOLD / stop

Stop on missing scope, missing generation/restore reference, digest mismatch, non-isolated restore, parity gap, absent human acceptance pin, expired/revoked acceptance, or any live connector that has not passed its physical gate. A green synthetic receipt does not unblock a live recovery claim.

For the topology v2 check, stop on any reader hold or preflight blocker and fix the RESOURCE, not the binding. A moved resource, a new link or reparse point, a stray entry in either canonical target or the rollback target, or an installed-pack byte change are all real drift. Re-generating the binding to make a check pass would erase the only thing the check measures.

## Rollback and escalation

Do not change a connector or destination to recover from a failed proof. Preserve the technical receipt reference, stop the affected canary, and escalate to the backup/restore owner and independent human acceptance owner. The backup operator cannot accept their own restore.

## Known issues

- The canary is temporary and synthetic; it does not prove NAS, live connector, project recovery, or a numeric recovery objective.
- Existing human acceptance is not assumed by this candidate.
- This candidate has no `last_verified_release` and no exercise/acceptance receipt, so it cannot release the Backup-Recovery extension.
- The topology v2 binding pins both D canonical stores as `empty_canonical_only`. The first accepted-byte publication into either store will invalidate that binding and require a new binding epoch.
