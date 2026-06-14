---
name: soulforge-se-foldertree-generate
description: Use when a Soulforge task must scaffold an SE project folder tree and initialize plan tracking files from a spec.
---

# Soulforge SE Foldertree Generate

Scaffold SE project folders in owner order: confirm inputs first, prefer dry-run preview, then materialize the tree and plan files with the bundled scripts.

## Core rules

- Ask for missing inputs before generation. The minimum input set is `layout mode`, `business type`, `prime contractor`, `quality grade`, `start`, project name, profile, and output root.
- Default to the bundled spec bound to the validated supported variant unless the task already has an adjusted spec copy.
- Use bundled assets, scripts, and references via paths relative to the skill root. Do not hard-code host-local absolute paths into the tracked skill package.
- Keep dependency assumptions minimal: Python 3 + `requirements.txt` only.
- Stop with a clear message if the requested business-type / prime-contractor / quality-grade combination is not supported by the currently bundled spec set.
- For draft variant work, use `assets/variants/` and `scripts/preview_variants.py`; do not use draft variants to materialize folders.
- Use `scripts/seed_template_stubs.py` only when structure-only team draft templates should be copied into project-local `00_Temp`.
- For document-producing artifacts, create or preserve `00_Temp/template_snapshot/` and `00_Temp/workflow_candidate/` when the generated spec or task requires them.
- Treat `_workspaces/SE_TEMPLATE_LIBRARY/` as the canonical actual-file library/store for reusable SE artifact materials. It is not pointer-only and not a project execution baseline; `_workspaces/system/` remains the local lab and fixture workspace.
- Under each library artifact's `00_Temp`, keep actual reusable files: owner-approved templates/forms/materials, derived HWPX when applicable, executable workflow procedures, artifact-specific authoring rules, sample output files, and manifests/catalogs.
- Do not move project-local latest authoring files into the library. Library samples are copied or materialized as sample files.
- Keep library `workflow/` for executable workflow procedure only; folder/source/hash/copy/provenance belongs in manifests/catalogs.
- Separate common document rules from artifact-specific authoring rules.
- For document generation, copy or materialize the chosen library file or owner-approved canonical artifact material into project-local `00_Temp/template_snapshot/`; generation uses that frozen snapshot only.
- Project-local `00_Temp/workflow_candidate/` is local candidate storage from concrete runs, not `.workflow` canon.
- Keep project snapshot manifests metadata-only: source library/material pointer, project snapshot pointer, hash, snapshot time, and status.
- Keep `form_revision`, `template_snapshot_id/version`, `input_bundle_version`, `artifact_version`, and `workflow_version` separate. Manual artifact edits require refreshed hash and validation metadata before closeout.
- For ERP schedule hints, read `assets/schedule_rules.yaml`; do not infer artifact dates when no rule applies.
- If gate numbering must change, transform a spec copy with `scripts/convert_gate_numbers.py` instead of editing the bundled asset in place.
- Prefer `scripts/generate_tree.py --dry-run` before the real run unless the user explicitly asks to skip preview.
- Use `--layout-mode in-place` for an existing project root and `--layout-mode new-root` for a fresh project root to be materialized under a parent path.

## Load on demand

- Read [`references/mapping.md`](references/mapping.md) for Soulforge mapping, bundled resource map, prerequisites, and output expectations.
- Read [`references/workflow.md`](references/workflow.md) for concrete command examples and the execution checklist.
- Read [`references/variants.md`](references/variants.md) only when reviewing draft variant metadata before a production spec change.
- Read [`references/template_stubs.md`](references/template_stubs.md) when the task includes HDD/SDD or other stage-deliverable draft template seeding.
