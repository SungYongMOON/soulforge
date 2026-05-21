# allegro_pcb_dbdoctor_uprev_batch_v0

`allegro_pcb_dbdoctor_uprev_batch_v0` is a reusable workflow for converting
legacy Allegro PCB database files with Cadence DB Doctor while preserving the
original files in per-file old/new packets.

## Current State

- `output_state: registered`
- `validation_level: registered_extracted_from_sample_pilot_private_evidence`
- calibrated public-safe synthetic profile:
  `gpt-5.4-mini` / `medium` / `dwarf` / `auditor`
- no production-ready or unattended full-archive claim is made
- runtime input roots and Cadence executable paths are never stored in this
  public workflow package

## Runtime Inputs

The operator supplies runtime-only values in the batch scope packet:

- `input_root_runtime_path`: absolute folder containing the legacy database
  files for this run
- `dbdoctor_executable_runtime_path` or an approved local DB Doctor locator
- `mutation_mode`: `dry_run`, `materialize_only`, `convert`, or `verify_only`
- `extension_allowlist`, defaulting to `.brd`
- old/new folder labels, defaulting to `구버전` and `신버전`

Relative PCB input paths are rejected. Sample folders and installed Cadence
paths belong only in private run evidence.

## Route Summary

1. Bind runtime scope and owner mutation authority.
2. Reject relative or out-of-scope paths.
3. Inventory top-level candidate database files.
4. Plan one packet folder per file stem.
5. Move originals into the old-version folder.
6. Run DB Doctor in outfile mode into the new-version folder.
7. Classify results from output files, logs, warning/error counts, and process
   code.
8. Check leftover temp files, counts, logs, and closeout boundary posture.

## Success Rule

A conversion is accepted only when the new-version output exists, DB Doctor logs
show revision completion and save text, and detected errors are zero. A non-zero
process code may be warning-bearing completion only when those checks pass.

## Non-Claims

This workflow does not prove electrical correctness, symbol or padstack library
validity, manufacturing readiness, or owner approval for unattended archive-wide
mutation.
