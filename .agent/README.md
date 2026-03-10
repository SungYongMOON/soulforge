# .agent

## 목적

- `.agent/` 는 에이전트 본체의 지속 계층을 둔다.
- 클래스 교체나 프로젝트 변경 이후에도 남는 구조를 관리한다.

## 포함 대상

- `identity/`, `engine/`, `sessions/`, `memory/`, `communication/`, `autonomic/`, `policy/`, `registry/`, `artifacts/`, `export/`
- 본체 소유 문서와 구조 설명

## 제외 대상

- 설치형 `skills`, `tools`, `workflows`, `knowledge`
- 실제 프로젝트 파일과 프로젝트별 `.project_agent/`

## 관련 경로

- [루트 README](../README.md)
- [`.agent/docs/README.md`](docs/README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](docs/architecture/AGENT_BODY_MODEL.md)

## 상태

- Draft
- 본체 경계는 정의되었다. 하위 폴더별 세부 스키마는 추후 정의 예정이다.
