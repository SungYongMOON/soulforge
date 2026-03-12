# .agent/memory

## 목적

- `memory/` 는 이 agent 의 private 장기 기억을 둔다.
- loadout 교체 후에도 유지되어야 하는 기억을 body owner 경계 안에서 private-first 원칙으로 관리한다.

## 포함 대상

- `self/`, `project/`, `decisions/`, `handoffs/`
- self facts, project facts, decisions, future handoffs
- retention 과 recall 관련 메타

## 제외 대상

- transcript 전체
- session continuity checkpoint 와 resume cursor
- shared memory inside body
- raw project source 와 임시 scratch

## 대표 파일

- [`self/README.md`](self/README.md): body 자신의 안정적 기억 경계
- [`project/README.md`](project/README.md): distilled project facts 경계
- [`decisions/README.md`](decisions/README.md): 확정된 판단과 합의 경계
- [`handoffs/README.md`](handoffs/README.md): 미래 multi-agent 전달문 예약 경계

## 참조 관계

- `memory/` vs `sessions/`: `memory/` 는 장기 보존되는 기억을 두고, `sessions/` 는 현재 작업 연속성을 이어 주는 checkpoint 만 둔다.
- `memory/` vs `knowledge`: `memory/` 는 body 가 축적한 경험과 기억이고, `knowledge/` 는 `.agent_class` 가 설치한 지식 팩이다.
- shared memory inside body 는 현재 `false` 이며, shared owner 는 `_teams/shared` 로 분리한다.
- [`../sessions/README.md`](../sessions/README.md)
- [`../../.agent_class/knowledge/README.md`](../../.agent_class/knowledge/README.md)

## 변경 원칙

- memory retrieval 규칙이 늘어나도 knowledge pack 과 owner 를 섞지 않는다.
- continuity 와의 연결은 요약 참조 수준에 머물고, resume state 본문은 `sessions/` 에 남긴다.
- shared memory 가 필요하면 `_teams/shared/` 에 별도 경계를 설계하고 여기의 private-first memory 와 분리한다.
