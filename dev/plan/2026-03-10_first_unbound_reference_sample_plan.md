# 2026-03-10 첫 번째 unbound reference sample 도입 계획

## 상태

- 진행 상태: 완료
- 작업 유형: 첫 unbound reference sample 1세트 도입 + 상태판 회귀 입력 검증
- 계획 저장 위치: `.agent_class/docs/plans/`
- 7차 계획 문서 stale 확인: 완료 (`2026-03-10_first_invalid_reference_sample_plan.md`)
- 실제 수행 메모: `ui_sync.py`, `ui_viewer.py` 코드 수정 없이 `sample_unbound_project` 추가와 문서 동기화만으로 `bound / invalid / unbound` 세 상태 회귀 입력이 닫혔다.

## 목적

- [x] `_workspaces/personal/` 아래에 첫 unbound reference sample 1세트를 도입한다.
- [x] happy-path baseline 과 invalid baseline 을 유지한 채 workspace 상태 축 `bound / unbound / invalid` 를 모두 실제 입력으로 닫는다.
- [x] `resolve-workspaces`, `validate`, `derive-ui-state`, `ui_viewer` 가 unbound 상태를 정상 분류 결과로 반영하는지 확인한다.
- [x] 관련 README 와 결정 문서를 최소 범위로 동기화한다.
- [x] 검증 후 커밋과 푸시까지 완료한다.

## 범위

- [x] `.agent_class/docs/plans/2026-03-10_first_unbound_reference_sample_plan.md` 작성 및 완료 체크 갱신
- [x] `_workspaces/personal/sample_unbound_project/README.md` 추가
- [x] `_workspaces/personal/README.md` 최신화
- [x] root/workspace README 와 `CURRENT_DECISIONS.md` 최소 최신화
- [x] 필요 시 `UI_SYNC_CONTRACT.md` 등 관련 동기화 문서 최소 최신화
- [x] 필수 CLI 검증, viewer 확인, `py_compile`, `git diff --check`, 커밋, 푸시

## 고정 결정

- [x] 이번 차수는 unbound sample 1세트만 도입한다.
- [x] 위치는 `_workspaces/personal/` 아래로 고정한다.
- [x] personal root 에 첫 실샘플을 추가하는 목적을 함께 가진다.
- [x] unbound sample 은 프로젝트 폴더는 존재하지만 `.project_agent/` 는 만들지 않는다.
- [x] happy-path sample (`sample_reference_project`) 와 invalid sample (`sample_invalid_project`) 는 그대로 유지한다.
- [x] 계약 스키마는 확장하지 않는다.
- [x] `ui_sync.py`, `ui_viewer.py` 는 실제 버그가 드러날 때만 최소 수정한다.
- [x] top-level `scripts/`, `tests/` 는 새로 만들지 않는다.

## 하지 말 것

- [x] 두 번째 invalid 원인 추가
- [x] `.project_agent/` 를 가진 personal sample 생성
- [x] class library sample 추가
- [x] loadout 변경
- [x] 계약 스키마 확장
- [x] sample 전용 보정 로직 추가
- [x] 편집 UI, patch UI, 저장 기능 추가
- [x] fake diagnostics 생성

## unbound sample 정의

- [x] 프로젝트 폴더는 존재하지만 `.project_agent/` 가 없는 상태를 사용한다.
- [x] `unbound` 는 validate FAIL 이 아니라 상태 분류 결과로만 남긴다.
- [x] viewer 와 derive 는 `unbound` 를 오류 카드가 아닌 상태 badge 로만 표현해야 한다.

## sample project 구성

- [x] project path: `_workspaces/personal/sample_unbound_project/`
- [x] state 목표: `unbound`
- [x] `.project_agent/` 폴더를 만들지 않는다.
- [x] 숨은 계약 파일이나 우회용 메타 파일을 만들지 않는다.
- [x] project README 에 unbound reference sample / 비운영용 / 상태판 baseline / `.project_agent/` 부재 의도를 명시한다.

## 검증 체크리스트

- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
- [x] `python ui/viewer/ui_viewer.py --once --output /tmp/soulforge-unbound-sample.html`
- [x] 가능하면 `python ui/viewer/ui_viewer.py --port 8765` 실행 후 `/`, `/api/state`, `/healthz` 확인
- [x] `sample_reference_project` 가 계속 `bound` 인지 확인
- [x] `sample_invalid_project` 가 계속 `invalid` 인지 확인
- [x] `sample_unbound_project` 가 `unbound` 인지 확인
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py ui/viewer/ui_viewer.py`
- [x] `git diff --check`

## owner 체크

- [x] sample project 설명은 `_workspaces/personal/` 아래 README 들에 둔다.
- [x] root owner 문서는 unbound baseline 추가와 상태판 회귀 입력 확대만 최소 반영한다.
- [x] class owner 문서는 계획 문서와 실제 버그가 있을 때만 local CLI 변경을 다룬다.
- [x] project owner 계약 파일은 이번 차수에서 만들지 않는다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 이유`
- [x] `3. unbound sample 구성 요약`
- [x] `4. 상태 분류 결과 요약`
- [x] `5. README 최신화 적용 내역`
- [x] `6. 검증 실행 결과`
- [x] `7. 이번 차수에서 의도적으로 미룬 것`
- [x] `8. 남은 리스크 / 다음 차수 제안`
- [x] `9. 커밋 정보`
