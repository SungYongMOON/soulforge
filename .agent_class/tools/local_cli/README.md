# .agent_class/tools/local_cli

## 목적

- `local_cli/` 는 호스트에 설치된 CLI 도구 자체를 실행하는 래퍼를 둔다.
- 접속 정보나 프로토콜 정의가 아니라 로컬 프로세스 실행을 다룬다.

## 포함 대상

- 로컬 CLI 실행 래퍼
- 명령 경로, 인자 규약, 실행 메타
- `ui_sync/` = body 메타 동기화, class/workspace resolve/검증, renderer 입력용 derive 를 수행하는 저장소 로컬 CLI
- `ui_viewer/` = `derive-ui-state --json` 을 읽어 4탭 read-only 화면을 렌더링하는 저장소 로컬 CLI
- `ui_viewer/` 의 9차 범위는 read-only renderer 표현 개선이며, derive 계약이나 정본 쓰기 동작은 추가하지 않는다.

## 제외 대상

- 원격 인증 연결 정의
- MCP 서버 프로토콜 바인딩
- 외부 서비스 인증이나 응답 정규화 규칙을 여기에 넣지 않는다. 그것은 `connectors/` 나 `adapters/` 로 보낸다.

## 관련 경로

- [`.agent_class/tools/README.md`](../README.md)
- [`.agent_class/tools/connectors/README.md`](../connectors/README.md)
- [`.agent_class/tools/mcp/README.md`](../mcp/README.md)
- [`.agent_class/tools/local_cli/ui_sync/README.md`](ui_sync/README.md)
- [`.agent_class/tools/local_cli/ui_viewer/README.md`](ui_viewer/README.md)

## 상태

- Draft
- 현재 지원 도구는 `ui_sync/`, `ui_viewer/`, 그리고 reference sample baseline 검증용 `sample_tool_status/` 이다.
- `ui_sync.py` 는 `sync-body-state`, `resolve-loadout`, `resolve-workspaces`, `derive-ui-state`, `validate` 다섯 명령으로 body 상태 재생성, class resolve, workspace 상태 분류/검증, renderer 입력용 derived state 생성을 수행한다.
- `ui_viewer.py` 는 `derive-ui-state --json` 을 subprocess 로 호출해 4탭 read-only UI 와 diagnostics 패널을 렌더링한다.
- `ui_viewer.py` 는 9차에서 parchment / brass / slate / teal 계열의 절제된 게임풍 감성과 긴 텍스트 overflow-safe 표현을 추가했지만, 여전히 derived state 소비자에만 머문다.
