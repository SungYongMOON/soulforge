# .registry/skills/mission_check

- `mission_check/skill.yaml` 은 Soulforge mission readiness review 를 위한 active canonical skill entry 다.
- behavior 는 canon 이고, execution-specific Codex package 는 `codex/SKILL.md` 에 분리해 둔다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, Soulforge mapping 과 output shape 는 `codex/references/mapping.md` 로 분리한다.
- `codex/agents/openai.yaml` 는 UI metadata 와 dependency hint 만 둔다.
- actual attached skill package, model, MCP/tool set, install path, raw run truth 는 tracked skill folder 가 아니라 mission/runtime owner 가 맡는다.
