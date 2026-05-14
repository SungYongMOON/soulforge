# Simulation Deck Prepare v0

`simulation_deck_prepare_v0` is a public-safe pre-run workflow for staging simulation deck inputs after model/source collection but before any simulator execution.

It reads approved model packets, compatibility summaries, deck or demo-circuit refs, optional quantitative/context packets, stimulus and measurement definitions, operating conditions, and simulator-policy inputs. It writes a bounded deck-preparation packet or an explicit blocker packet when required inputs are still missing.

It does not run simulations, accept results, invent models, or claim that a blocked deck means a failed simulation.

## Inputs

- `simulation_source_collect_v0` packets and related model manifests.
- Optional quantitative, interface, harness-priority, owner-decision, stimuli, measurement, and simulator-policy refs.

## Outputs

- `simulation_deck_packet`
- `deck_input_manifest`
- `model_dependency_map`
- `stimulus_measurement_plan`
- `simulator_setup_requirements`
- `deck_staging_manifest`
- `unresolved_deck_inputs`
- `deck_prepare_blockers`
- `owner_followup_needed`
- `downstream_handoff`
- `boundary_review_note`

## Boundary Rules

- Deck preparation is not simulation execution.
- A prepared packet is not waveform or metric evidence.
- Missing models, missing deck/topology sources, missing deck dependencies, missing simulator policy, missing stimuli, missing measurements, missing operating conditions, unapproved conversion, or insufficient simulator compatibility remain first-class blockers.
- Upstream packets remain read-only.

## Current Maturity

`validation_level: pilot_executed_private_fixture`

This package has completed a controlled private representative deck-prepare pilot. The first pilot separated one prepared LTspice demo-circuit input from unresolved simulator-policy, measurement, and missing-model blockers without claiming simulation execution.

The package is still conservative: it does not yet have a calibrated execution profile, a richer multi-file dependency prepare case, or a packet that is fully run-ready for downstream simulation execution.
