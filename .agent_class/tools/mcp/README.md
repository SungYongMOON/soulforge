# .agent_class/tools/mcp

## 목적

- `mcp/` 는 MCP 서버를 도구 계층에 연결하는 프로토콜 바인딩을 둔다.
- 도구 인터페이스가 MCP일 때의 서버 연결과 세션 경계를 관리한다.

## 포함 대상

- MCP 서버 연결 정의
- 프로토콜 바인딩, 서버 메타, 세션 접속 정보

## 제외 대상

- 일반 로컬 CLI 실행 래퍼
- 지식 팩과 워크플로우 정의
- 단순 명령 실행 래퍼나 일반 결과 정규화를 여기에 넣지 않는다. 그것은 `local_cli/` 나 `adapters/` 로 보낸다.

## 관련 경로

- [`.agent_class/tools/README.md`](../README.md)
- [`.agent_class/tools/connectors/README.md`](../connectors/README.md)

## 상태

- Draft
- 서버 목록과 프로토콜 정책은 추후 정의 예정이다.
