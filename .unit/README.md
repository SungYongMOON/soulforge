# .unit

## 정본 의미

- `.unit/` 는 active agent unit owner 의 정본 루트다.
- policy, protocols, runtime, memory, sessions, autonomic, artifacts 는 `.unit/<unit_id>/` 아래에서 owner 경계를 가진다.
- `.unit/` 는 `.registry` canon, workflow canon, party template, mission site project data 를 소유하지 않는다.

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

- species, hero, class, skill, tool, knowledge, workflow, party 정본 정의
- `_workspaces/<project_code>/` project tree 와 `.project_agent/` 실행 truth
- 실제 비밀값, raw transcript, 민감 로그, 운영 dump 의 무분별한 public 반영

## 왜 이렇게 둔다

- active unit 는 catalog 와 달리 현재 운영 책임을 가지므로 별도 owner 루트가 필요하다.
- `.registry`, `.workflow`, `.party`, `_workspaces` 와 분리해야 재사용성과 운영 경계가 유지된다.

## sample / skeleton

- [`example_unit/unit.yaml`](example_unit/unit.yaml): non-operational unit template
- [`vanguard_01/unit.yaml`](vanguard_01/unit.yaml): canonical active subject sample
- `example_unit/policy/`, `protocols/`, `runtime/`, `memory/`, `sessions/`, `autonomic/`, `artifacts/`: owner boundary 설명용 placeholder

## tracking 원칙

- 이 저장소에는 template 와 canonical sample 수준 파일만 둔다.
- 민감 데이터, 실제 session transcript, 비밀값, private runtime dump 는 template 에 넣지 않는다.
