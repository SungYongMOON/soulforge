# .agent_class/tools

## 목적

- `tools/` 는 클래스가 사용하는 외부 장비와 연결 계층을 둔다.
- `skills/`, `workflows/`, `knowledge/` 와 구분되는 실행 접점만 관리한다.

## 포함 대상

- `adapters/`, `connectors/`, `local_cli/`, `mcp/`
- 도구 바인딩과 실행 인터페이스 자산
- `adapters/` = 입출력 정규화
- `connectors/` = 외부 접속과 인증 진입점
- `local_cli/` = 로컬 CLI 실행 래퍼
- `mcp/` = MCP 서버 바인딩

## 제외 대상

- 스킬 정의
- 지식 팩과 운영 계획 문서
- 한 leaf의 책임을 다른 leaf에 섞어 넣는 구성

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent_class/tools/adapters/README.md`](adapters/README.md)
- [`.agent_class/tools/connectors/README.md`](connectors/README.md)
- [`.agent_class/tools/local_cli/README.md`](local_cli/README.md)
- [`.agent_class/tools/mcp/README.md`](mcp/README.md)

## 상태

- Draft
- 도구 계층의 하위 분리는 고정한다. 각 하위 폴더의 세부 규약은 추후 정의 예정이다.
