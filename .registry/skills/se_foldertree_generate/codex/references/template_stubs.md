# Template Stub Support

This package includes public-safe structure-only template stubs under `codex/assets/templates/`.

## Purpose

- help seed `00_Temp` with stable draft structure
- let the team evolve its own templates inside Soulforge
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
