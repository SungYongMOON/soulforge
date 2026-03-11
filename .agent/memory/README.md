# .agent/memory

## 목적

- `memory/` 는 본체의 장기 기억을 둔다.
- loadout 교체 후에도 유지되어야 하는 기억을 body owner 경계 안에서 관리한다.

## 범위

- durable memory asset 과 그 색인 메타만 다룬다.
- 설치형 knowledge, session continuity, project 원본 결과물은 범위 밖이다.

## 포함 대상

- 장기 기억 자산
- 기억 색인과 유지 정책 메타
- body owner 기억 유지 기준

## 제외 대상

- 설치형 지식 팩
- session continuity checkpoint
- 프로젝트 산출물 원본

## 미래 확장 방향

- memory retrieval 규칙이 늘어나도 knowledge pack 과는 owner 를 분리한다.
- session continuity 와의 경계는 요약 참조 수준에서만 연결한다.
- shared memory 가 필요하면 `_teams/shared/` 에서 별도 경계를 설계한다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent_class/knowledge/README.md`](../../.agent_class/knowledge/README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](../docs/architecture/AGENT_BODY_MODEL.md)

## 상태

- Draft
- memory 와 knowledge 의 경계만 우선 고정했고 내부 구조는 추후 정의한다.
