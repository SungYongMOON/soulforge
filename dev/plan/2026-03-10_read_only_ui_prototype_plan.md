# 2026-03-10 read-only UI prototype 구현 계획

## 상태

- 진행 상태: 완료
- 작업 유형: `Render` 단계 read-only viewer 도입
- 계획 저장 위치: `.agent_class/docs/plans/`
- 4차 계획 문서 stale 확인: 완료 (`2026-03-10_ui_derived_state_and_generator_plan.md`)

## 목적

- [x] `derive-ui-state --json` 만 읽는 read-only UI prototype 을 도입한다.
- [x] 4탭 화면과 diagnostics 패널로 derived state 를 왜곡 없이 시각화한다.
- [x] `empty`, `partial`, `invalid`, `unbound` 상태도 화면에서 구분 가능하게 만든다.
- [x] viewer leaf 와 관련 README 를 같은 변경 안에서 동기화한다.
- [x] 검증 후 커밋/푸시한다.

## 범위

- [x] `ui/viewer/` 신설
- [x] `ui_viewer.py` 구현
- [x] viewer README 작성
- [x] root/class/tools/docs README 최신화
- [x] 필요 시 root architecture 계약 문서 최소 수정

## 고정 결정

- [x] viewer 는 read-only prototype 으로만 구현한다.
- [x] viewer 는 정본 파일을 직접 읽지 않고 `derive-ui-state --json` 출력만 소비한다.
- [x] `ui_sync.py` 는 derive/validate 전용으로 유지하고 viewer 와 책임을 분리한다.
- [x] 상단 탭 표기는 `종합(Overview)`, `본체(.agent)`, `직업(.agent_class)`, `워크스페이스(_workspaces)` 로 고정한다.
- [x] 내부 섹션명은 영어 구조명을 유지한다.
- [x] `workflow_cards` 는 read-only 연계기 카드로만 표시한다.
- [x] diagnostics 는 별도 패널 또는 하단 영역으로 유지한다.
- [x] 편집, 저장, 정본 파일 쓰기 기능은 넣지 않는다.

## 하지 말 것

- [x] 정본 파일 직접 수정 UI
- [x] 저장 버튼, patch UI, form 편집 기능
- [x] fake data, dummy card, 추측성 path 보정
- [x] 무거운 웹 프레임워크 추가
- [x] theme, icon system, animation system 과설계
- [x] top-level `scripts/`, `tests/` 생성

## 화면 구성

- [x] `종합(Overview)` = body/class/profile/count/status 요약
- [x] `본체(.agent)` = body id, name, section list, `present`
- [x] `직업(.agent_class)` = installed/equipped, tools by family, workflow cards
- [x] `워크스페이스(_workspaces)` = summary, company/personal project list, project state
- [x] diagnostics = warnings, errors, `level/code/message`
- [x] 상태 뱃지 = `PASS`, `WARN`, `FAIL`, `bound`, `unbound`, `invalid`, `present`, `missing`, `resolved`

## 실행 방식

- [x] 기본 실행 명령: `python ui/viewer/ui_viewer.py`
- [x] 포트 지정 실행: `python ui/viewer/ui_viewer.py --port 8765`
- [x] 1회 HTML 생성: `python ui/viewer/ui_viewer.py --once`
- [x] viewer 는 Python 표준 라이브러리 HTTP 서버와 정적 HTML 렌더링만 사용한다.
- [x] viewer 는 `sys.executable` 로 `ui_sync.py derive-ui-state --json` 을 호출한다.

## 검증 체크리스트

- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
- [x] `python ui/viewer/ui_viewer.py --once`
- [x] viewer 실행 후 4탭 HTML 확인
- [x] empty state 와 diagnostics 출력 확인
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py ui/viewer/ui_viewer.py`
- [x] `git diff --check`
- [x] README 링크와 명령 예시 확인

## owner 체크

- [x] viewer 구현은 `ui/viewer/` 아래에 둔다.
- [x] `ui_sync.py` 는 derived state producer 로 유지한다.
- [x] render 단계 경계 설명은 root owner 문서 `UI_SYNC_CONTRACT.md` 에 최소 반영한다.
- [x] class owner README 는 viewer leaf 와 실행 방법만 다룬다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 이유`
- [x] `3. viewer 구조 요약`
- [x] `4. 탭별 표시 요약`
- [x] `5. 상태 표시 규칙 요약`
- [x] `6. README 최신화 적용 내역`
- [x] `7. 검증 실행 결과`
- [x] `8. 이번 차수에서 의도적으로 미룬 것`
- [x] `9. 남은 리스크 / 다음 차수 제안`
- [x] `10. 커밋 정보`
