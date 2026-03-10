# .agent_class/tools/adapters

## 목적

- `adapters/` 는 도구별 차이를 공통 도구 인터페이스로 정렬한다.
- 상위 도구 계층이 일관된 방식으로 장비를 다루게 한다.

## 포함 대상

- 도구 인터페이스 어댑터
- 입력과 출력 정규화 규칙

## 제외 대상

- 인증 진입점
- 실제 CLI 실행 바인딩과 MCP 서버 정의

## 관련 경로

- [`.agent_class/tools/README.md`](../README.md)
- [`.agent_class/tools/connectors/README.md`](../connectors/README.md)

## 상태

- Draft
- 공통 인터페이스 규약은 추후 정의 예정이다.
