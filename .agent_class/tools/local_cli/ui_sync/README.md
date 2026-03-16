# .agent_class/tools/local_cli/ui_sync

## 목적

- `ui_sync/` 는 Soulforge 메타 동기화와 구조 검증을 위한 최소 로컬 CLI 도구를 둔다.
- 새 정본 vNext 에서는 `.agent`, `.unit`, `.agent_class`, `.workflow`, `.party`, `_workspaces` 6축을 기준으로 validator 와 synthetic derived state 만 책임진다.
- `body/loadout/company|personal` 전제는 더 이상 정본이 아니므로 이 도구에서도 canonical requirement 로 취급하지 않는다.

## 현재 포함 도구

- `ui_sync.py`
- `sync-body-state` = compatibility no-op. `.agent/body_state.yaml` 은 vNext 정본이 아니므로 더 이상 재생성하지 않는다.
- `resolve-loadout` = compatibility alias. active loadout 이 아니라 reusable class/package, workflow, party surface만 요약한다.
- `resolve-workspaces` = `_workspaces` 를 local-only mission site mount point 로 보고 public repo 기본 모드에서는 실제 project scan 을 하지 않는다. `--local-workspaces` 를 준 경우에만 opt-in local smoke 를 수행하고, 필요하면 `--workspace-root` 또는 `SOULFORGE_LOCAL_WORKSPACE_ROOT` 로 private mount 경로를 따로 준다.
- `derive-ui-state` = 새 6축 top-level (`species`, `units`, `classes`, `workflows`, `parties`, `workspaces`) 을 산출하고, 현재 renderer 소비층을 위해 compatibility projection (`overview`, `body`, `class_view`) 도 함께 내보낸다.
- `validate` = 새 owner roots 의 최소 파일 세트와 cross-ref 를 검사한다.

## 실행 예시

```bash
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --local-workspaces
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --local-workspaces --workspace-root ~/private/soulforge-workspaces
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state
python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --local-workspaces
python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --local-workspaces --workspace-root ~/private/soulforge-workspaces
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --local-workspaces
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --local-workspaces --workspace-root ~/private/soulforge-workspaces
```

## 범위

- `.agent/index.yaml` 과 `species/<species>/species.yaml`, `heroes/index.yaml`, hero template 를 species/hero canon 으로 검사한다.
- `.unit/<unit_id>/unit.yaml` 과 `policy/`, `protocols/`, `runtime/`, `memory/`, `sessions/`, `autonomic/`, `artifacts/` minimum skeleton 을 active unit owner surface 로 검사한다.
- `.agent_class/index.yaml` 과 각 class package 의 `class.yaml`, `knowledge_refs.yaml`, `skill_refs.yaml`, `tool_refs.yaml`, `profiles/`, `manifests/` 를 reusable package canon 으로 검사한다.
- `.workflow/index.yaml` 과 각 workflow 의 `workflow.yaml`, `role_slots.yaml`, `step_graph.yaml`, `handoff_rules.yaml`, `monster_rules.yaml`, `party_compatibility.yaml`, `history/README.md` 를 workflow canon 으로 검사한다.
- `.party/index.yaml` 과 각 party template 의 `party.yaml`, `member_slots.yaml`, `allowed_species.yaml`, `allowed_classes.yaml`, `allowed_workflows.yaml`, `appserver_profile.yaml`, `stats/README.md` 를 party template canon 으로 검사한다.
- unit/class/workflow/party cross-ref 가 새 roots 에서 resolve 되는지 검사한다.
- `_workspaces` 는 public repo 에서 `README.md` 만 기대하고, 실제 `<project_code>` scan 은 기본적으로 수행하지 않는다.
- `derive-ui-state` 는 public repo 기본 모드에서 synthetic local-only workspace summary 만 내보내며, local scan 결과가 필요할 때만 `--local-workspaces` 를 사용한다.
- local smoke 는 private mount path 를 `--workspace-root` 또는 `SOULFORGE_LOCAL_WORKSPACE_ROOT` 로 주는 것을 권장한다. repo `_workspaces/` 를 그대로 스캔할 경우 legacy `company/`, `personal/` bridge 디렉터리는 자동으로 건너뛴다.

## JSON 출력 최소 구조

- `resolve-loadout --json` = `classes`, `workflows`, `parties`, `summary`
- `resolve-workspaces --json` = `workspaces.mode`, `workspaces.local_scan_enabled`, `workspaces.projects`, `summary`, `findings`
- `derive-ui-state --json` = `species`, `units`, `classes`, `workflows`, `parties`, `workspaces`, `overview`, `body`, `class_view`, `diagnostics`, `ui_hints`
- `validate --json` = `summary`, `findings`, `axes`

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
- 실제 `_workspaces/<project_code>` 운영 데이터, run log, 민감 project 자료
- host-local 캐시와 실행 중 임시 상태
- 실제 renderer 컴포넌트, CSS, theme, icon 세부 규칙

## 관련 경로

- [`.agent_class/tools/local_cli/README.md`](../README.md)
- [`docs/architecture/ui/UI_DERIVED_STATE_CONTRACT.md`](../../../../docs/architecture/ui/UI_DERIVED_STATE_CONTRACT.md)
- [`docs/architecture/ui/UI_SYNC_CONTRACT.md`](../../../../docs/architecture/ui/UI_SYNC_CONTRACT.md)
