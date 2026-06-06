# Template Stub Support

This package includes public-safe structure-only template stubs under `codex/assets/templates/`.

## Purpose

- help seed `00_Temp` with stable draft structure
- let the team evolve public-safe structure-only stubs inside Soulforge
- avoid pretending that a generated stub is already contract- or standard-compliant

## What the stubs are

- structure-only draft skeletons
- source-ledger and review/action helpers
- traceability and verification hook placeholders
- daily experiment / test log scaffold
- PDR stage deliverable checklist scaffold

## What the stubs are not

- approved customer templates
- exact DAPA / contract / military-standard wording
- submission-ready compliance forms

## Relationship to document artifact snapshots

- `codex/assets/templates/` contains public-safe structure-only stubs for the skill package.
- `_workspaces/SE_TEMPLATE_LIBRARY/` is the canonical actual-file library/store for reusable SE artifact materials. It is not pointer-only and not a project execution baseline; `_workspaces/system/` remains the local lab and fixture workspace.
- Under each library artifact's `00_Temp`, keep actual reusable files: owner-approved templates/forms/materials, derived HWPX when applicable, executable workflow procedures, artifact-specific authoring rules, sample output files, and manifests/catalogs.
- Do not move project-local latest authoring files into the library. Library samples are copied or materialized as sample files.
- Keep library `workflow/` for executable workflow procedure only; folder/source/hash/copy/provenance belongs in manifests/catalogs.
- Separate common document rules from artifact-specific authoring rules.
- For document-producing artifacts, copy or materialize the chosen library file or owner-approved canonical artifact material into the project-local `00_Temp/template_snapshot/` at task start.
- Store workflow or rule candidates extracted from a concrete run in project-local `00_Temp/workflow_candidate/`; do not treat them as `.workflow` canon.
- Project snapshot manifests should record source library/material pointer, project snapshot pointer, hash, snapshot time, and status.
- Keep `form_revision`, `template_snapshot_id/version`, `input_bundle_version`, `artifact_version`, and `workflow_version` separate.
- Final manual edits invalidate the previous artifact hash and validation status; refresh metadata before closeout.

## Seeding command

Generate the tree first, then seed matching stubs:

```powershell
python scripts/seed_template_stubs.py `
  --project-root "<generated-project-root>" `
  --dry-run
```

Real write:

```powershell
python scripts/seed_template_stubs.py `
  --project-root "<generated-project-root>"
```

## Matching behavior

- `match_all: true` templates seed every non-fixed task folder.
- term-matched templates seed only when the task `term` matches, such as `HDD`, `SDD`, `SSDD`, `RTM`, `TEMP`, or `STP`.
- existing files are preserved; seeding skips files that already exist.
