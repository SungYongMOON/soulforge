# 2026-05-21 Profile Calibration

Calibration archive: `calibrations/cal_20260521_dlib_public_fixture_001/`

Mode: `staged_cli_isolated_candidate_matrix_with_semantic_gate`.

The calibration used a public-safe synthetic fixture derived from the workflow
contract. It did not use real Allegro execution, raw PCB payloads, installed
Cadence paths, runtime absolute project paths, credentials, private-state data,
`_workspaces` outputs, or `_workmeta` run truth.

Recommended profile:

- model: `gpt-5.5`
- reasoning effort: `medium`
- species: `dwarf`
- class: `archivist`
- candidate: `B2_gpt_5_5_medium_dwarf_archivist`

The selected profile passed the semantic quality gate with score `97`, using
`732` output tokens, `22` reasoning output tokens, and `17.688` seconds wall
time in CLI proxy telemetry. The highest-scoring shadow,
`gpt-5.4-mini/high/dwarf/archivist`, scored `100` but used materially more
output plus reasoning tokens and more wall time.

The first exact field-name gate over-penalized equivalent boundary wording. The
evaluator review therefore routed the final ranking through a semantic gate that
preserved the required workflow outcomes: `board_demo_A` remains
`review_required` because an unknown export file is moved to `other`, and
`board_demo_B` is blocked before mutation because multiple `.brd` files require
owner selection.
