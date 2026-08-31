# HPP Server operator — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.hpp_server_operator.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or user-exercise acceptance is recorded.

## Purpose

Build and inspect the HPP Server Pack in an approved isolated one-seat canary. This runbook produces only bounded build, install, smoke, start/stop, lifecycle, and escalation evidence. It does not declare a released service.

## Prerequisites

- The Owner has approved the exact one-seat canary and supplied an isolated target and backup destination outside this manual.
- The requested pack version is compatible with the catalog range and the HPP pack specification is unchanged for the run.
- The operator has the approved role and can read the resulting receipts. Credential material, production service activation, and external connector authority are out of scope.

## Allowed and forbidden actions

- Allowed: deterministic validation, isolated pack build, installed-copy smoke, start/stop proof, and a bounded lifecycle rehearsal after the canary gate is open.
- Forbidden: publishing a release, treating a smoke result as human acceptance, changing network/firewall/service registration, or copying source, project, or credential material into a receipt.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:deployment-pack
node guild_hall/deployment_pack/tools/build_pack.mjs --spec guild_hall/deployment_pack/packs/hpp_server_pack.spec.json --out APPROVED_STAGING_OUTPUT --install-verify APPROVED_ISOLATED_TARGET --smoke
node guild_hall/deployment_pack/tools/prove_start_stop.mjs --target APPROVED_ISOLATED_TARGET
node guild_hall/deployment_pack/tools/pack_lifecycle.mjs backup --target APPROVED_ISOLATED_TARGET --backup APPROVED_ISOLATED_BACKUP
```

- `guild_hall/deployment_pack/tools/build_pack.mjs` provides `buildPack`, `verifyInstalledCopy`, `installPack`, and `runInstalledSmoke`.
- `guild_hall/deployment_pack/tools/prove_start_stop.mjs` provides `proveStartStop` and `assertStartHealth`.
- `guild_hall/deployment_pack/tools/pack_lifecycle.mjs` provides `backupPack`, `upgradePack`, `rollbackPack`, and `restorePack`.

Do not supply a real target to a lifecycle command until the exact Owner-PC canary gate is approved.

## Expected readback and evidence

- Pack manifest digest and installed-copy verification agree.
- Smoke and start/stop receipts show the requested pack digest, without any release or production claim.
- A lifecycle rehearsal, if separately approved, reports a retained previous generation or a bounded restore result.
- Record only opaque receipt references and digests in the release packet.

## HOLD / stop

Stop and keep the result `HOLD` when the canary approval, compatibility, isolated target, digest readback, smoke, start/stop proof, or receipt is missing or mismatched. A runtime or network failure is an incident input, not permission to change host configuration.

## Rollback and escalation

Use `pack_lifecycle.mjs rollback` only for the approved isolated target with a verified previous generation. If rollback cannot verify the previous generation, stop and escalate the exact receipt and hold code to the HPP service owner; use a verified backup restore only under its separate approval.

## Known issues

- Existing evidence is isolated and synthetic; it is not an Owner-PC installation or user acceptance.
- On Windows, stop observation is not a graceful-stop claim.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a pack.
