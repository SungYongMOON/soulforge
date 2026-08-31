# 4192 incident response — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.watch_4192_incident_response.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or operator exercise acceptance is recorded.

## Purpose

Interpret a coarse 4192 Watch health/freshness record, open only its safe owner pointer, and file a bounded action request for an authorized owner. Watch records incidents; it does not execute remediation.

## Prerequisites

- The panel names a supported domain, current evidence clock, and safe owner pointer.
- The Watch operator has an approved request policy reference and no assumption of executor authority.
- The incident scope is a one-seat candidate and no raw source body is needed to classify the state.

## Allowed and forbidden actions

- Allowed: inspect `healthy`, `degraded`, `stale`, `unavailable`, `unknown`, or `hold`; open a safe pointer; file one typed restart/isolate/restore/rollback request.
- Forbidden: restart, isolate, restore, rollback, delete, write, approve, or mark any task complete from Watch; exposing raw messages, transcripts, memory, prompts, credentials, or deep session data.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:watch-bastion
npm.cmd run validate:watchtower
```

- `guild_hall/watch_panel_contract/src/watch_panel_contract.mjs` provides `buildPanel`, `buildSafePointer`, `createWatchActionRequests`, and `assertNoWriterSurface`.
- `guild_hall/watchtower/recovery_diagnostics.mjs` provides `classifyRecoveryDiagnostic`.
- `guild_hall/bastion_action/src/bastion_action_gate.mjs` remains the action-authorization boundary referenced by `validate:watch-bastion`.

## Expected readback and evidence

- Panel state, asserted state, reason, evidence clock, and owner pointer.
- For a request, request ID, action kind, target reference, policy reference, expiry, and `filed` state.
- A later Bastion/owner receipt is separate evidence; filing a request proves no action ran.

## HOLD / stop

Stop at `hold`, missing evidence, a forbidden field, unsupported domain, stale/ambiguous pointer, or absent action policy. Do not widen a pointer into a raw record or infer an action from a health color.

## Rollback and escalation

There is no Watch rollback command. Preserve the panel and request references, then escalate the request to the exact service/backup/project owner. If an external actor reports a change, require that actor's independent receipt before updating incident status.

## Known issues

- The Watch surface is a coarse read-only projection; it is not a live executor.
- Missing evidence is `unknown` or `hold`, never healthy.
- This candidate has no `last_verified_release` and no operator exercise receipt, so it cannot release a 4192 incident path.
