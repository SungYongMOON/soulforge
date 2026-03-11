# 2026-03-10 project agent resolve 와 workspace 상태 분류 구현 계획

## 상태

- 진행 상태: 완료
- 작업 유형: root workspace 계약 신설 + local CLI workspace resolve/validate 확장
- 계획 저장 위치: `.agent_class/docs/plans/`

## 목적

- [x] `_workspaces/**/.project_agent/*.yaml` 의 공통 resolve 계약을 root owner 문서로 고정한다.
- [x] workspace project 상태를 `bound`, `unbound`, `invalid` 로 문서와 CLI에 고정한다.
- [x] `ui_sync.py` 에 `resolve-workspaces` 와 workspace 통합 `validate` 를 추가한다.
- [x] root/class README 와 architecture 문서를 같은 변경 안에서 동기화한다.
- [x] 검증 후 커밋/푸시한다.

## 범위

- [x] `docs/architecture/PROJECT_AGENT_RESOLVE_CONTRACT.md` 신설
- [x] `PROJECT_AGENT_MINIMUM_SCHEMA`, `WORKSPACE_PROJECT_MODEL`, `UI_SOURCE_MAP`, `UI_SYNC_CONTRACT` 갱신
- [x] `CURRENT_DECISIONS`, `DOCUMENT_OWNERSHIP`, `REPOSITORY_PURPOSE`, 루트 README 계열 갱신
- [x] `ui_sync.py` 에 workspace scan/resolve/validate 추가
- [x] `.agent_class/tools/**` 와 `.agent_class/docs/**` README 최신화
- [x] 2차 계획 문서 stale 상태 정정

## 고정 결정

- [x] 프로젝트는 `_workspaces/company/<project>/` 또는 `_workspaces/personal/<project>/` 아래 실제 폴더로 존재한다.
- [x] `.project_agent/` 는 프로젝트별 연결 계약 계층이며, 없어도 프로젝트 자체는 존재할 수 있다.
- [x] workspace 상태는 `bound`, `unbound`, `invalid` 세 가지로 분류한다.
- [x] `.project_agent/` 최소 파일 세트는 `contract.yaml`, `capsule_bindings.yaml`, `workflow_bindings.yaml`, `local_state_map.yaml` 네 개다.
- [x] 이번 차수는 workspace resolve/validate 까지만 다루고 renderer, derive state, runtime readiness 는 다루지 않는다.
- [x] `_workspaces/` 아래 프로젝트가 없으면 빈 catalog 로 통과한다.
- [x] `resolve-workspaces` 는 body/class/loadout/module catalog 를 참조할 수 있지만 path normalize 자동 보정은 하지 않는다.

## 하지 말 것

- [x] 웹 UI, renderer, TUI, derive state 구현
- [x] `_workspaces/**` dummy project 강제 생성
- [x] runtime readiness 판단
- [x] workspace UI 카드 스키마 고정
- [x] project-specific 문서를 root 공용 문서로 승격
- [x] top-level `scripts/`, `tests/` 생성

## workspace 상태 분류 기준

- [x] `bound` = 프로젝트 폴더에 `.project_agent/` 와 최소 파일 세트가 있고 핵심 참조가 resolve 된다.
- [x] `unbound` = 프로젝트 폴더는 있으나 `.project_agent/` 가 없다.
- [x] `invalid` = `.project_agent/` 는 있으나 스키마, 참조, 경로 계약이 깨진다.
- [x] `unbound` 는 상태 분류 결과이며 FAIL 이 아니다.
- [x] `invalid` 는 validate FAIL 과 non-zero exit code 대상이다.

## CLI 확장 범위

- [x] `resolve-workspaces`
- [x] `resolve-workspaces --json`
- [x] `validate` 에 workspace scan/resolve/validate 통합
- [x] `_workspaces/company` 와 `_workspaces/personal` 직접 스캔
- [x] project별 `contract`, `capsule_bindings`, `workflow_bindings`, `local_state` 결과 구조화
- [x] summary `bound`, `unbound`, `invalid`, `total` 출력

## 검증 체크리스트

- [x] 2차 계획 문서 완료 상태 정정
- [x] 3차 계획 문서를 실제 수행 결과에 맞게 갱신
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json`
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py`
- [x] `git diff --check`
- [x] README 링크/명령 예시 확인
- [x] 용어 일관성 확인: `bound`, `unbound`, `invalid`, `project contract`, `workflow binding`, `local state map`
- [x] 커밋
- [x] 푸시

## owner 체크

- [x] `.project_agent` 공통 resolve 계약은 root `docs/architecture/` 아래에 둔다.
- [x] 최소 스키마와 공통 resolve 계약의 경계를 root 문서에서 분리한다.
- [x] project 전용 문서와 실제 프로젝트 자료는 `_workspaces/.../<project>/` 안에 남긴다.
- [x] class owner 문서는 local CLI 구현과 수행 계획 범위만 다룬다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 이유`
- [x] `3. workspace resolve 계약 핵심 요약`
- [x] `4. resolve-workspaces 동작 요약`
- [x] `5. validate workspace 강화 내용 요약`
- [x] `6. 상태 분류 기준 요약`
- [x] `7. README 최신화 적용 내역`
- [x] `8. 검증 실행 결과`
- [x] `9. 이번 차수에서 의도적으로 미룬 것`
- [x] `10. 남은 리스크 / 다음 차수 제안`
- [x] `11. 커밋 정보`
