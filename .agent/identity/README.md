# .agent/identity

## 목적

- `identity/` 는 본체의 durable identity default 를 둔다.
- species 는 여기서만 관리하며, situational role 이 아니라 오래 유지되는 기본 정체성만 담당한다.

## 범위

- body 차원의 기본 식별자와 durable default 만 다룬다.
- loadout, mission site, session 문맥에 따라 바뀌는 역할 상태는 범위 밖이다.

## 포함 대상

- 본체 식별 메타
- durable default species, naming, baseline identity 선언
- 장기적으로 유지되는 참조용 identity 기준값

## 제외 대상

- `class.yaml`, `loadout.yaml` 같은 loadout 메타
- 프로젝트별 식별자, 현장 계약, 임시 persona
- session continuity 나 transcript 성 자산

## 미래 확장 방향

- species 외 durable default facet 이 필요하면 이 경계 안에서 명시적으로 추가한다.
- 상황별 역할 전환 규칙은 `identity/` 가 아니라 loadout 또는 mission 계층에서 다룬다.
- 협업 정체성이나 shared roster 는 `_teams/shared/` 에서 별도 owner 를 가진다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](../docs/architecture/AGENT_BODY_MODEL.md)

## 상태

- Draft
- species 를 포함한 durable default identity 경계만 우선 고정했다.
