# 2026-05-13 Profile Calibration

## Scope

Calibrated `device_system_diagram_generation` with a public-safe synthetic wearable gateway fixture. The run optimized model, reasoning effort, species, and class for producing structured diagram input, draw.io master construction guidance, derived artifact export planning, and boundary/validation checks.

## Recommendation

Primary profile:

- model: `gpt-5.4-mini`
- reasoning_effort: `low`
- species: `human`
- class: `administrator`

Quality-upgrade shadow:

- model: `gpt-5.4`
- reasoning_effort: `low`
- species: `human`
- class: `administrator`

## Evidence

- Calibration archive: `calibrations/20260513-202816_staged_cli_matrix/`
- Stage A selected `human | administrator` as the best species/class pairing.
- Stage B compared `gpt-5.4-mini`, `gpt-5.4`, and `gpt-5.5` across `low`, `medium`, `high`, and `xhigh` reasoning efforts.
- Stage C reran three finalists: `gpt-5.4-mini | low`, `gpt-5.4 | low`, and `gpt-5.4 | xhigh`.
- All Stage C finalists passed the frozen hard gates.
- `gpt-5.4-mini | low | human | administrator` was selected as the lowest-cost and fastest passing finalist.
- `gpt-5.4 | low | human | administrator` had the strongest Stage C quality score and is retained as the first shadow profile.

## Boundary

The archive uses only a synthetic public fixture. It does not include project raw input, REF packets, accepted outputs, verifier reports, credentials, `_workspaces`, `_workmeta`, or `private-state` material.
