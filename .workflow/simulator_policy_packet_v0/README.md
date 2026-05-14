# Simulator Policy Packet v0

`simulator_policy_packet_v0` is a public-safe workflow for recording trusted local simulator runtime identity or probe evidence, owner execution authorization posture, allowed simulator family and scope, and runtime blockers.

It does not install simulators, invent runtime trust, authorize execution without owner basis, or produce deck or waveform results.

## Outputs

- `simulator_policy_packet`
- `runtime_probe_summary`
- `execution_authorization_state`
- `runtime_blockers`
- `boundary_review_note`

## Current Maturity

`validation_level: pilot_executed_private_fixture`

This package has completed a controlled private representative blocked-runtime pilot.

The first pilot recorded that candidate LTspice-style input artifacts exist, but no trustworthy local simulator runtime was found and no owner execution authorization had been supplied yet.

The package is still conservative: it does not yet have a calibrated execution profile or a positive trusted-runtime case.
