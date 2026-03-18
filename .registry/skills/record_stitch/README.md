# .registry/skills/record_stitch

- `record_stitch/skill.yaml` 은 `archivist.record_stitch` 가 가리키는 canonical skill entry 다.
- behavior 는 canon 이고, execution-specific Codex package 는 `codex/SKILL.md` 에 분리해 둔다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, Soulforge mapping 과 output shape 는 `codex/references/mapping.md` 로 분리한다.
- `codex/agents/openai.yaml` 는 UI metadata 와 `default_prompt` 만 두고 runtime policy 는 들지 않는다.
