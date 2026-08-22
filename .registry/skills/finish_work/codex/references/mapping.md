# 끝까지 만들기 Mapping

## Canon Linkage

- Canon skill id: `finish_work`
- Canon source: `.registry/skills/finish_work/skill.yaml`
- Installed Codex mirror: `soulforge-finish-work`
- Final review owner: `.workflow/post_development_review_gate_v0/`

## Ownership

- This skill owns shallow task decomposition, leaf gate definition, truthful blocked states, parent re-verification, and report-number auditing.
- Repository validators own behavioral truth.
- The post-development review workflow owns final inspector/judge/BV routing and supervisor acceptance.
- Runtime bindings own actual model, effort, tools, workers, paths, and installed mirror location.

## Output Shape

```text
Applied skill: soulforge-finish-work
Execution mode: solo | staged
Gate result: pass | needs_revision | blocked
Branch integration: pass | fail | not_applicable
Remaining owner gates: ...
Safest next step: ...
```

## Boundary Notes

- Do not import or invoke upstream Unlazy scripts or hooks.
- Do not create a second final-review workflow.
- Do not turn manager plans or gate packets into source truth, task authority, or canon promotion.
- Do not store raw prompts, transcripts, reasoning, tool I/O, credentials, or project payload in evidence packets.
