# .registry/skills/hwpx_document

- `hwpx_document/skill.yaml` 은 HWPX 문서 생성/읽기/편집을 XML-first 방식으로 수행하는 Soulforge canonical skill entry 다.
- 이 skill package 는 외부 upstream [`Canine89/hwpxskill`](https://github.com/Canine89/hwpxskill) 의 핵심 구조를 Soulforge boundary 규칙에 맞게 옮긴 tracked package 다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, resource map 과 output shape 는 `codex/references/mapping.md` 로 분리한다.
- 실제로 usable 하도록 `codex/scripts/`, `codex/templates/`, `codex/references/hwpx-format.md` 를 함께 둔다.
- bundled script smoke test 는 Python 3.12 + `lxml` 환경에서 `build_hwpx.py` 와 `validate.py` 기준으로 확인했다.
- actual model, MCP, tool, attached skill package, install path 는 local `.project_agent/bindings/` owner 이며 tracked skill folder 에 적지 않는다.
