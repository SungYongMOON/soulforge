# .agent_class/tools/local_cli/ui_sync

## 목적

- `ui_sync/` 는 Soulforge 메타 동기화와 구조 검증을 위한 최소 로컬 CLI 도구를 둔다.
- 이번 차수에서는 UI renderer 가 아니라 `body_state.yaml` 재생성, class installed/loadout resolve, workspace `.project_agent` resolve/validate, renderer 입력용 derived state 생성까지 책임진다.
- v1 closeout 기준에서 local CLI 범위는 여기까지로 닫고, 새 명령 추가보다 현재 동작과 문서 정합성을 우선한다.

## 현재 포함 도구

- `ui_sync.py`
- `sync-body-state` = `.agent/body.yaml` 과 실제 `.agent/` 구조를 기준으로 `.agent/body_state.yaml` 을 결정론적으로 재생성한다.
- `resolve-loadout` = class installed module manifest catalog 를 만들고 `loadout.yaml` 의 equipped module id 를 resolve 한다.
- `resolve-workspaces` = `_workspaces/company|personal` 를 스캔해 프로젝트를 `bound`, `unbound`, `invalid` 로 분류한다.
- `derive-ui-state` = body/class/workspace resolve 결과를 4탭 UI가 바로 읽을 수 있는 stable JSON 으로 합친다.
- `validate` = body, class, loadout 메타와 resolve 결과, workspace project contract 정합성을 검사한다.

## 실행 예시

```bash
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state
python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json
```

## 범위

- `body_state.yaml` 의 `body_id`, `operating_context`, `sections.*.path`, `sections.*.present`, `operating_profiles`, `status.summary`, `status.warnings` 를 재생성한다.
- `class.yaml.modules.*` 경로를 기준으로 installed module manifest catalog 를 구성한다.
- `loadout.equipped.*` 를 module id 기준으로 resolve 한다.
- `equipped.workflows` 에 포함된 workflow 의 `requires.skills/tools/knowledge` 를 installed catalog 기준으로 resolve 한다.
- `_workspaces/company|personal` 아래 직접 하위 프로젝트 폴더를 스캔한다.
- `.project_agent/` 가 없으면 `unbound`, 최소 파일 세트와 핵심 참조가 resolve 되면 `bound`, 계약이 깨지면 `invalid` 로 분류한다.
- `.project_agent/contract.yaml`, `capsule_bindings.yaml`, `workflow_bindings.yaml`, `local_state_map.yaml` 의 최소 구조와 resolve 규칙을 검사한다.
- `derive-ui-state` 는 `ui`, `overview`, `body`, `class`, `workspaces`, `diagnostics` top-level 구조를 고정한다.
- `derive-ui-state` 는 `body.sections`, `class.installed/equipped`, `class.workflow_cards`, `workspaces.summary/project list`, `diagnostics` 를 한 번에 조합한다.
- `derive-ui-state --json` 은 partial output 을 허용하지만 기본적으로 저장소 파일을 새로 쓰지 않는다.
- validate 는 duplicate id, path-like equipped ref, kind mismatch, tool family/path mismatch, unknown equipped id, equipped workflow dependency unresolved 를 FAIL 로 본다.
- validate 는 `invalid` workspace project 를 FAIL 로 보고, `unbound` 는 상태 분류 결과로 허용한다.
- 실제 설치 모듈이 없으면 빈 catalog 로 통과한다.
- 현재 baseline 에 invalid sample 이 포함되어 있으므로 `resolve-workspaces`, `validate`, `derive-ui-state --json` 은 known behavior 로 non-zero 를 반환할 수 있다.

## JSON 출력 최소 구조

- `resolve-loadout --json` = `catalog.*`, `equipped.*`, `workflow_dependencies`, `warnings`, `errors`, `summary`
- `resolve-workspaces --json` = `workspaces.company.projects`, `workspaces.personal.projects`, `summary`, `warnings`, `errors`, `validation`
- `derive-ui-state --json` = `ui`, `overview`, `body`, `class`, `workspaces`, `diagnostics`
- `validate --json` = `summary`, `warnings`, `errors`, `findings`, `resolve_loadout`, `resolve_workspaces`

## YAML 지원 범위

- 2-space indentation 기반 mapping 과 list
- `true`, `false`, `null`
- 작은따옴표/큰따옴표 문자열
- 빈 collection 표기 `[]`, `{}`
- 단순 scalar inline list `[a, b]`
- list item inline mapping (`- key: value`) 과 그 하위 mapping
- 위 범위를 벗어나는 복잡한 YAML 기능은 지원하지 않는다.

## 제외 범위

- 웹 UI, TUI, renderer, runtime 구현
- host-local 상태, 캐시, 실행 중 임시 상태
- 실제 renderer 컴포넌트, CSS, theme, icon 세부 규칙
- path-based fallback 이나 자동 normalize

## 관련 경로

- [`.agent_class/tools/local_cli/README.md`](../README.md)
- [`.agent/docs/architecture/BODY_METADATA_CONTRACT.md`](../../../../.agent/docs/architecture/BODY_METADATA_CONTRACT.md)
- [`docs/architecture/UI_DERIVED_STATE_CONTRACT.md`](../../../../docs/architecture/UI_DERIVED_STATE_CONTRACT.md)
- [`docs/architecture/UI_SYNC_CONTRACT.md`](../../../../docs/architecture/UI_SYNC_CONTRACT.md)
