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

Private evidence now covers two representative states:

- an earlier blocked-runtime case where no trustworthy local runtime had yet been confirmed
- a later Cadence PSpice runtime-discovered case where `psp_cmd.exe` is callable but execution still remains blocked pending scoped approval and runnable input completeness

The package is still conservative: it does not yet have a calibrated execution profile or a positive trusted-runtime case.
