# .agent/protocols

## 목적

- `protocols/` 는 body 공통 운영 프로토콜을 둔다.
- communication, runtime, continuity, policy 사이를 잇는 durable operating contract 를 본체 소유 경계에서 관리한다.

## 범위

- body owner 기본 운영 프로토콜과 handoff 규칙만 다룬다.
- class workflow, project contract, team shared process 표준은 범위 밖이다.

## 포함 대상

- 본체 공통 운영 프로토콜
- handoff, resume, escalation 같은 durable operating contract
- `policy/`, `communication/`, `engine/`, `sessions/` 를 잇는 참조 규칙

## 제외 대상

- class workflow 정의
- 프로젝트별 `.project_agent/` 계약
- team shared collaboration playbook

## 미래 확장 방향

- 협업용 shared 프로토콜이 생기면 canonical owner 는 `_teams/shared/` 가 되고, 여기에는 private default 만 남긴다.
- runtime rename 이 확정되면 관련 프로토콜 참조도 함께 정리한다.
- 운영 프로토콜이 세분화되면 계약 문서를 추가해 폴더 내부를 나눈다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent/communication/README.md`](../communication/README.md)
- [`.agent/policy/README.md`](../policy/README.md)
- [`docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md`](../../docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md)

## 상태

- Draft
- 폴더는 도입했고 세부 프로토콜 파일 세트는 추후 정의한다.
