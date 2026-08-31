# Buzz and Hermes operations recovery — Internal RC candidate

- Artifact ref: `artifact.manual.buzz_hermes_operations_recovery.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or human restore acceptance is recorded.

## Purpose

Review the evidence needed to recover a bounded Buzz collaboration surface and Hermes agent-runtime metadata without conflating either with ERP task truth, accepted project knowledge, or artifact acceptance. This runbook validates public-safe backup-generation contracts; it does not inspect or operate a live server.

## Prerequisites

- One exact approved scope, deployment/reference set, backup generation reference, and recovery-owner separation are supplied through their owning surfaces.
- The recovery plan classifies canonical, rebuildable, and ephemeral state; protected identity material is represented only by a `secret_ref`.
- A distinct human acceptance owner is available for any physical restore exercise. The backup operator cannot self-accept the result.

## Allowed and forbidden actions

- Allowed: validate Buzz/Hermes backup-generation contracts, inspect safe generation/restore/audit/identity-recovery references, and prepare a bounded recovery request for its exact owner.
- Forbidden: reading or exporting message bodies, attachments, prompts, memory, sessions, keys, tokens, database data, object-store bytes, or Git data; starting/stopping/reconfiguring a server; restoring a live system; treating a delivery receipt as consumer acknowledgement or task acceptance.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:backup-generation-contracts
npm.cmd run validate:agent-observation
npm.cmd run validate:hermes-bot-submit-executor
```

- `guild_hall/backup_controller/buzz_backup_generation_manifest.mjs` evaluates metadata-only Buzz backup-generation packets.
- `guild_hall/backup_controller/hermes_agent_backup_manifest.mjs` evaluates metadata-only Hermes agent backup-generation packets.
- `guild_hall/agent_observation/agent_mark_lineage.mjs` owns public-safe Mark/Deployment/Run lineage, not runtime recovery execution.

## Expected readback and evidence

- Exact scope, deployment/app/schema/migration/config references, generation digest, and backup/restore/audit/identity-recovery receipt references.
- Explicit Redis/state classification: canonical data needs capture evidence; rebuildable data needs rebuild proof; ephemeral data needs explicit exclusion.
- An isolated restore readback and audit-integrity result tied to the same generation digest, followed by a separately recorded human acceptance if the physical gate is open.
- No task result, project artifact, project knowledge, or Official Task acceptance claim from the recovery receipt.

## HOLD / stop

Stop on missing scope, deployment pin, generation digest, ownership separation, recovery/rotation/revocation evidence, state classification, isolated readback, audit integrity, or human acceptance. Stop if a request would expose protected content, conflate a Buzz channel/session with a canonical Bot Chat, or use backup success as authorization to activate an Agent.

## Rollback and escalation

Do not repair a failed proof by changing runtime configuration or restoring an unverified generation. Preserve the safe receipt/HOLD references and escalate to the exact Buzz/Hermes operations owner and independent acceptance owner. Runtime rollback, credential recovery, and project-task correction are separate procedures.

## Known issues

- The tracked contracts are metadata-only/pure validation; no live Buzz or Hermes backup, restore, service health, or route is proven by this candidate.
- A backup-generation acceptance does not prove end-user message delivery, consumer acknowledgement, Bot result acceptance, or task completion.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a Buzz/Hermes recovery workflow.
