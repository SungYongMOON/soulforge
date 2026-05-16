# Post-development Review Gate Mapping

## Canon Linkage

- Canon skill id: `post_development_review_gate`
- Canon skill package: `.registry/skills/post_development_review_gate/skill.yaml`
- Registered workflow: `.workflow/post_development_review_gate_v0/`
- Installed Codex skill: `soulforge-post-development-review-gate`

## Ownership

- `.workflow/post_development_review_gate_v0/` owns the reusable procedure, role slots, step graph, handoff rules, and public-safe templates.
- `.registry/skills/post_development_review_gate/` owns the reusable skill behavior and Codex bridge.
- `_workmeta/<project_code>/` or `_workmeta/system/` owns applied review packets, validation logs, task-specific findings, and private reasoning.
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` owns the execution contract and Level 0-3 routing rules.

## Output Shape

Applied review packets should follow:

- `.workflow/post_development_review_gate_v0/templates/project_binding.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/post_development_review_packet.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/validation_log.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/boundary_review_note.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/judge_decision_note.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/bv_gate_handoff.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/supervisor_decision.template.yaml`
- `.workflow/post_development_review_gate_v0/templates/followup_register.template.yaml`

Minimum final response fields:

- review level used
- validators run or skipped reason
- packet path, when written
- final supervisor status
- remaining gates or owner decisions

## Non-claims

- This skill does not make missing source evidence true.
- This skill does not replace specialist validators.
- This skill does not approve production-ready claims without required B/V evidence.
- This skill does not make private review packets public-safe.
