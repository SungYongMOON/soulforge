# 2026-03-10 첫 번째 reference sample 도입 계획

## 상태

- 진행 상태: 완료
- 작업 유형: 첫 happy-path reference sample 1세트 도입 + 회귀 입력 검증
- 계획 저장 위치: `.agent_class/docs/plans/`
- 5차 계획 문서 stale 확인: 완료 (`2026-03-10_read_only_ui_prototype_plan.md`)
- 실제 수행 메모: sample project 검증 중 `resolve-workspaces` 의 project state 판정 버그가 드러나 `ui_sync.py` 를 최소 수정했다.

## 목적

- [x] 실제 library roots 와 `_workspaces/company/` 아래에 repo-tracked reference sample 1세트를 도입한다.
- [x] empty state 중심이던 class/workspace/UI 검증에 최소 happy-path baseline 입력을 추가한다.
- [x] `resolve-loadout`, `resolve-workspaces`, `derive-ui-state`, `ui_viewer` 가 sample 입력을 실제로 반영하는지 확인한다.
- [x] 관련 README 와 현재 결정 문서를 최소 범위로 동기화한다.
- [x] 검증 후 커밋과 푸시까지 완료한다.

## 범위

- [x] `.agent_class/docs/plans/2026-03-10_first_reference_sample_plan.md` 작성 및 완료 체크 갱신
- [x] sample installed module 4종 추가
- [x] `_workspaces/company/sample_reference_project/` 와 `.project_agent/` 계약 파일 추가
- [x] 필요 최소 범위의 `.agent_class/loadout.yaml` 갱신
- [x] root/class/workspace README 와 `CURRENT_DECISIONS.md` 최소 최신화
- [x] sample project state 판정 버그를 고치기 위한 `ui_sync.py` 최소 수정
- [x] 필수 CLI 검증, viewer 확인, `py_compile`, `git diff --check`, 커밋, 푸시

## 고정 결정

- [x] 이번 차수는 fixture bundle 이 아니라 정상 reference sample 1세트만 도입한다.
- [x] invalid sample 과 unbound sample 은 이번 차수에서 만들지 않는다.
- [x] sample 은 별도 fixture 폴더가 아니라 실제 library roots 와 `_workspaces/company/` 아래에 둔다.
- [x] sample 경로와 module id 는 `sample_` 또는 `sample.` 접두를 사용한다.
- [x] sample 은 구조 검증과 회귀 입력용 baseline 이며 운영 데이터가 아니다.
- [x] 기존 계약 스키마는 확장하지 않는다.
- [x] `ui_sync.py`, `ui_viewer.py` 구현은 실제 버그가 없으면 수정하지 않는다.
- [x] top-level `scripts/`, `tests/` 는 새로 만들지 않는다.

## 하지 말 것

- [x] invalid sample 생성
- [x] unbound sample 생성
- [x] fake data card 생성
- [x] 계약 없는 필드 추가
- [x] heavy fixture bundle 도입
- [x] sample 전용 viewer 구조 변경
- [x] 편집 UI, patch UI, 저장 기능 추가

## 샘플 세트 구성

- [x] skill: `sample.skill.echo` at `.agent_class/skills/sample_skill_echo/module.yaml`
- [x] tool: `sample.tool.local_cli.status` at `.agent_class/tools/local_cli/sample_tool_status/module.yaml`
- [x] knowledge: `sample.knowledge.reference` at `.agent_class/knowledge/sample_knowledge_reference/`
- [x] workflow: `sample.workflow.briefing` at `.agent_class/workflows/sample_workflow_briefing/module.yaml`
- [x] sample workflow 는 sample skill/tool/knowledge 에만 의존한다.

## loadout 반영 규칙

- [x] `class_id`, `active_profile`, 기존 `bindings` 는 유지한다.
- [x] 기존 equipped 값은 지우지 않는다.
- [x] 비어 있는 equipped 리스트에는 sample module id 를 append 한다.
- [x] 중복 equipped id 는 만들지 않는다.
- [x] 목표는 installed/equipped/workflow card 가 viewer 와 derive 에서 최소 1회 non-empty 로 보이게 하는 것이다.

## workspace sample 구성

- [x] project path: `_workspaces/company/sample_reference_project/`
- [x] state 목표: `bound`
- [x] `contract.yaml.default_loadout` 은 현재 `loadout.yaml.active_profile` 과 일치시킨다.
- [x] `capsule_bindings.yaml`, `workflow_bindings.yaml`, `local_state_map.yaml` 은 최소 1개 entry 를 가진다.
- [x] project README 에 reference sample / 구조 검증용 / 비운영용 성격을 명시한다.

## 검증 체크리스트

- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
- [x] `python ui/viewer/ui_viewer.py --once --output /tmp/soulforge-reference-sample.html`
- [x] `python ui/viewer/ui_viewer.py --port 8765`
- [x] `/`, `/api/state`, `/healthz` 응답 확인
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py ui/viewer/ui_viewer.py`
- [x] `git diff --check`

## owner 체크

- [x] sample module 은 `.agent_class` library roots 아래에 둔다.
- [x] sample project 계약은 `_workspaces/company/sample_reference_project/.project_agent/` 아래에 둔다.
- [x] root owner 문서는 sample 전략 결정만 최소 반영한다.
- [x] class owner 문서는 sample module 과 계획 문서, loadout 반영만 다룬다.
- [x] project owner 설명은 sample project 내부 README 와 workspace README 에 둔다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 이유`
- [x] `3. sample 세트 구성 요약`
- [x] `4. loadout 반영 요약`
- [x] `5. workspace sample 구성 요약`
- [x] `6. README 최신화 적용 내역`
- [x] `7. 검증 실행 결과`
- [x] `8. 이번 차수에서 의도적으로 미룬 것`
- [x] `9. 남은 리스크 / 다음 차수 제안`
- [x] `10. 커밋 정보`
