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

This package has completed a controlled private blocked-run pilot. The first pilot showed how a run packet, blocker packet, and blocked verdict can be written without inventing waveform results or treating blocked execution as a failed verification.

The package is still conservative: it does not yet have a calibrated execution profile, a successful executed-run case, or a measured waveform/metric result example.
