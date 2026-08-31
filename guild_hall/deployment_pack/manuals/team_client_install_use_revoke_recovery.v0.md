# Universal Client install, use, revoke, and recovery — physical-seat candidate

- Artifact ref: `artifact.manual.team_client_install_use_revoke_recovery.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or user-exercise acceptance is recorded.

## Purpose

Describe the bounded Universal Client path for Owner and team-member Windows PCs. The installed bytes are identical; server-observed capability, project and device state controls the enabled view. The procedure covers package validation, identity/binding readback, approved read-only use, visible revoke/recovery handling, and evidence collection. It does not enroll a device or activate a physical client by itself.

## Prerequisites

- An Owner-approved one-seat device, identity, project scope, and expiry tuple exists outside this public manual.
- The `team_client_pack` compatibility ID resolves to the Universal Client version and the physical enrollment authority is available.
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

- Enrollment `prepare/sign/finalize` remains external operator tooling and is deliberately not shipped inside the Client Pack because signing is Main Node authority.
- The Pack ships a self-contained mTLS/MCP transport bundle, native ERP client, immutable local-outbox algorithm, and Universal Client durable ordered-ACK store. A physical binding still requires separately delivered OS-protected credential references.

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

- The tracked Universal Client evidence is source-Pack/installed-copy/synthetic level; no physical device enrollment or endpoint binding is recorded.
- The durable outbox is refs-only and cannot turn an acknowledgement into Official Done or accepted knowledge.
- There is no physical UI shell or OS-protected credential adapter yet.
- This candidate has no `last_verified_release` and no physical-seat exercise receipt, so it cannot release the Universal Client Pack.
