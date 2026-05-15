# Simulation Run Verify v0

`simulation_run_verify_v0` is a public-safe workflow for executing a bounded simulation or recording why execution is blocked.

It sits after `simulation_deck_prepare_v0`. It packages run identity, execution metadata, measurement outputs, result verdicts, blockers, and owner follow-up. It does not invent models, override deck-preparation authority, approve results, or promote harness claims on its own.

## Inputs

- `simulation_deck_prepare_v0` prepared deck packet and blocker outputs.
- Optional model inventory, compatibility matrix, measurement definitions, verification-plan refs, and owner decisions.

## Outputs

- `simulation_run_packet`
- `run_manifest`
- `measurement_results`
- `result_verdicts`
- `run_blockers`
- `owner_followup_needed`
- `downstream_handoff`
- `boundary_review_note`

## Boundary Rules

- A blocked run is not a failed verification.
- A pass/fail verdict is not owner acceptance.
- Missing measurement definitions or unresolved prerequisites must block result claims.
- Upstream packets remain read-only.

## Current Maturity

`validation_level: pilot_executed_private_fixture`

This package has completed both:

- a controlled private blocked-run pilot
- a controlled private positive executed-run pilot on a local vendor example

The executed example produced observed output data while still keeping pass/fail and owner acceptance out of scope when no approved rule was bound.

The package is still conservative: it does not yet have a calibrated execution profile, an owner-approved claim-bearing result case, or a project-native executed-run example.
