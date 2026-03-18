# author_skill_package hwpx_document

## Scenario

- Source request: external upstream `Canine89/hwpxskill`
- Candidate `skill_id`: `hwpx_document`
- Goal: turn the upstream HWPX XML-first workflow into a Soulforge tracked skill package without collapsing canon, executor bridge, and runtime ownership.

## Why This Was Routed Here

- The behavior is reusable across multiple HWPX authoring and edit tasks.
- The package needs both a canonical behavior description and an executor bridge with bundled scripts/templates.
- Boundary review is needed because the upstream project mixes operational details, install examples, and skill instructions in one package.

## Curated Lessons

- A bundled-resource skill can still follow the Soulforge boundary model if `skill.yaml` stays canon-only and operational assets live under `codex/`.
- Upstream install instructions should be rewritten as Soulforge install handoff notes, not copied into canon.
- Reference-preserving reconstruction and page-drift review are the key reusable behaviors worth preserving.

## Public-Safe Outcome

- A new tracked package `hwpx_document` was drafted under `.registry/skills/`.
- The package keeps upstream workflow resources in `codex/scripts/`, `codex/templates/`, and `codex/references/`.
- The install/sync path remains a local operating concern under `.registry/docs/operations/SKILL_INSTALL_SYNC.md`.
- Template-first smoke passed for the Soulforge package by building and validating `smoke_report.hwpx` with the bundled `report` template under Python 3.12 + `lxml`.
- The smoke also surfaced a concrete runtime note: the bundled scripts currently assume Python 3.10+ syntax, so that requirement is now recorded in the package notes.
