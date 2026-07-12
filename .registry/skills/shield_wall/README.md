# .registry/skills/shield_wall

- `shield_wall/skill.yaml` 은 `knight.frontline_guard` 가 가리키는 canonical skill entry 다.
- behavior 는 활성 경계 질문 하나와 이를 해소하는 최소 증거로 검토를 제한하고, 경계 또는 blocker 가 명확해지면 검토를 끝내는 canon 이다.
- execution-specific Codex package 는 `codex/SKILL.md` 에 분리하며, 명확한 저위험 작업에는 암시 호출하지 않는다.
- `skill.yaml` 은 `execution_requirements` 로 required capability 와 preferred MCP/tool hint 를 함께 기록할 수 있다.
- `codex/agents/openai.yaml` 은 Codex UI metadata 와 MCP dependency hint 를 둔다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, Soulforge mapping 과 output shape 는 `codex/references/mapping.md` 로 분리한다.
