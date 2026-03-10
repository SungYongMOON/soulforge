# .agent_class/tools

## 목적

- `tools/` 는 클래스가 사용하는 외부 장비와 연결 계층을 둔다.
- `skills/`, `workflows/`, `knowledge/` 와 구분되는 도구 접점만 관리한다.

## 포함 대상

- `adapters/`, `connectors/`, `local_cli/`, `mcp/`
- 도구 바인딩과 실행 인터페이스 정렬 자산

## 제외 대상

- 스킬 정의
- 지식 팩과 운영 계획 문서

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent_class/tools/adapters/README.md`](adapters/README.md)
- [`.agent_class/tools/connectors/README.md`](connectors/README.md)
- [`.agent_class/tools/local_cli/README.md`](local_cli/README.md)
- [`.agent_class/tools/mcp/README.md`](mcp/README.md)

## 상태

- Draft
- 도구 계층의 하위 분리는 고정한다. 각 하위 폴더의 세부 규약은 추후 정의 예정이다.
