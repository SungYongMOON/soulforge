# Post-development Review Gate v0

`post_development_review_gate_v0` is the generic closing workflow for bounded Soulforge development work.

It does not replace specialist validators, source workflows, or owner approval. It checks whether the right validation and independent review happened before a result is accepted, revised, blocked, or escalated.

## Inputs

- Builder report with objective, changed files, output state, commands run, claimed benefit, and known gaps.
- Relevant owner contracts and validation command refs.
- Optional source packet, adoption decision, promotion candidate, inspector, judge, verifier, or owner-decision refs.
- Optional owner-delegated canon policy refs for applying an existing standing delegation.

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

## Owner-Delegated Auto-Canon

This gate does not create owner approval. It may apply an existing owner-surface
policy, owner decision packet, or promotion policy ref that explicitly delegates
canon registration for the target layer and says per-item owner confirmation is
not required.

When the authority guard and source-support guard pass, and all six public canon
guards pass, the supervisor decision may set `canon_promotion_allowed: true`.
The review packet must also record
`canon_registration_required_this_task`, `canon_registration_completed`, target
refs, failed guards, and the claim ceiling after registration. Passed delegated
work should be registered in the same bounded task unless an explicit hold,
missing write access, blocked validation, unclear owner surface, or boundary risk
prevents it.

The six public canon guards are owner surface, public-safe abstraction,
private/raw/secret exclusion, schema or README contract, changelog sync when
applicable, and validation/review route. If any guard fails or is unknown,
the result stays `canon_candidate`, `validated_private`, `rejected_or_blocked`,
or `owner_decision_required` instead of receiving implicit approval.

Delegation here does not authorize source truth, ontology acceptance, final
domain doctrine, external upload, default route mutation, or production-ready
claims unless a separate owner-surface policy grants that authority and the
required review route passes.

## Current Maturity

`validation_level: pilot_executed_private_application`

This package is extracted from applied post-development review gate runs recorded under `_workmeta/system`. The package is registered as public-safe workflow canon, with all declared outputs bound to portable templates. Its final acceptance profile is intentionally locked to the conservative gatekeeper policy instead of optimized for cost.

The next gate is to run two or three more bounded packets, then use `workflow-optimizer` only as a quality-shadow exercise unless the owner explicitly changes the locked final-acceptance policy.
