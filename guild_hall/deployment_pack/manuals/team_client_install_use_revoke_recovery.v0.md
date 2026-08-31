# Team Client install, use, revoke, and recovery — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.team_client_install_use_revoke_recovery.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or user-exercise acceptance is recorded.

## Purpose

Describe the bounded Team Client path for one Owner-PC seat: package validation, identity/binding readback, approved read-only use, visible revoke/recovery handling, and evidence collection. It does not enroll a device or activate a client by itself.

## Prerequisites

- An Owner-approved one-seat device, identity, project scope, and expiry tuple exists outside this public manual.
- The Team Client Pack version is compatible with this artifact and the physical enrollment authority is available.
- The operator can inspect public-safe readback fields only; protected credential material remains outside Git and chat.

## Allowed and forbidden actions

- Allowed: pack validation, viewing supplied identity/binding status, read-only bundle use, and recording opaque outbox or revoke/recovery receipt references.
- Forbidden: creating an identity from a device name, moving protected key material, bypassing a revoked or expired binding, activating hooks, or declaring a submitted result as Official Done.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:deployment-pack
npm.cmd run validate:dev-erp-mcp
node guild_hall/deployment_pack/tools/build_pack.mjs --spec guild_hall/deployment_pack/packs/team_client_pack.spec.json --out APPROVED_STAGING_OUTPUT --install-verify APPROVED_ISOLATED_TARGET --smoke
```

- `ui-workspace/apps/dev-erp-mcp/src/ingress_mtls_enrollment.mjs` exposes `prepareIngressMtlsEnrollment`, `signIngressMtlsEnrollment`, and `finalizeIngressMtlsEnrollment` for the separately authorized enrollment path.
- `ui-workspace/apps/dev-erp-mcp/ingress_mtls_enrollment_cli.mjs` accepts only the `prepare`, `sign`, and `finalize` interface stages; it is not a substitute for the protected authority gate.
- `guild_hall/ingress/local_outbox.mjs` and `guild_hall/ingress/local_outbox_cli.mjs` define the bounded local-outbox receipt surface.

## Expected readback and evidence

- A version/compatibility result for the installed-copy candidate.
- An explicit identity, device, agent, and project-scope readback represented only by approved references.
- For a permitted read-only exercise, an exact bundle reference plus a bounded outbox or submission receipt reference.
- On revoke or recovery, a visible held/revoked state and the recovery disposition; no credential bytes are recorded.

## HOLD / stop

Stop when the identity tuple is missing, scope is not explicit, the binding is expired or revoked, the server pin/readback differs, the outbox lacks a verified acknowledgement, or the exact exercise approval is absent. Do not retry by enrolling a second identity or changing device state.

## Rollback and escalation

Revoke/re-enroll and uninstall are authorized operator actions, not automatic recovery. Preserve the opaque receipt reference, stop local use, and escalate to the identity and Team Client support owners for the exact approved recovery instruction.

## Known issues

- The tracked Team Client evidence is synthetic/package-level; no physical device enrollment is recorded.
- WorkSession/outbox operational policy and final human acceptance remain separate gates.
- This candidate has no `last_verified_release` and no one-seat exercise receipt, so it cannot release the Team Client Pack.
