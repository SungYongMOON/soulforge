# 2026-03-10 첫 번째 invalid reference sample 도입 계획

## 상태

- 진행 상태: 완료
- 작업 유형: 첫 invalid reference sample 1세트 도입 + diagnostics/partial render 회귀 검증
- 계획 저장 위치: `.agent_class/docs/plans/`
- 6차 계획 문서 stale 확인: 완료 (`2026-03-10_first_reference_sample_plan.md`)
- 실제 수행 메모: `workflow_bindings.yaml.entrypoint mismatch` 하나만으로 invalid 상태와 partial render 경로가 재현되었고 `ui_sync.py`, `ui_viewer.py` 코드 수정은 필요하지 않았다.

## 목적

- [x] `_workspaces/company/` 아래에 첫 invalid reference sample 1세트를 도입한다.
- [x] happy-path baseline 을 유지한 채 resolve/validate/derive/viewer 의 실패 경로를 실제 입력으로 고정한다.
- [x] `workflow_bindings.yaml.entrypoint mismatch` 하나만 invalid 원인으로 사용한다.
- [x] `derive-ui-state --json` partial output 과 viewer error state 렌더를 실제 입력으로 검증한다.
- [x] 관련 README 와 결정/동기화 문서를 최소 범위로 최신화한다.
- [x] 검증 후 커밋과 푸시까지 완료한다.

## 범위

- [x] `.agent_class/docs/plans/2026-03-10_first_invalid_reference_sample_plan.md` 작성 및 완료 체크 갱신
- [x] `_workspaces/company/sample_invalid_project/` 와 `.project_agent/` 계약 파일 추가
- [x] root/workspace README 와 `CURRENT_DECISIONS.md` 최소 최신화
- [x] 필요 시 `UI_SYNC_CONTRACT.md` 등 관련 동기화 문서 최소 최신화
- [x] 필수 CLI 검증, viewer 확인, `py_compile`, `git diff --check`, 커밋, 푸시

## 고정 결정

- [x] 이번 차수는 invalid sample 1세트만 도입한다.
- [x] invalid 원인은 하나만 사용한다.
- [x] invalid 원인은 `workflow_bindings.yaml` 의 `entrypoint mismatch` 로 고정한다.
- [x] `workflow_id` 는 실제 installed workflow id 를 유지하고 `entrypoint` 만 workflow manifest 와 다르게 둔다.
- [x] happy-path sample (`sample_reference_project`) 는 그대로 유지한다.
- [x] unbound sample 은 이번 차수에서 만들지 않는다.
- [x] 계약 스키마는 확장하지 않는다.
- [x] `ui_sync.py`, `ui_viewer.py` 는 실제 버그가 드러날 때만 최소 수정한다.
- [x] top-level `scripts/`, `tests/` 는 새로 만들지 않는다.

## 하지 말 것

- [x] 두 번째 invalid 원인 추가
- [x] unbound sample 생성
- [x] class library sample 추가
- [x] loadout 변경
- [x] 계약 없는 필드 추가
- [x] sample 전용 viewer 보정 로직 추가
- [x] 편집 UI, patch UI, 저장 기능 추가
- [x] fake diagnostics 생성

## invalid 원인

- [x] 파일: `_workspaces/company/sample_invalid_project/.project_agent/workflow_bindings.yaml`
- [x] 원인: `bindings[1].entrypoint` 가 installed workflow manifest `sample.workflow.briefing` 의 `entrypoint` 와 불일치
- [x] 기대 결과: `resolve-workspaces` 는 `invalid`, `validate` 는 FAIL, `derive-ui-state --json` 은 partial output + diagnostics error, `ui_viewer` 는 partial render notice + invalid state 표시

## sample project 구성

- [x] project path: `_workspaces/company/sample_invalid_project/`
- [x] state 목표: `invalid`
- [x] `contract.yaml` 은 valid 유지
- [x] `capsule_bindings.yaml` 은 valid binding 1개 유지
- [x] `local_state_map.yaml` 은 valid entry 1개 유지
- [x] `workflow_bindings.yaml` 에서만 invalid 원인 1개를 만든다.

## 검증 체크리스트

- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
- [x] `python .agent_class/tools/local_cli/ui_viewer/ui_viewer.py --once --output /tmp/soulforge-invalid-sample.html`
- [x] `python .agent_class/tools/local_cli/ui_viewer/ui_viewer.py --port 8765`
- [x] `/`, `/api/state`, `/healthz` 응답 확인
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py .agent_class/tools/local_cli/ui_viewer/ui_viewer.py`
- [x] `git diff --check`

## owner 체크

- [x] sample project 계약은 `_workspaces/company/sample_invalid_project/.project_agent/` 아래에 둔다.
- [x] root owner 문서는 invalid baseline 전략과 partial/error 검증 사실만 최소 반영한다.
- [x] class owner 문서는 계획 문서와 실제 버그가 있을 때만 local CLI 변경을 다룬다.
- [x] workspace owner 설명은 workspace README 와 sample project README 에 둔다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 이유`
- [x] `3. invalid sample 구성 요약`
- [x] `4. invalid 원인 요약`
- [x] `5. README 최신화 적용 내역`
- [x] `6. 검증 실행 결과`
- [x] `7. 이번 차수에서 의도적으로 미룬 것`
- [x] `8. 남은 리스크 / 다음 차수 제안`
- [x] `9. 커밋 정보`
