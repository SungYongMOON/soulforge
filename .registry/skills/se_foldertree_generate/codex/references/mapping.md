# SE Foldertree Generate Mapping

## Soulforge mapping

- Canon skill id: `se_foldertree_generate`
- Canon linkage: `.registry/skills/se_foldertree_generate/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`
- Detailed execution checklist: `codex/references/workflow.md`

## Bundled resource map

- `assets/SE_FolderTree_Guide.md`: current system-development / LIG / A bundled spec
- `assets/SE_FolderTree_PreStudy_Basic.md`: pre-study basic bundled spec
- `assets/SE_FolderTree_ExploratoryDev_Basic.md`: exploratory-development basic bundled spec
- `assets/SE_FolderTree_OperationalRnD_Basic.md`: operational-R&D basic bundled spec
- `assets/variants/*.yaml`: variant metadata for common base, contractor overlay, blocked candidates, and production-bound basic variants
- `assets/templates/`: public-safe structure-only artifact template stubs and registry for project-local `00_Temp` seeding
- `assets/schedule_rules.yaml`: compact ERP schedule hints; not used by the generator to auto-fill dates
- `scripts/generate_tree.py`: main scaffold generator for folders, manifest, progress, CSV outputs, and index files
- `scripts/seed_template_stubs.py`: copies structure-only team draft stubs into generated task folders after generation
- `scripts/convert_gate_numbers.py`: helper that rewrites gate/task numbering in a copied spec file
- `scripts/preview_variants.py`: review-only validator for draft variant metadata; it does not generate project folders
- `references/variants.md`: draft variant preview rules and acceptance criteria
- `requirements.txt`: Python dependency baseline for the bundled scripts

## Relative-path and portability rules

- Treat the skill root as the portable execution anchor.
- Resolve bundled assets/scripts/references by relative path from the skill root.
- Do not hard-code machine-specific absolute paths into the tracked skill package.
- Runtime output roots remain local input values and are not tracked in canon.

## Runtime prerequisites

- Python 3 with `requirements.txt` installed
- A writable output root for project generation
- Declared inputs for layout mode, business type, prime contractor, quality grade, start date, project name, profile, and spec path

## Current supported input matrix

- Supported today:
  - `체계개발 / LIG 넥스원 / A` -> `assets/SE_FolderTree_Guide.md`
  - `선행연구 / 공통 / 없음` -> `assets/SE_FolderTree_PreStudy_Basic.md`
  - `탐색개발 / 공통 / 없음` -> `assets/SE_FolderTree_ExploratoryDev_Basic.md`
  - `운용연구개발 / 공통 / 없음` -> `assets/SE_FolderTree_OperationalRnD_Basic.md`
- If the requested combination does not match a bundled spec variant, stop and ask for a new variant/spec instead of generating the wrong tree.
- Draft variants in `assets/variants/` are not bundled production support unless they explicitly bind a spec and are promoted into the generator path.

## Default operating modes

1. Standard scaffold:
   - ask for the required input set first
   - use the spec bound to the validated supported variant
   - dry-run the generator
   - run the real generation command
2. Adjusted numbering scaffold:
   - copy the bundled spec or use a task-specific spec
   - rewrite numbering with `convert_gate_numbers.py` if needed
   - run the generator against the adjusted spec
3. Existing-root scaffold:
   - use `--layout-mode in-place`
   - treat `--out` as the final project root
4. Fresh-root scaffold:
   - use `--layout-mode new-root`
   - treat `--out` as the parent folder that will receive the new project root

## Document artifact temp support

- Generated SE trees should create or at least permit `00_Temp/template_snapshot/` and `00_Temp/workflow_candidate/` for document-producing artifacts.
- `_workspaces/SE_TEMPLATE_LIBRARY/` is the canonical actual-file library/store for reusable SE artifact materials. It is not pointer-only and not a project execution baseline; `_workspaces/system/` remains the local lab and fixture workspace.
- Under each library artifact's `00_Temp`, keep actual reusable files: owner-approved templates/forms/materials, derived HWPX when applicable, executable workflow procedures, artifact-specific authoring rules, sample output files, and manifests/catalogs.
- Do not move project-local latest authoring files into the library. Library samples are copied or materialized as sample files.
- Keep library `workflow/` for executable workflow procedure only; folder/source/hash/copy/provenance belongs in manifests/catalogs.
- Separate common document rules from artifact-specific authoring rules.
- The task start step must copy or materialize the chosen library file or owner-approved canonical artifact material into the project-local `00_Temp/template_snapshot/`; document generation uses that frozen snapshot.
- `00_Temp/workflow_candidate/` stores project-local workflow/rule candidates extracted from a concrete run. It is not `.workflow` canon.
- Project snapshot manifests should record source library/material pointer, project snapshot pointer, hash, snapshot time, and status.
- Track `form_revision`, `template_snapshot_id/version`, `input_bundle_version`, `artifact_version`, and `workflow_version` as separate fields.
- Final manual edits invalidate the previous artifact hash and validation status; refresh both before closeout.

## Output expectations

- State which spec file was used.
- State which business type / prime contractor / quality grade combination was validated.
- State which layout mode was used.
- State whether a dry-run preview was performed.
- State whether structure-only template stubs were seeded.
- State whether `00_Temp/template_snapshot/` and `00_Temp/workflow_candidate/` were created, preserved, or intentionally not applicable.
- For document-producing artifacts, state whether a project-local snapshot manifest was initialized or updated.
- Confirm the chosen profile and output root.
- Confirm whether `plan_manifest.json`, `plan_progress.json`, CSV outputs, index text, and `PROJECT_ID.txt` were generated.

## Boundary note

- Keep project-local values in runtime inputs or copied specs, not in the tracked skill package.
- Actual installed skill selection, local install path, model, and MCP/tool choice remain runtime binding concerns.
- Do not write project-specific snapshots, workflow candidates, raw inputs, or generated artifacts into the tracked skill package.
