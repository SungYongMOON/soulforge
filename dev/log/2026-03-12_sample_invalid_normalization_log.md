# 2026-03-12 sample invalid normalization log

## 목적

- `_workspaces/company/sample_invalid_project/` 로 남아 있던 더미 샘플을 정상 샘플로 정규화한다.
- workspace 검증이 기본 상태에서 FAIL 나지 않도록 sample project 와 현재-state 문서를 함께 정리한다.

## 수행 내용

- `_workspaces/company/sample_invalid_project/` 를 `_workspaces/company/sample_bound_project/` 로 이동했다.
- `sample_bound_project/.project_agent/contract.yaml` 의 `project_id`, `project_name` 을 새 이름으로 갱신했다.
- `sample_bound_project/.project_agent/workflow_bindings.yaml` 의 `entrypoint` 를 `execute` 에서 `run` 으로 수정해 canonical workflow manifest 와 맞췄다.
- `_workspaces/README.md`, `_workspaces/company/README.md` 를 현재 sample set 기준으로 갱신했다.
- `docs/architecture/KNOWN_LIMITATIONS.md`, `docs/architecture/V1_CLOSEOUT_CHECKLIST.md`, `.agent_class/tools/local_cli/ui_sync/README.md` 에서 intentional invalid baseline 전제를 제거하고 현재 zero-exit 기대 상태로 갱신했다.

## 검증

- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces`
  - PASS
  - summary: total `3`, bound `2`, unbound `1`, invalid `0`
- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
  - PASS
  - summary: `29 pass`, `1 warn`, `0 fail`
  - remaining warn: `contract.default_loadout` 는 아직 `.agent_class/loadout.yaml.active_profile` 단일 값 기준만 검사
- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
  - PASS
- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check`
  - PASS
- changed YAML parse
  - PASS
- changed README link check
  - PASS

## 현재 상태

- repo-tracked sample project set 은 `sample_reference_project = bound`, `sample_bound_project = bound`, `sample_unbound_project = unbound` 다.
- `invalid` 상태 분류와 validate FAIL 규칙은 계약상 계속 지원하지만, 현재 저장소에는 intentional invalid sample 을 유지하지 않는다.

## 비고

- `docs/architecture/UI_SYNC_CONTRACT.md` 의 7차/8차 서술은 구현 이력 설명이므로 이번 작업에서는 수정하지 않았다.
- 과거 `dev/plan`, `dev/log` 문서의 `sample_invalid_project` 언급은 당시 상태 기록이므로 역사 기록으로 유지한다.
