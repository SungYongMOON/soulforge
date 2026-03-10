# .agent_class/docs

## 목적

- `.agent_class/docs/` 는 class owner 문서를 둔다.
- 루트 `docs/` 와 분리해서 클래스 구조, 계획, 로그, 프롬프트를 관리한다.

## 포함 대상

- `architecture/`, `plans/`, `devlog/`, `prompts/`
- 클래스 소유 설명 문서와 운영 기록
- class 계약 변경 시 수행 계획과 완료 체크리스트

## 제외 대상

- 저장소 전체 구조 문서
- 프로젝트 전용 문서와 본체 owner 문서

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent_class/docs/architecture/README.md`](architecture/README.md)
- [`docs/architecture/DOCUMENT_OWNERSHIP.md`](../../docs/architecture/DOCUMENT_OWNERSHIP.md)

## 상태

- Stable
- class owner 문서의 기본 위치다.
- architecture 에 module reference contract 정본을 포함한다.
- plans 는 root workspace 계약과 UI derive generator 같은 class 측 구현 계획도 함께 관리한다.
