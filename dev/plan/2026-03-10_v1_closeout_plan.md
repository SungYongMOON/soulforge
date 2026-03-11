# 2026-03-10 v1 종료 기준 정리 계획

## 상태

- 진행 상태: 완료
- 작업 유형: v1 종료 기준, known limitations, 운영/검증 절차 문서 고정
- 계획 저장 위치: `.agent_class/docs/plans/`
- 8차 계획 문서 stale 확인: 완료 (`2026-03-10_first_unbound_reference_sample_plan.md`)
- 실제 수행 메모: 구현 파일 수정 없이 closeout 문서와 README 정합성만 갱신했고, invalid baseline 으로 인한 known non-zero 동작을 문서에 고정했다.

## 목적

- [x] Soulforge의 현재 v1 범위를 `구조 + 상태판 + read-only viewer + baseline 3종` 기준으로 닫는다.
- [x] 새 기능 없이 종료 기준과 known limitations 를 root owner 문서로 고정한다.
- [x] baseline 3종의 의미와 운영상 기대 동작을 README 와 architecture 문서에 반영한다.
- [x] 필수 검증 명령 실행 결과와 문서 서술이 실제 동작과 일치하는지 확인한다.
- [x] 검증 후 커밋과 푸시까지 완료한다.

## 범위

- [x] `.agent_class/docs/plans/2026-03-10_v1_closeout_plan.md` 작성 및 완료 체크 갱신
- [x] `docs/architecture/V1_CLOSEOUT_CHECKLIST.md` 신설
- [x] `docs/architecture/KNOWN_LIMITATIONS.md` 신설
- [x] 루트/architecture/README 계열 문서를 v1 closeout 기준에 맞게 최소 최신화
- [x] workspace baseline 3종의 목적과 운영 의미를 README 에 반영
- [x] 필요 최소 범위의 local CLI README 에 closeout 범위와 known behavior 반영
- [x] 필수 CLI 검증, `py_compile`, `git diff --check`, 커밋, 푸시

## 고정 결정

- [x] 이번 차수는 문서/정리/마감 차수다.
- [x] 새 기능, 새 sample, 새 계약 스키마를 추가하지 않는다.
- [x] `ui_sync.py`, `ui_viewer.py` 는 오탈자, 링크, 실행 예시, 종료 기준 정합성 수준 외에는 수정하지 않는다.
- [x] v1 종료 기준은 `구조 + 상태판 + read-only viewer + baseline 3종` 기준으로 둔다.
- [x] known warning 과 known limitation 은 숨기지 않고 문서에 명시한다.
- [x] 목적은 개선 확장이 아니라 v1을 한 번 닫는 것이다.

## 하지 말 것

- [x] 새 sample 추가
- [x] 새 invalid 원인 추가
- [x] 새 CLI 명령 추가
- [x] data model / derive contract / resolve contract 변경
- [x] 편집 UI, 저장 기능, richer panel 추가
- [x] CI/pre-commit 연결
- [x] top-level `scripts/`, `tests/` 생성

## 종료 기준

- [x] `docs/architecture/V1_CLOSEOUT_CHECKLIST.md` 가 현재 v1 범위, 포함 구성, baseline 3종, 검증 명령, 제외 범위를 명시한다.
- [x] `docs/architecture/KNOWN_LIMITATIONS.md` 가 known warnings, known limitations, 표현 계층/계약 계층의 남은 과제를 사실 기준으로 정리한다.
- [x] `README.md`, `docs/architecture/README.md`, `REPOSITORY_PURPOSE.md`, `CURRENT_DECISIONS.md`, `DOCUMENT_OWNERSHIP.md` 가 새 closeout 문서를 링크한다.
- [x] `_workspaces/README.md` 가 baseline 3종의 목적과 상태 매핑을 기준선으로 고정한다.
- [x] 문서가 현재 CLI 동작과 충돌하지 않는다.

## known limitations 정리 대상

- [x] `workspace_default_loadout_scope` 경고가 현재 구조에서 남는 점
- [x] invalid baseline 이 있는 동안 `resolve-workspaces`, `validate`, `derive-ui-state --json` 이 non-zero 동작을 보일 수 있는 점
- [x] invalid project 의 `workflow_binding_count` 해석 여지가 남는 점
- [x] diagnostics filtering / deep-link / richer detail panel 이 없는 점
- [x] very large catalog / workspace 목록에서 collapse, expand, filtering 이 아직 없는 점
- [x] renderer 가 여전히 read-only prototype 인 점

## 검증 체크리스트

- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
- [x] `python .agent_class/tools/local_cli/ui_viewer/ui_viewer.py --once --output /tmp/soulforge-v1-closeout.html`
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py .agent_class/tools/local_cli/ui_viewer/ui_viewer.py`
- [x] `git diff --check`
- [x] baseline 3종 상태 유지 확인
- [x] README 및 architecture 문서의 closeout 링크 유효성 확인

## owner 체크

- [x] v1 종료 기준과 known limitations 는 root owner 문서로 `docs/architecture/` 아래에 둔다.
- [x] 계획 문서와 closeout 작업 메모는 `.agent_class/docs/plans/` 아래에 둔다.
- [x] workspace baseline 설명은 `_workspaces/README.md` 와 필요 시 workspace 하위 README 에 둔다.
- [x] local CLI README 는 도구 범위와 known behavior 만 다루고 root closeout 문서를 대체하지 않는다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 이유`
- [x] `3. v1 종료 기준 요약`
- [x] `4. known limitations 요약`
- [x] `5. README 최신화 적용 내역`
- [x] `6. 검증 실행 결과`
- [x] `7. 이번 차수에서 의도적으로 미룬 것`
- [x] `8. 후속 선택 과제 (최대 3개)`
- [x] `9. 커밋 정보`
