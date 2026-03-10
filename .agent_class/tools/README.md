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
- 현재 `local_cli/ui_sync/` 는 body 메타 동기화, class installed/loadout resolve, workspace `.project_agent` resolve/검증, UI derived state 생성을 위한 최소 CLI 를 제공한다.
- 현재 `local_cli/ui_viewer/` 는 `derive-ui-state --json` 을 읽는 read-only renderer prototype 을 제공한다.

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
- 도구 계층의 하위 분리는 고정한다.
- `local_cli/` 아래에는 resolver/viewer 외에도 happy-path baseline 검증용 `sample_tool_status/` 같은 repo-tracked reference sample 도구가 들어올 수 있다.
- `local_cli/ui_sync/` 는 `sync-body-state`, `resolve-loadout`, `resolve-workspaces`, `derive-ui-state`, `validate` 다섯 명령으로 정본 메타 Scan/Resolve/Validate/Derive 를 수행한다.
- `local_cli/ui_viewer/` 는 `Render` 단계를 read-only prototype 으로 시작하며, 정본 파일 직접 읽기 없이 derived state 소비자로만 동작한다.
