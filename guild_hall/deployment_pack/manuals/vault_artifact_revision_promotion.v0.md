# Vault ArtifactRevision promotion — Internal RC candidate

- Artifact ref: `artifact.manual.vault_artifact_revision_promotion.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or human exercise acceptance is recorded.

## Purpose

Review the bounded ArtifactRevision path from a project-scoped submission candidate to an accepted revision head. This runbook explains the contract and evidence gates only. It does not custody bytes, start a real promoter, accept a project artifact, or move a baseline.

## Prerequisites

- An exact project scope, logical artifact reference, parent/head reference, and five-owner tuple are supplied by their separate owners.
- A trusted current uploader/custody receipt and an independent review/acceptance authority exist for the proposed exercise.
- The requested operation names an exact revision and digest. `latest`, path-name, timestamp, or raw-file fallback is not permitted.

## Allowed and forbidden actions

- Allowed: validate the public-safe state-machine and admission contracts; inspect exact reference/digest readback; prepare a candidate/review packet through the separately authorized owner surface.
- Forbidden: copying artifact bytes into this manual, treating upload/custody/clean scan as promotion, changing an accepted head, self-reviewing a submission, self-accepting an artifact, writing a baseline/release, or sending an external artifact.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:vault-revision
npm.cmd run validate:hermes-vault-submission-admission
```

- `guild_hall/vault_revision/src/artifact_revision_core.mjs` provides `createVaultRevisionCore` for the pure in-memory candidate, review, and acceptance contract.
- `guild_hall/vault_revision/src/hermes_submission_admission.mjs` provides `admitHermesArtifactSubmission`; it prepares a proposed input only when authenticated custody and trusted-current bindings match exactly.
- `docs/architecture/foundation/team_member_engineering_program/03_VAULT_ERP_ASSET_REVISIONS.md` owns the ArtifactRevision and five-owner policy.

## Expected readback and evidence

- Exact project/logical-artifact/parent revision references, content digest, and five distinct owner references.
- A custody/admission receipt that binds project, task, assignment, run, Work Brief, manifest, scan, and source references without copying protected material.
- An independent review verdict and a separately authorized human acceptance record for the exact candidate revision, if the physical gate is open.
- An accepted-head readback only after the acceptance owner has accepted the exact revision; it remains distinct from task completion and baseline/release membership.

## HOLD / stop

Stop when any scope, parent/head, digest, five-owner field, custody/scan result, trusted-current binding, independent reviewer, or acceptance authority is absent, stale, foreign, conflicted, revoked, or mismatched. Stop if a caller requests a raw-source, cross-project, `latest`, external-send, or automatic acceptance shortcut.

## Rollback and escalation

Do not overwrite, delete, or silently replace a candidate or accepted revision. Preserve the safe receipt/reference and escalate stale-head, conflict, scan, binding, review, or acceptance HOLD codes to the artifact revision owner and the independent reviewer. Baseline/release rollback is a separate approved procedure.

## Known issues

- The tracked Vault core is a deterministic in-memory contract; persistent byte custody, promoter writer, and actual acceptance are not enabled here.
- An accepted artifact revision is not an Official Task completion, accepted project context, knowledge promotion, or release.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release an ArtifactRevision promotion workflow.
