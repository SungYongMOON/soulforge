# .agent_class/tools/local_cli

## 목적

- `local_cli/` 는 호스트에 설치된 CLI 도구 자체를 실행하는 래퍼를 둔다.
- 접속 정보나 프로토콜 정의가 아니라 로컬 프로세스 실행을 다룬다.

## 포함 대상

- 로컬 CLI 실행 래퍼
- 명령 경로, 인자 규약, 실행 메타

## 제외 대상

- 원격 인증 연결 정의
- MCP 서버 프로토콜 바인딩
- 외부 서비스 인증이나 응답 정규화 규칙을 여기에 넣지 않는다. 그것은 `connectors/` 나 `adapters/` 로 보낸다.

## 관련 경로

- [`.agent_class/tools/README.md`](../README.md)
- [`.agent_class/tools/connectors/README.md`](../connectors/README.md)
- [`.agent_class/tools/mcp/README.md`](../mcp/README.md)

## 상태

- Draft
- 지원 CLI 목록과 공통 실행 규약은 추후 정의 예정이다.
