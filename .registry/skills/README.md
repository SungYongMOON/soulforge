# .registry/skills

- `skills/` 는 reusable skill canon 을 두는 registry surface 다.
- 각 skill folder 는 `skill.yaml` 을 canon entry 로 사용한다.
- `skill.yaml` 은 behavior 와 `execution_requirements` 를 기록할 수 있다.
- `execution_requirements` 는 required/preferred capability 와 MCP/tool hint 를 가질 수 있으며, local runtime execution profile 이 이를 참고해 model, attached skill, MCP/tool set 을 고를 수 있다.
- 필요하면 execution-specific package 를 같은 skill 아래 별도 하위 폴더로 둘 수 있지만, canonical behavior 설명과 runtime execution prompt 는 구분해서 관리한다.
- Codex-facing package 를 둘 때는 `codex/SKILL.md` 와 `codex/agents/openai.yaml` 조합으로 UI metadata 와 dependency hint 를 함께 둔다.
