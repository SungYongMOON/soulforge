# .registry/skills

- `skills/` 는 reusable skill canon 을 두는 registry surface 다.
- 각 skill folder 는 `skill.yaml` 을 canon entry 로 사용한다.
- `skill.yaml` 은 behavior 와 `execution_requirements` 를 기록할 수 있다.
- `execution_requirements` 는 required/preferred capability 와 MCP/tool hint 를 가질 수 있으며, local runtime execution profile 이 이를 참고해 model, attached skill, MCP/tool set 을 고를 수 있다.
- 필요하면 execution-specific package 를 같은 skill 아래 별도 하위 폴더로 둘 수 있지만, canonical behavior 설명과 runtime execution prompt 는 구분해서 관리한다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, detailed mapping 과 output shape 는 `codex/references/` 로 분리한다.
- Codex-facing package 를 둘 때는 `codex/SKILL.md` 와 `codex/agents/openai.yaml` 조합으로 UI metadata 와 dependency hint 를 함께 둔다.
- 다른 PC 에서 실제 Codex installed mirror 가 필요하면 tracked `codex/` bridge 를 local `~/.codex/skills/` 로 sync 한다. baseline 절차는 [`.registry/docs/operations/SKILL_INSTALL_SYNC.md`](../docs/operations/SKILL_INSTALL_SYNC.md) 를 따른다.
- `skill_check/` 는 tracked skill package 가 canon, optional executor bridge, local runtime binding owner 를 섞지 않는지 검토하는 active authoring-aid sample 이다.
- `hwpx_document/` 는 lean bridge 문서만이 아니라 bundled `scripts/`, `templates/`, `references/` 도 함께 sync 하는 resource-heavy skill package sample 이다.
- `pptx_autofill_conversion/` 는 user-provided template PPTX 를 runtime input 으로 받고, bundled helper scripts 와 XML guardrails 를 통해 bounded text replacement 를 수행하는 presentation skill sample 이다.
- boundary 규칙은 [`.registry/docs/architecture/SKILL_CANON_BOUNDARY.md`](../docs/architecture/SKILL_CANON_BOUNDARY.md) 를 따른다.
