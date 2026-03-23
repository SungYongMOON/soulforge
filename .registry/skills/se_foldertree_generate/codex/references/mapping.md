# SE Foldertree Generate Mapping

## Soulforge mapping

- Canon skill id: `se_foldertree_generate`
- Canon linkage: `.registry/skills/se_foldertree_generate/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`
- Detailed execution checklist: `codex/references/workflow.md`

## Bundled resource map

- `assets/SE_FolderTree_Guide.md`: default markdown spec with YAML front matter for the SE tree
- `scripts/generate_tree.py`: main scaffold generator for folders, manifest, progress, CSV outputs, and index files
- `scripts/convert_gate_numbers.py`: helper that rewrites gate/task numbering in a copied spec file
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
  - business type: `체계개발`
  - prime contractor: `LIG 넥스원`
  - quality grade: `A`
- If the requested combination does not match a bundled spec variant, stop and ask for a new variant/spec instead of generating the wrong tree.

## Default operating modes

1. Standard scaffold:
   - ask for the required input set first
   - use the bundled spec
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

## Output expectations

- State which spec file was used.
- State which business type / prime contractor / quality grade combination was validated.
- State which layout mode was used.
- State whether a dry-run preview was performed.
- Confirm the chosen profile and output root.
- Confirm whether `plan_manifest.json`, `plan_progress.json`, CSV outputs, index text, and `PROJECT_ID.txt` were generated.

## Boundary note

- Keep project-local values in runtime inputs or copied specs, not in the tracked skill package.
- Actual installed skill selection, local install path, model, and MCP/tool choice remain runtime binding concerns.
