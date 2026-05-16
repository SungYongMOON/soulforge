---
name: soulforge-post-development-review-gate
description: Use when a Soulforge task is ending and must run the registered post-development review gate, choose Level 0-3, run or record validators, check public/private boundaries, route Inspector/Judge/BV review, and write a private review packet before final acceptance.
---

# Soulforge Post-development Review Gate

Use this skill to close bounded Soulforge work through `.workflow/post_development_review_gate_v0`.

This skill is a Codex runtime bridge. The workflow remains the source of truth:

- `.workflow/post_development_review_gate_v0/workflow.yaml`
- `.workflow/post_development_review_gate_v0/step_graph.yaml`
- `.workflow/post_development_review_gate_v0/templates/post_development_review_packet.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/`
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`

## Core Rule

Do not replace deterministic validators with narrative review. Run the relevant validator first when possible, then use the review gate to judge boundary, evidence, claim strength, and independence.

## Review Level

- `self_check`: tiny bounded changes. Record changed files, git status, validator result or skipped reason.
- `inspector`: public/private boundary, `_workmeta` evidence, source packet, sandbox, or architecture note.
- `inspector_and_judge`: workflow authoring, router delta, adoption decision, promotion candidate, or value comparison.
- `full_b_v_gate`: skill/workflow production-ready claim, reference/oracle benchmark, public canon promotion, or authority-changing runner/preflight work.

## Operating Steps

1. Read `AGENT_EXECUTION_CONTRACT_V0.md` and the workflow files above.
2. Identify the bounded subject, owner scope, changed files, output state, and known gaps.
3. Select the required review level from the trigger reasons and claim strength.
4. Run deterministic validation, or record why it is blocked or out of scope.
5. Fill or summarize a review packet from the workflow template.
6. For Level 1+, check allowed paths, public/private boundary, secret/raw absence scope, source support, validation status, and output state.
7. For Level 2+, compare against the original goal, existing pattern, simpler alternative, and risk of not adopting.
8. For Level 3, require fresh B executor and separate V verifier evidence, or block production-ready/canon-promotion claims.
9. Write applied evidence under `_workmeta/<project_code>/` or `_workmeta/system/`; keep public canon to blank templates and portable rules.
10. Report `accepted`, `needs_revision`, `blocked`, or `owner_decision_required`.

## Conservative Profile

Final acceptance judgment should use the conservative locked policy from the workflow profile:

- model: `gpt-5.5`
- reasoning effort: `xhigh`
- class: `auditor`

If that runtime is unavailable, record the limitation in the packet and do not overclaim high-confidence acceptance. Cheaper profiles may only normalize packets, summarize logs, or format evidence when they do not make the final acceptance decision.

## Skill Work

When this skill is used to close a skill creation or skill modification task, keep the existing skill first-build verification gate. This review gate wraps the result; it does not replace skill structure validation, safe script checks, or fresh evaluator review.

## Mapping

Read `references/mapping.md` when you need the canon linkage, output shape, or owner-boundary details.
