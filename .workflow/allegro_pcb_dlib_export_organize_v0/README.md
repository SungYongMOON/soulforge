# allegro_pcb_dlib_export_organize_v0

`allegro_pcb_dlib_export_organize_v0` is a reusable workflow for exporting
Cadence Allegro board libraries with the `dlib` Export Libraries command and
sorting the output into board-local Allegro reference folders.

## Current State

- `output_state: registered`
- `validation_level: registered_extracted_from_sample_pilot_private_evidence`
- profile calibration active: `cal_20260521_dlib_public_fixture_001`
- primary execution profile: `gpt-5.5` / `medium` / `dwarf` / `archivist`
- no production-ready or unattended full-archive claim is made
- runtime input roots, board paths, generated scripts, and installed Cadence
  executable paths are never stored in this public workflow package

## Runtime Inputs

The operator supplies runtime-only values in the library export scope packet:

- `input_root_runtime_path`: absolute folder containing board folders or board
  files for the run
- `allegro_executable_runtime_path` or an approved local Allegro locator
- `target_folder_selector`: folder labels, explicit folders, or an inventory
  policy that selects target board folders
- `mutation_mode`: `inventory_only`, `export_only`, `organize_only`,
  `export_and_organize`, or `verify_only`
- `library_root_name`, defaulting to `lib`
- board extension allowlist, defaulting to `.brd`

Relative PCB input paths are rejected. Sample folders and installed Cadence
paths belong only in private run evidence.

## Route Summary

1. Bind runtime scope and owner mutation authority.
2. Reject relative or out-of-scope paths.
3. Inventory target `.brd` files.
4. Plan one board-local `lib` output per board folder.
5. Create `padpath`, `psmpath`, `devpath`, and `logs`.
6. Run Allegro read-only with a runtime-generated `dlib` script.
7. Collect direct or transient dlib output into the board-local library root.
8. Sort `.pad` into `padpath`, symbol/drawing files into `psmpath`, device/map
   files into `devpath`, and logs into `logs`.
9. Verify zero reported dlib errors, folder counts, no root-level leftovers, and
   cleanup of transient export folders.
10. Close with boundary, non-claim, and follow-up state.

## Success Rule

A board export is accepted only when the board-local library root exists,
`dump_libraries.log` reports zero errors, exported files are classified into the
declared reference folders, no files remain directly under `lib`, and no
transient export folder remains unless owner policy preserves it.

## Non-Claims

This workflow does not prove electrical correctness, symbol geometry
correctness, padstack engineering approval, manufacturing readiness, or owner
approval for unattended archive-wide mutation.
