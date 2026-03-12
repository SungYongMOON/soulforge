# .agent/memory

## 목적

- `memory/` 는 본체의 장기 기억을 둔다.
- loadout 교체 후에도 유지되어야 하는 기억을 body owner 경계 안에서 private-first 원칙으로 관리한다.

## 포함 대상

- 장기 기억 자산
- 기억 색인과 유지 정책 메타
- body owner 기억 유지 기준

## 제외 대상

- 설치형 지식 팩
- session continuity checkpoint 와 resume cursor
- shared memory inside body
- 프로젝트 산출물 원본

## 대표 파일

- [`README.md`](README.md): memory owner 경계와 private-first 원칙을 정의하는 현재 정본
- [`../body.yaml`](../body.yaml): `operating_constraints.memory_mode` 와 `shared_memory_inside_body` 값을 고정하는 body 메타
- [`../policy/scope_rules.yaml`](../policy/scope_rules.yaml): memory scope floor 를 정의하는 policy 파일

## 참조 관계

- `memory/` vs `sessions/`: `memory/` 는 장기 보존되는 기억을 두고, `sessions/` 는 현재 작업 연속성을 이어 주는 checkpoint 와 handoff 상태만 둔다.
- `memory/` vs `knowledge`: `memory/` 는 body 가 축적한 경험과 기억이고, `knowledge/` 는 `.agent_class` 가 설치한 지식 팩이다.
- shared memory inside body 는 현재 `false` 이며, shared owner 는 body 밖에서 분리한다.
- [`../README.md`](../README.md)
- [`../sessions/README.md`](../sessions/README.md)
- [`../../.agent_class/knowledge/README.md`](../../.agent_class/knowledge/README.md)

## 변경 원칙

- memory retrieval 규칙이 늘어나도 knowledge pack 과 owner 를 섞지 않는다.
- session continuity 와의 연결은 요약 참조 수준에 머물고, resume state 본문은 `sessions/` 에 남긴다.
- shared memory 가 필요하면 `_teams/shared/` 에 별도 경계를 설계하고 여기의 private-first memory 와 분리한다.
