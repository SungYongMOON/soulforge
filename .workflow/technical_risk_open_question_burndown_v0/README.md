# Technical Risk Open Question Burndown v0

`technical_risk_open_question_burndown_v0` is a public-safe governance workflow for packaging current technical risks and open questions into a bounded burndown register.

It does not close risks, approve acceptance, or mutate upstream packets.

## Inputs

- Risk scope refs.
- Optional source-gap, interface-control, quantitative, harness, review-gate, closure-loop, and owner-decision packets.

## Outputs

- `technical_risk_register`
- `open_question_register`
- `burndown_summary`
- `closure_criteria_register`
- `owner_followup_needed`
- `rerun_routes`
- `boundary_review_note`

## Current Maturity

`validation_level: pilot_executed_private_fixture`

This package has completed a controlled private representative risk/open-question pilot. The first pilot grouped source, interface, quantitative, and simulation uncertainty into one burndown register with closure criteria and rerun routes.

The package is still conservative: it does not yet have a calibrated execution profile or a richer closure-evidence history.
