# .registry/skills/skill_check

- `skill_check/skill.yaml` 은 Soulforge skill package boundary 검토를 위한 draft canonical skill entry 다.
- behavior 는 canon 이고, execution-specific Codex package 는 optional `codex/` bridge 로 분리한다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, Soulforge mapping 과 output shape 는 `codex/references/mapping.md` 로 분리한다.
- actual model, MCP, tool, attached skill package, install path 는 local `.project_agent/bindings/` owner 이며 tracked skill folder 에 적지 않는다.
