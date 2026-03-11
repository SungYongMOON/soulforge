# .agent/docs/architecture

## 목적

- `.agent/docs/architecture/` 는 `.agent` private operating system 의 구조 문서와 계약 문서를 고정하는 위치다.
- 본체 기관 의미와 body 메타 규칙을 저장소 공용 문서와 분리해서 관리한다.

## 범위

- 본체 구조 설명, 기관 책임 정의, body 메타 계약만 다룬다.
- class module 계약, workspace resolve 계약, shared team 계약은 이 범위 밖이다.

## 포함 대상

- `AGENT_BODY_MODEL.md`
- `BODY_METADATA_CONTRACT.md`
- 추후 추가될 `protocols`, `sessions`, `runtime` 관련 본체 계약 문서

## 제외 대상

- 저장소 전체 아키텍처 문서
- class 구조 문서와 project 연결 문서
- `_teams/shared` owner 문서

## 미래 확장 방향

- `engine/` 에 대한 runtime rename 또는 의미 재정의를 이 문서군에서 우선 고정한다.
- continuity, policy floor, low-noise correction 에 관한 세부 계약을 문서 단위로 분리한다.
- team shared 표준이 생겨도 canonical shared 문서는 루트 경계에서 관리한다.

## 관련 경로

- [`.agent/docs/README.md`](../README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](AGENT_BODY_MODEL.md)
- [`.agent/docs/architecture/BODY_METADATA_CONTRACT.md`](BODY_METADATA_CONTRACT.md)
- [`docs/architecture/README.md`](../../../docs/architecture/README.md)

## 상태

- Stable
- 현재 본체 정본 문서는 `AGENT_BODY_MODEL.md`, `BODY_METADATA_CONTRACT.md` 를 기준으로 유지한다.
