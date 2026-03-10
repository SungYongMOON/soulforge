# .agent_class/tools/local_cli/ui_sync

## 목적

- `ui_sync/` 는 Soulforge 메타 동기화와 구조 검증을 위한 최소 로컬 CLI 도구를 둔다.
- 이번 차수에서는 UI renderer 가 아니라 `body_state.yaml` 재생성과 class installed/loadout 의 Scan/Resolve/Validate 흐름까지 책임진다.

## 현재 포함 도구

- `ui_sync.py`
- `sync-body-state` = `.agent/body.yaml` 과 실제 `.agent/` 구조를 기준으로 `.agent/body_state.yaml` 을 결정론적으로 재생성한다.
- `resolve-loadout` = class installed module manifest catalog 를 만들고 `loadout.yaml` 의 equipped module id 를 resolve 한다.
- `validate` = body, class, loadout 메타와 resolve 결과의 정합성을 검사한다.

## 실행 예시

```bash
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json
```

## 범위

- `body_state.yaml` 의 `body_id`, `sections.*.path`, `sections.*.present`, `status.summary`, `status.warnings` 를 재생성한다.
- `class.yaml.modules.*` 경로를 기준으로 installed module manifest catalog 를 구성한다.
- `loadout.equipped.*` 를 module id 기준으로 resolve 한다.
- `equipped.workflows` 에 포함된 workflow 의 `requires.skills/tools/knowledge` 를 installed catalog 기준으로 resolve 한다.
- validate 는 duplicate id, path-like equipped ref, kind mismatch, tool family/path mismatch, unknown equipped id, equipped workflow dependency unresolved 를 FAIL 로 본다.
- 실제 설치 모듈이 없으면 빈 catalog 로 통과한다.

## JSON 출력 최소 구조

- `catalog.skills`
- `catalog.tools`
- `catalog.workflows`
- `catalog.knowledge`
- `equipped.skills`
- `equipped.tools`
- `equipped.workflows`
- `equipped.knowledge`
- `workflow_dependencies`
- `warnings`
- `errors`
- `summary`

## YAML 지원 범위

- 2-space indentation 기반 mapping 과 list
- `true`, `false`, `null`
- 작은따옴표/큰따옴표 문자열
- 빈 collection 표기 `[]`, `{}`
- 단순 scalar inline list `[a, b]`
- 위 범위를 벗어나는 복잡한 YAML 기능은 지원하지 않는다.

## 제외 범위

- 웹 UI, TUI, renderer, runtime 구현
- host-local 상태, 캐시, 실행 중 임시 상태
- workspace `.project_agent` resolve
- path-based fallback 이나 자동 normalize

## 관련 경로

- [`.agent_class/tools/local_cli/README.md`](../README.md)
- [`.agent/docs/architecture/BODY_METADATA_CONTRACT.md`](../../../../.agent/docs/architecture/BODY_METADATA_CONTRACT.md)
- [`docs/architecture/UI_SYNC_CONTRACT.md`](../../../../docs/architecture/UI_SYNC_CONTRACT.md)
