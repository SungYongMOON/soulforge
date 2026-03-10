# .agent_class/tools/adapters

## 목적

- `adapters/` 는 도구별 호출 형식과 결과 형식을 공통 도구 인터페이스로 정렬한다.
- 실행 수단이 아니라 인터페이스 차이 흡수에 집중한다.

## 포함 대상

- 도구 인터페이스 어댑터
- 입력값 변환, 출력값 정규화, 오류 형식 정렬

## 제외 대상

- 인증 진입점과 외부 접속 정보
- 실제 CLI 실행 정의와 MCP 서버 바인딩
- 명령 실행 방법이나 서버 연결 방법을 여기에 넣지 않는다. 그것은 `local_cli/`, `connectors/`, `mcp/` 로 보낸다.

## 관련 경로

- [`.agent_class/tools/README.md`](../README.md)
- [`.agent_class/tools/connectors/README.md`](../connectors/README.md)

## 상태

- Draft
- 공통 인터페이스 규약은 추후 정의 예정이다.
