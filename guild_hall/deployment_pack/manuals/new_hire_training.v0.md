# New-hire orientation — Internal RC candidate

- Artifact ref: `artifact.manual.new_hire_training.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or trainee exercise acceptance is recorded.

## Purpose

Give a new team member a public-safe orientation to Soulforge's product boundaries: ERP assets, Engineering Engine findings, Agent Platform execution, task/receipt separation, and the difference between collection, backup, review, and acceptance. It does not provision an account, device, project access, or agent authority.

## Prerequisites

- A named trainer, approved learning scope, and a public-safe training environment are supplied by the team owner.
- The trainee receives no credential, private project payload, customer material, or production writer authority through this document.
- Training examples use synthetic/public-safe records only and state their non-operational status.

## Allowed and forbidden actions

- Allowed: read the architecture/manual catalog, run deterministic public validators, practice classifying evidence versus acceptance, and record a separate training-completion reference if the training owner permits it.
- Forbidden: self-enrollment, access requests by implication, copying project data, changing a task or asset, sending a message, opening a connector, operating a Bot, treating a quiz as role activation, or granting an authority level.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:manual-release
npm.cmd run validate:product-composition
npm.cmd run validate:authority-taxonomy
```

- `docs/architecture/foundation/SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md` is the high-level product/release map.
- `guild_hall/authority_taxonomy/README.md` distinguishes action shape (A0–A6) from risk (R0–R4); it grants no authority.
- `guild_hall/deployment_pack/manuals/manual_release_catalog.v0.json` shows candidate/HOLD/release status and must not be treated as an access-control system.

## Expected readback and evidence

- The trainee can name the difference between source/asset, candidate, receipt, review, acceptance, task truth, and backup/restore.
- The trainee can identify that `HOLD`/`UNKNOWN` means stop and escalate rather than retry by using a wider permission or another tool.
- Any training evidence is a bounded training reference only; it is not a device enrollment, project approval, role grant, or production readiness receipt.

## HOLD / stop

Stop when a lesson would require private source material, credential entry, a real project/system write, an external connector, or an ambiguous access request. Stop when the trainer cannot identify the accountable owner or when the trainee asks to bypass a held gate.

## Rollback and escalation

There is no automatic enrollment rollback because this manual does not enroll anything. Preserve the safe training reference and escalate access, device, project, or role requests to the exact team/identity/project owner. Remove only the approved local training copy through the owning endpoint's separate procedure.

## Known issues

- This is an orientation candidate, not an account/device installation guide or a certification program.
- Passing public validators demonstrates contract health, not trainee competence or authorization.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a new-hire training path.
