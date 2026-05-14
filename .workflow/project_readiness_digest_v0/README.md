# Project Readiness Digest v0

`project_readiness_digest_v0` is a public-safe reporting workflow for aggregating current workflow statuses, blockers, owner-input queues, calibration priorities, and next recommended actions into one owner-readable digest.

It does not replace upstream truth, approve readiness, or mutate upstream packets.

## Outputs

- `project_readiness_digest`
- `status_rollup`
- `priority_blockers`
- `owner_input_queue`
- `next_action_recommendations`
- `boundary_review_note`

## Current Maturity

`validation_level: pilot_executed_private_fixture`

This package already has a representative private digest pilot over the overnight workflow family. It remains a reporting lane and should not be mistaken for source or approval authority.
