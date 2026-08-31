# Experienced-hire project onboarding — Internal RC candidate

- Artifact ref: `artifact.manual.experienced_hire_training.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or trainee exercise acceptance is recorded.

## Purpose

Orient an experienced engineering hire to the controlled project-work path: exact accepted source/context reference → Engineering assessment → approved Work Brief → local work → candidate result/evidence → independent review → human acceptance. It does not shortcut project admission, source custody, or technical acceptance.

## Prerequisites

- A project owner has named the learning project scope, role, trainer, and public-safe/synthetic exercise packet.
- Any real project source, artifact, tool, device, or connector access has its own explicit scope and is not implied by employment or training completion.
- The trainee understands that local workspaces are not canonical storage and that result submission is not acceptance.

## Allowed and forbidden actions

- Allowed: inspect public contract references, rehearse an exact synthetic Work Brief, verify a bounded input/result reference chain, and practice raising a typed HOLD/escalation.
- Forbidden: assuming access from a project nickname, reading raw source or customer files, writing `_workmeta` directly, promoting a candidate, changing a baseline, approving a result, dispatching a Bot, or selecting a tool/workshop without its owner gate.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:forge-intent
npm.cmd run validate:vault-revision
npm.cmd run validate:engineering-mcp
```

- `guild_hall/forge_intent/README.md` defines the bounded Work Candidate/TaskIntent/Work Brief seam.
- `guild_hall/vault_revision/README.md` defines ArtifactRevision custody/review/acceptance separation.
- `guild_hall/engineering_mcp/src/contract.mjs` is a contract reference; its tracked read facade does not grant mutation authority.

## Expected readback and evidence

- The trainee can distinguish an exact accepted input from a candidate, a Work Brief from an Official Task state, and a result receipt from review/human acceptance.
- The trainee can identify project scope, parent revision, required evidence, stop condition, review role, and escalation path without copying source content.
- A training exercise receipt, if captured, is training evidence only and cannot establish project access, tool access, or technical acceptance.

## HOLD / stop

Stop when source/project scope is unknown, an input is not accepted, revision/manifest is missing, a task/brief lacks bindings, an output lacks review, or any instruction asks for a real project write or data transfer. Do not work around HOLD by using a personal copy, a general-purpose chat, or a different project reference.

## Rollback and escalation

Do not erase local exercise material or fabricate a new result to resolve a discrepancy. Preserve safe references and escalate scope/custody to the project owner, task/brief ambiguity to the assignment authority, and artifact questions to the reviewer/acceptance owner.

## Known issues

- This candidate teaches the boundary only; real project admission, MCP binary plane, specialist tools, and human technical acceptance remain separately gated.
- Experienced status does not grant broader authority or cross-project visibility.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release an experienced-hire onboarding path.
