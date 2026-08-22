# .registry/skills/finish_work

- `skill.yaml` owns the executor-neutral staged-gate behavior.
- `codex/` is a lean Codex bridge; final acceptance remains owned by `.workflow/post_development_review_gate_v0`.
- The package contains no dynamic shell checker, Stop hook, or runtime authority.
