# 2026-03-10 UI 파생 상태 계약과 generator 구현 계획

## 상태

- 진행 상태: 완료
- 작업 유형: root UI 파생 상태 계약 신설 + local CLI derive generator 확장
- 계획 저장 위치: `.agent_class/docs/plans/`

## 목적

- [x] `UI_DERIVED_STATE_CONTRACT.md` 를 root owner 문서로 신설한다.
- [x] `ui_sync.py` 에 `derive-ui-state` 를 추가한다.
- [x] body/class/workspace resolve 결과를 4탭 UI 입력용 단일 JSON 구조로 고정한다.
- [x] 관련 root/class README 와 계약 문서를 같은 변경 안에서 동기화한다.
- [x] 검증 후 커밋/푸시한다.

## 범위

- [x] `docs/architecture/UI_DERIVED_STATE_CONTRACT.md` 신설
- [x] `UI_SOURCE_MAP`, `UI_SYNC_CONTRACT`, `CURRENT_DECISIONS`, `DOCUMENT_OWNERSHIP`, `REPOSITORY_PURPOSE` 갱신
- [x] 루트 README 와 architecture README 계열 갱신
- [x] `ui_sync.py` 에 `derive-ui-state` text/json 출력 추가
- [x] `.agent_class/tools/**` 와 `.agent_class/docs/**` README 최신화
- [x] 3차 workspace resolve 계획 문서 stale 여부 확인

## 고정 결정

- [x] 이번 차수는 `Derive` 단계만 구현하고 `Render` 는 구현하지 않는다.
- [x] `derive-ui-state` 는 `sync-body-state`, `resolve-loadout`, `resolve-workspaces`, `validate` 위에 올라가는 파생 단계다.
- [x] `derive-ui-state` 는 기본적으로 저장소 추적 파일을 새로 쓰지 않는다.
- [x] 상단 탭 표기는 `종합(Overview)`, `본체(.agent)`, `직업(.agent_class)`, `워크스페이스(_workspaces)` 로 고정한다.
- [x] 내부 섹션명은 실제 구조명 기준 영어를 유지한다.
- [x] workflow 는 파생 상태에서도 `연계기 카드` 개념으로 구조화한다.
- [x] `unbound` project 는 정상적인 상태 분류 결과로 유지한다.
- [x] 실제 module manifest 와 실제 project 가 없어도 빈 catalog / 빈 workspace 상태로 파생 가능해야 한다.

## 하지 말 것

- [x] 웹 UI, renderer, TUI 구현
- [x] 카드 컴포넌트 상세 설계 고정
- [x] CSS, theme, icon 규칙 고정
- [x] dummy project / dummy module 강제 생성
- [x] runtime readiness / job scheduling 판단
- [x] derive 결과를 저장소 추적 파일로 강제 저장
- [x] top-level `scripts/`, `tests/` 생성
- [x] 자동 normalize 나 추측성 보정

## 파생 상태 스키마 범위

- [x] top-level `ui`, `overview`, `body`, `class`, `workspaces`, `diagnostics`
- [x] `overview` 에 body/class/profile/count/status 요약 포함
- [x] `body.sections` 는 `body.yaml.sections` 순서를 유지
- [x] `class.installed.*` 와 `class.equipped.*` 는 UI가 바로 읽는 object list 로 파생
- [x] `class.workflow_cards` 에 `equipped`, `requires.*`, `dependency_status` 포함
- [x] `workspaces` 에 `summary`, `company.projects`, `personal.projects` 포함
- [x] diagnostics 는 기존 finding 구조와 호환되는 `warnings`, `errors` 를 유지

## CLI 확장 범위

- [x] `derive-ui-state`
- [x] `derive-ui-state --json`
- [x] partial output + non-zero exit code on errors
- [x] 기존 명령 `sync-body-state`, `resolve-loadout`, `resolve-workspaces`, `validate` 유지

## 검증 체크리스트

- [x] 3차 계획 문서 stale 상태 확인
- [x] 4차 계획 문서를 실제 수행 결과에 맞게 갱신
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces`
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py`
- [x] `git diff --check`
- [x] 문서 용어 일관성 확인: `derived state`, `renderer input`, `workflow card`, `diagnostics`
- [x] README 링크/명령 예시 확인
- [x] 커밋
- [x] 푸시

## owner 체크

- [x] `UI_DERIVED_STATE_CONTRACT.md` 는 root `docs/architecture/` 아래에 둔다.
- [x] body/class/workspace owner 계약은 각 owner 문서에 남기고, 파생 상태 조합 규칙만 root 가 소유한다.
- [x] class owner 문서는 local CLI 구현, 계획, README 갱신 범위만 다룬다.
- [x] project 전용 문서와 실제 프로젝트 자료는 `_workspaces/.../<project>/` 안에 남긴다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 이유`
- [x] `3. derived state 계약 핵심 요약`
- [x] `4. derive-ui-state 동작 요약`
- [x] `5. 탭별 파생 구조 요약`
- [x] `6. README 최신화 적용 내역`
- [x] `7. 검증 실행 결과`
- [x] `8. 이번 차수에서 의도적으로 미룬 것`
- [x] `9. 남은 리스크 / 다음 차수 제안`
- [x] `10. 커밋 정보`
