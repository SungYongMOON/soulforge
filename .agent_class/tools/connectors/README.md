# .agent_class/tools/connectors

## 목적

- `connectors/` 는 외부 서비스와 원격 시스템에 붙기 위한 연결 정의를 둔다.
- 도구를 어떻게 실행할지가 아니라 어디에 어떤 자격으로 접속할지를 다룬다.

## 포함 대상

- 외부 연결 정의
- 인증 진입점, 엔드포인트, 연결 메타

## 제외 대상

- 공통 인터페이스 어댑터
- 로컬 CLI 실행 래퍼와 MCP 프로토콜 바인딩
- 결과 정규화나 명령 실행 절차를 여기에 넣지 않는다. 그것은 `adapters/` 나 `local_cli/` 로 보낸다.

## 관련 경로

- [`.agent_class/tools/README.md`](../README.md)
- [`.agent_class/tools/local_cli/README.md`](../local_cli/README.md)
- [`.agent_class/tools/mcp/README.md`](../mcp/README.md)

## 상태

- Draft
- 지원 연결 종류와 인증 스키마는 추후 정의 예정이다.
