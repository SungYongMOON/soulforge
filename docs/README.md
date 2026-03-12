# docs

## 목적

- `docs/` 는 저장소 공용 문서를 둔다.
- 특정 owner 전용 문서가 아니라 저장소 전체 구조와 운영 원칙을 안내한다.

## 포함 대상

- 저장소 전체 관점의 설명 문서
- `architecture/` 아래의 구조 원칙, 목표 트리, 소유 규칙
- `ui/` 아래의 relocation 문서
- UI source map, UI sync contract, UI derived state contract 같은 저장소 공용 파생 규칙

## 제외 대상

- `.agent` 전용 문서
- `.agent_class` 전용 문서
- 특정 프로젝트 전용 문서와 로그

## 관련 경로

- [루트 README](../README.md)
- [`docs/architecture/README.md`](architecture/README.md)
- [`docs/ui/README.md`](ui/README.md)
- [`ui-workspace/docs/README.md`](../ui-workspace/docs/README.md)
- [`docs/architecture/DOCUMENT_OWNERSHIP.md`](architecture/DOCUMENT_OWNERSHIP.md)

## 상태

- Stable
- root owner 문서만 유지한다.
- workspace 공통 resolve 계약은 `docs/architecture/PROJECT_AGENT_RESOLVE_CONTRACT.md` 에서 관리한다.
- derived state 공통 계약은 `docs/architecture/UI_DERIVED_STATE_CONTRACT.md` 에서 관리한다.
- renderer consumer 문서군 정본은 `ui-workspace/docs/` 에서 관리하고, `docs/ui/` 는 relocation 안내만 유지한다.
