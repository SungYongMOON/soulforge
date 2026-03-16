# .agent_class

## 정본 의미

- `.agent_class/` 는 class/package catalog 의 정본 루트다.
- `.agent_class/` 는 더 이상 canonical loadout root 가 아니며 workflow canon owner 도 아니다.
- reusable capability package 정의만 소유하고, active unit state 와 project execution state 는 소유하지 않는다.

## 무엇을 둔다

- `index.yaml`
- `<class_id>/class.yaml`
- `<class_id>/knowledge_refs.yaml`
- `<class_id>/skill_refs.yaml`
- `<class_id>/tool_refs.yaml`
- `<class_id>/profiles/`
- `<class_id>/manifests/`
- class/package 설명 문서와 template/example 수준의 refs

## 무엇을 두지 않는다

- active loadout state, active profile state, equipped runtime dump
- workflow canon, workflow history, raw run log, project-local battle log
- `_workspaces/<project_code>/` 실자료와 `.project_agent/` 실행 truth

## 왜 이렇게 둔다

- class/package 는 재사용 가능한 capability catalog 이고, 실제 운영 선택과 실행 로그까지 끌어오면 owner 경계가 무너진다.
- active unit 구성은 `.unit/`, workflow canon 은 `.workflow/`, mission site truth 는 `_workspaces/` 로 분리해야 새 canon 이 유지된다.

## vNext skeleton

- [`index.yaml`](index.yaml): class/package catalog index template
- [`example_class/class.yaml`](example_class/class.yaml): placeholder class definition
- [`example_class/knowledge_refs.yaml`](example_class/knowledge_refs.yaml): placeholder knowledge refs
- [`example_class/skill_refs.yaml`](example_class/skill_refs.yaml): placeholder skill refs
- [`example_class/tool_refs.yaml`](example_class/tool_refs.yaml): placeholder tool refs
- [`example_class/profiles/README.md`](example_class/profiles/README.md): profile directory rule
- [`example_class/manifests/README.md`](example_class/manifests/README.md): manifest directory rule

## legacy bridge

- 기존 `class.yaml`, `loadout.yaml`, `knowledge/`, `skills/`, `tools/`, `workflows/`, `profiles/`, `manifests/` 는 현 저장소에 남아 있는 bridge/legacy 경로다.
- 위 경로들은 후속 migration 전까지 참고 자료와 bridge 역할만 가지며, vNext owner 의미를 다시 정의하지 않는다.

## 변경 원칙

- `.agent_class` catalog 구조가 바뀌면 같은 변경 안에서 이 README, `index.yaml`, 관련 foundation 문서를 함께 갱신한다.
- template/example YAML 에 실제 운영 loadout, 민감 로그, project code, run id 는 넣지 않는다.

## 관련 경로

- [루트 README](../README.md)
- [`.agent/README.md`](../.agent/README.md)
- [`../docs/architecture/foundation/TARGET_TREE.md`](../docs/architecture/foundation/TARGET_TREE.md)
