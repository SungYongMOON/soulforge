# .unit

## Canonical purpose

- `.unit/` 는 활성 unit 운영자가 책임지는 canonical root다. 각 unit owner 는 policy, protocols, runtime, memory, sessions, autonomic, artifacts 를 `/Users/seabotmoon-air/Workspace/Soulforge/.unit/<unit_id>/` 아래에서 직접 관리한다.
- `.unit/` 는 `.registry`, `.workflow`, `.party`, `_workspaces` 와 구분되어 catalog, workflow, party, private project data 를 번갈아 처리하지 않는다.

## 무엇을 둔다

- `<unit_id>/unit.yaml`
- `<unit_id>/policy/`
- `<unit_id>/protocols/`
- `<unit_id>/runtime/`
- `<unit_id>/memory/`
- `<unit_id>/sessions/`
- `<unit_id>/autonomic/`
- `<unit_id>/artifacts/`

## 무엇을 두지 않는다

- species, hero, class, skill, tool, knowledge, workflow, party canon 정의
- `_workspaces/<project_code>/` project tree 와 `.project_agent/` 실행 truth
- 실제 비밀값, raw transcript, 민감 로그, 운영 dump 의 무분별한 public 반영

## 왜 이렇게 둔다

- 현재 운영 중인 unit 은 catalog 와 달리 책임 경계를 명시해야 하므로 `.unit/` 별도 루트를 유지한다.
- 운영 경계를 `.registry`, `.workflow`, `.party`, `_workspaces` 와 분리함으로써 재사용성과 책임 경계를 명확히 한다.

## Canonical sample

- [`vanguard_01/unit.yaml`](vanguard_01/unit.yaml)은 현재 운영 중인 canonical active subject sample이다. 이 파일은 `vanguard_field_alpha` 프로파일을 기준으로 영웅이 운영되는 현황을 나타내며, `.unit/`를 봤을 때 가장 먼저 참고할 실제 unit이다.
- [`example_unit/unit.yaml`](example_unit/unit.yaml)은 경계 설명용으로 유지되는 deprecated placeholder다. 실제 운영 unit 이 아니며, 민감 데이터를 포함하지 말고 본 저장소 외부에서 복제해 사용하지 않아야 한다.

## tracking 원칙

- 이 저장소에는 canonical active unit 과 boundary-only placeholder 수준의 파일만 둔다.
- 민감 데이터, 실제 session transcript, 비밀값, private runtime dump 는 template 에 넣지 않는다.
