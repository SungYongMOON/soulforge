# .agent_class/docs

## 목적

- `.agent_class/docs/` 는 class owner 문서를 둔다.
- 루트 `docs/` 와 분리해서 클래스 구조와 재사용 프롬프트를 관리한다.

## 포함 대상

- `architecture/`, `plans/`, `prompts/`
- 클래스 소유 설명 문서, 수행 전 계획 문서, 재사용 프롬프트

## 제외 대상

- 저장소 전체 구조 문서
- 프로젝트 전용 문서와 본체 owner 문서
- 저장소 공용 개발 계획과 개발 이력 문서

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent_class/docs/architecture/README.md`](architecture/README.md)
- [`.agent_class/docs/plans/README.md`](plans/README.md)
- [`docs/architecture/DOCUMENT_OWNERSHIP.md`](../../docs/architecture/DOCUMENT_OWNERSHIP.md)
- [dev/README.md](../../dev/README.md)

## 상태

- Stable
- class owner 문서의 기본 위치다.
- architecture 에 canonical loadout 규약 정본을 포함한다.
- `plans/` 는 `.agent_class` 관련 정렬 작업의 수행 전 계획을 둔다.
- 저장소 공용 개발 계획과 개발 이력은 루트 `dev/plan/`, `dev/log/` 아래로 이동해 관리한다.
