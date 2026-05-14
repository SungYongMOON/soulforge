# Simulation Deck Prepare v0

`simulation_deck_prepare_v0` is a public-safe pre-run workflow for staging simulation deck inputs after model/source collection but before any simulator execution.

It reads approved model packets, compatibility summaries, demo circuits, optional quantitative/context packets, and simulator-policy inputs. It writes a bounded deck-preparation packet or an explicit blocker packet when required inputs are still missing.

It does not run simulations, accept results, invent models, or claim that a blocked deck means a failed simulation.

## Inputs

- `simulation_source_collect_v0` packets and related model manifests.
- Optional quantitative, interface, harness-priority, owner-decision, stimuli, measurement, and simulator-policy refs.

## Outputs

- `simulation_deck_packet`
- `deck_input_manifest`
- `model_dependency_map`
- `unresolved_deck_inputs`
- `deck_prepare_blockers`
- `owner_followup_needed`
- `downstream_handoff`
- `boundary_review_note`

## Boundary Rules

- Deck preparation is not simulation execution.
- A prepared packet is not waveform or metric evidence.
- Missing models, missing deck dependencies, missing simulator policy, missing stimuli, or missing measurements remain first-class blockers.
- Upstream packets remain read-only.

## Current Maturity

`validation_level: draft_contract_only`

This package is registered as a first public-safe contract skeleton. A controlled project-local pilot is still required before claiming pilot-executed, usable, or production-ready behavior.
