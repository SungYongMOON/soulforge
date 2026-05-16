# Post-development Review Gate v0

`post_development_review_gate_v0` is the generic closing workflow for bounded Soulforge development work.

It does not replace specialist validators, source workflows, or owner approval. It checks whether the right validation and independent review happened before a result is accepted, revised, blocked, or escalated.

## Inputs

- Builder report with objective, changed files, output state, commands run, claimed benefit, and known gaps.
- Relevant owner contracts and validation command refs.
- Optional source packet, adoption decision, promotion candidate, inspector, judge, verifier, or owner-decision refs.

## Outputs

- `post_development_review_packet`
- `validation_log`
- `boundary_review_note`
- `judge_decision_note`
- `bv_gate_handoff`
- `supervisor_decision`
- `followup_register`

Each output has a public-safe template under `templates/`. Applied packets stay under
`_workmeta/<project_code>/` or `_workmeta/system/`.

## Review Levels

- `self_check`: simple bounded edits and deterministic checks.
- `inspector`: public/private boundary, source support, `_workmeta` evidence, and sandbox work.
- `inspector_and_judge`: workflow/router/adoption/promotion decisions that need value and alternative comparison.
- `full_b_v_gate`: production-ready, oracle/reference, canon-promotion, or authority-changing runner/preflight claims.

## Current Maturity

`validation_level: pilot_executed_private_application`

This package is extracted from applied post-development review gate runs recorded under `_workmeta/system`. The package is registered as public-safe workflow canon, with all declared outputs bound to portable templates. Its final acceptance profile is intentionally locked to the conservative gatekeeper policy instead of optimized for cost.

The next gate is to run two or three more bounded packets, then use `workflow-optimizer` only as a quality-shadow exercise unless the owner explicitly changes the locked final-acceptance policy.
