# .agent/docs

## 목적

- `.agent/docs/` 는 private operating system 으로서의 `.agent` 를 설명하는 body owner 문서의 정본 위치다.
- 저장소 공용 문서와 분리해서 본체 경계, 기관 의미, 메타 계약을 관리한다.

## 범위

- `.agent` 소유 설명 문서와 본체 계약 문서만 다룬다.
- `.agent_class`, `_workspaces`, `_teams/shared` 의 owner 문서는 여기서 관리하지 않는다.

## 포함 대상

- 본체 구조 설명 문서
- 본체 기관 README 와 연결되는 아키텍처 규약
- `body.yaml`, `body_state.yaml` 메타 계약 문서

## 제외 대상

- 저장소 전체 구조 문서
- class owner 문서, mission site 문서, shared team 운영 문서

## 미래 확장 방향

- `protocols/`, `sessions/`, `autonomic/` 세부 계약 문서를 이 경계 아래에 추가한다.
- `engine/` 의 runtime rename 이 확정되면 관련 마이그레이션 문서도 이 경계에서 관리한다.
- 협업용 shared 문서는 루트 `_teams/shared/` owner 문서로 분리한다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent/docs/architecture/README.md`](architecture/README.md)
- [`.agent/docs/architecture/BODY_METADATA_CONTRACT.md`](architecture/BODY_METADATA_CONTRACT.md)
- [`docs/architecture/DOCUMENT_OWNERSHIP.md`](../../docs/architecture/DOCUMENT_OWNERSHIP.md)

## 상태

- Stable
- body owner 문서의 기본 위치로 유지한다.
