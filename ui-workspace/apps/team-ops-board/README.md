# Workspace Board — Owner Action Inbox MVP

Owner가 지금 읽거나 결정해야 하는 TASK만 네 상태로 압축해 보는
fixture/read-only Workspace Board다. 선택된 Owner Action Inbox 2안의
dark graphite 작업도구 문법을 기존 `team-ops-board` 앱에 적용했다.

## 기본 보드

기본 열은 정확히 아래 네 개다.

- `진행 중`
- `검토·결정 필요`
- `막힘`
- `완료·미확인`

`todo`, 미착수, 대기, `owner_acknowledged`, 보관, 개인·시험 표본은 기본
active 보드에서 제외한다. 검색과 `이력·제외` 화면으로 다시 회수할 수 있다.

카드는 프로젝트·책임분야·상태 작은 메타 뒤에 실제 synthetic TASK 제목,
route, provider만 표시하는 고밀도 접힘 형태다. 책임자·검토자·최근 활동·pointer와
근거·blocker reason·next decision은 선택 시 우측 상세 또는 모바일 dialog에서만
보여 준다. agent/provider badge는 fixture에서 `observed: true`인 값만 렌더링하고
count하며, 같은 TASK의 `observed: false` entry는 badge·복수 agent count에서
제외한다. MIT 라이선스의
`@lobehub/icons-static-svg` 브랜드 자산에서 Codex/GPT는 `codex-color.svg`,
Antigravity/Gemini는 `antigravity-color.svg`, Kimi는 `kimi-color.svg`로
구분한다. 관찰되지 않은 값만 Lucide generic `Bot`과
`UNKNOWN · 추정 안 함`으로 표시한다. worktree도 실제 연결을 표현하도록 지정한
fixture 상세에서만 선택적으로 나타난다.

## 데이터와 안전 경계

- 모든 프로젝트, 책임분야, TASK, agent/provider, pointer, event는 공개 안전
  synthetic fixture다.
- 실제 Codex archive/unarchive, ERP writer, 자동 status writer, 외부 backend,
  network, deployment를 호출하지 않는다.
- `읽고 확인`은 현재 브라우저 메모리의 synthetic `completed_unread`만
  `owner_acknowledged`로 바꾸며, 원 TASK pointer를 fixture history event에
  보존한다. 새로고침하면 초기 fixture로 돌아간다.
- `막힘`은 blocker reason과 next decision을 유지한 채 active에 남는다.

## 규모·상태 표본

- 10 projects × 15 responsibilities × 책임별 2 TASK
- 기본 active target subset과 열별 4건 표시 상한
- project/responsibility/status/search 필터와 열별 더보기
- empty, error, missing-data, UNKNOWN, multi-agent 상태
- desktop, tablet, mobile 반응형과 keyboard focus/accessible name/state
- 760px 이하에서는 최초 진입 시 상세를 자동으로 열지 않는다. 카드 선택 뒤
  상세를 modal dialog로 열고 focus trap, Escape 닫기, 배경 inert를 적용한다.
  `읽고 확인`처럼 modal 내부의 활성 control을 제거하는 상태 전이 뒤에는
  commit된 dialog의 연결된 `상세 닫기`로 focus를 다시 옮긴다.
  닫을 때 원 trigger가 남아 있으면 그 카드로, 확인 전이로 제거되었으면 현재
  이력 화면 control·heading 순서의 안정된 대상으로 focus를 복원한다. 그보다
  큰 viewport는 기본 상세와 비모달 흐름을 유지한다.

## 실행

```bash
npm.cmd --prefix ui-workspace run team-ops-app:dev -- --host 127.0.0.1 --port 4192 --strictPort
npm.cmd --prefix ui-workspace run team-ops-app:build
npm.cmd --prefix ui-workspace run team-ops-app:test
```

로컬 확인 주소는 `http://127.0.0.1:4192/`다.

## 검증

- pure fixture/transition/scale tests: `src/core/owner-inbox.test.mjs`
- 기존 MVP 1 core regression tests: `src/core/core.test.mjs`
- browser evidence: `evidence/`
- Product Design comparison history와 최종 판정: `design-qa.md`

이 결과는 implementer self-check와 browser-rendered design QA를 통과한
`validated_private` 수준이다. fresh independent acceptance나 production
연동·배포를 뜻하지 않는다.
