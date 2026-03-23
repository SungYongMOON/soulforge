---
name: soulforge-se-foldertree-generate
description: Use when a Soulforge task must scaffold an SE project folder tree and initialize plan tracking files from a spec.
---

# Soulforge SE Foldertree Generate

Scaffold SE project folders in owner order: confirm inputs first, prefer dry-run preview, then materialize the tree and plan files with the bundled scripts.

## Core rules

- Ask for missing inputs before generation. The minimum input set is `layout mode`, `business type`, `prime contractor`, `quality grade`, `start`, project name, profile, and output root.
- Default to `assets/SE_FolderTree_Guide.md` unless the task already has an adjusted spec copy.
- Use bundled assets, scripts, and references via paths relative to the skill root. Do not hard-code host-local absolute paths into the tracked skill package.
- Keep dependency assumptions minimal: Python 3 + `requirements.txt` only.
- Stop with a clear message if the requested business-type / prime-contractor / quality-grade combination is not supported by the currently bundled spec set.
- If gate numbering must change, transform a spec copy with `scripts/convert_gate_numbers.py` instead of editing the bundled asset in place.
- Prefer `scripts/generate_tree.py --dry-run` before the real run unless the user explicitly asks to skip preview.
- Use `--layout-mode in-place` for an existing project root and `--layout-mode new-root` for a fresh project root to be materialized under a parent path.

## Load on demand

- Read [`references/mapping.md`](references/mapping.md) for Soulforge mapping, bundled resource map, prerequisites, and output expectations.
- Read [`references/workflow.md`](references/workflow.md) for concrete command examples and the execution checklist.
