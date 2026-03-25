# NIGHT_WATCH_AUTOMATION_V0

## 목적

- 이 문서는 Soulforge 의 `night_watch` / `guild_master` lane 에서 돌릴 장기 운영용 점검 자동화 후보를 고정한다.
- 저장소에는 자동화의 목적, 점검 범위, 결과 surface 만 기록하고, 실제 실행 시간표와 on/off 는 Codex 앱 로컬 자동화가 맡는다는 경계를 잠근다.

## 한 줄 정의

- `night_watch` 자동화는 `guild_hall/night_watch` owner 아래의 cross-project review / summary layer 이고, 실제 스케줄은 항상 켜 두는 PC 의 Codex app automation 에서만 local 하게 운용한다.

## owner 경계

- `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - 어떤 자동화를 왜 돌리는지 설명하는 tracked canon
- `guild_hall/night_watch/README.md`
  - `night_watch` owner surface 요약
- Codex app local automation
  - 실행 주기, 상태, 실제 prompt 저장
- `guild_hall/state/operations/soulforge_activity/**`
  - 자동화가 보고한 cross-project recent-context surface
- `private-state/guild_hall/state/operations/soulforge_activity/**`
  - 다른 PC 연속성용 mirror

자동화 설정 자체는 Git tracked file 이 아니며, 다른 PC 에서는 같은 repo 문서를 pull 한 뒤 그 PC 의 Codex app 에서 다시 만든다.

## 기본 운용 규칙

1. 자동화는 `항상 켜 두는 PC` 에서만 ACTIVE 로 둔다.
2. 저장소에는 prompt intent 와 output contract 만 남기고, 실제 스케줄은 각 PC 의 Codex app local 설정으로 관리한다.
3. 다른 PC 에서 repo 를 pull 해도 자동화 스케줄은 따라오지 않는다.
4. 다른 PC 에서 같은 자동화를 쓰고 싶으면, pull 후 같은 prompt 로 그 PC 에서 다시 생성한다.
5. 기본값은 `읽기/점검 중심` 으로 두고, 자동 커밋/푸시나 광범위한 파일 재배치는 하지 않는다.
6. 점검 자동화가 파일을 쓸 수 있는 범위는 기본적으로 `guild_hall/state/operations/soulforge_activity/**` 로 제한한다.
7. 점검 결과를 바탕으로 tracked docs/code 를 바로 고치는 auto-fix 는 current-default 에 넣지 않고, 별도 `Fix Draft` companion 으로 분리한다.
8. 새 점검 자동화가 추가되거나 기존 점검의 출력 형식이 바뀌면, `Fix Draft` 입력 범위와 prompt 도 같은 patch 에서 함께 갱신한다.
9. Codex app automation 이 임시 `worktree` 에서 돌아가더라도, runtime state read/write 와 companion repo inspection 은 항상 이 PC 의 active absolute root 를 사용한다.

## current-default 점검 3개와 companion 1개

### 1. Boundary Check

- 목적:
  - owner boundary 위반, public/private 혼입, `_workspaces` / `_workmeta` / `private-state` / `guild_hall` / `.mission` 혼입을 조기에 찾는다.
- 주 입력:
  - `AGENTS.md`
  - `README.md`
  - `docs/architecture/**`
  - `_workmeta/`, `private-state/` companion repo 가 있으면 해당 경계 문서
- 권장 결과:
  - 최대 3개 finding
  - 관련 파일 경로
  - 다음 액션 1개
- 기본 모드:
  - tracked tree read-only
  - `guild_hall/state/operations/soulforge_activity/**` state write 허용
  - commit/push 금지

### 2. Portability Check

- 목적:
  - 절대경로, 특정 PC 사용자명, machine-specific path, OS 편향, tracked skill 안의 host-local 값 누출을 찾는다.
- 주 입력:
  - root docs
  - `.registry/skills/**`
  - bootstrap / update / multi-PC 문서
- 권장 결과:
  - portability risk 3개 이하
  - 다른 PC 에서 깨질 수 있는 이유
  - 수정 우선순위 1개
- 기본 모드:
  - tracked tree read-only
  - `guild_hall/state/operations/soulforge_activity/**` state write 허용
  - commit/push 금지

### 3. Context Drift Check

- 목적:
  - 전역 지침이 과도하게 비대해지는지, project-local 규칙이 전역 문서로 새는지, 반대로 전역 원칙이 project-local rule 로 내려오는지 점검한다.
- 주 입력:
  - `AGENTS.md`
  - `README.md`
  - `docs/architecture/foundation/**`
  - `docs/architecture/guild_hall/**`
  - `_workmeta/<project_code>/rules/**` 중 최근 active rule
- 권장 결과:
  - 문서 집중/중복 징후 3개 이하
  - 분리 추천 위치
  - 다음 정리 액션 1개
- 기본 모드:
  - tracked tree read-only
  - `guild_hall/state/operations/soulforge_activity/**` state write 허용
  - commit/push 금지

### 4. Fix Draft

- 목적:
  - `Boundary Check`, `Portability Check`, `Context Drift Check` 가 남긴 finding 을 바로 tracked tree 에 적용하지 않고, 좁은 범위의 수정 초안과 실행 우선순위로 바꾼다.
- 주 입력:
  - `guild_hall/state/operations/soulforge_activity/latest_context.json`
  - 현재 월 `events/YYYY/YYYY-MM.jsonl` 마지막 몇 건
  - `guild_hall/state/operations/soulforge_activity/log/YYYY/YYYY-MM-DD/*.md` 아래 최근 점검 보고서
- 권장 결과:
  - 최대 1개 fix draft
  - 영향 경로
  - 위험도 분류
  - 수동 적용 여부와 다음 액션 1개
- 기본 모드:
  - draft-only
  - `guild_hall/state/operations/soulforge_activity/**` 밖 편집 금지
  - commit/push 금지

## current-default 시작점

- 첫 번째로 여는 자동화는 `Boundary Check` 로 본다.
- 이유:
  - Soulforge 의 핵심 정체성은 owner boundary 이다.
  - boundary 가 무너지면 portability 와 context drift 도 같이 악화된다.

## Codex app 생성 원칙

- 다른 PC 에서 바로 `만들기` 할 수 있도록 repo 안에는 아래 요소만 유지한다.
  - 자동화 이름
  - 점검 목적
  - 읽을 경로
  - 결과 형식
  - 금지 동작
- 실제 Codex app automation 에는 아래만 local 하게 둔다.
  - 실행 시간표
  - ACTIVE / PAUSED 상태
  - 해당 PC 의 workspace 경로

## worktree-safe local path 입력

Codex app automation 이 임시 worktree 에서 실행될 수 있으므로, local prompt 에는 아래 absolute path 입력을 함께 둔다.

- `<LOCAL_SOULFORGE_ROOT>`
  - 이 PC 의 active Soulforge root absolute path
  - 예: `/Volumes/OPENCLAW_WS/Soulforge`
- `<LOCAL_ACTIVITY_ROOT>`
  - `<LOCAL_SOULFORGE_ROOT>/guild_hall/state/operations/soulforge_activity`
- `<LOCAL_PRIVATE_STATE_ROOT>`
  - `<LOCAL_SOULFORGE_ROOT>/private-state`
- `<LOCAL_WORKMETA_ROOT>`
  - owner-only companion `_workmeta` absolute path
  - 없으면 prompt 안에서 `missing` 으로 처리하고 건너뛴다

tracked canon 문서에서는 계속 repo-relative 경로를 쓴다.
하지만 Codex app local automation prompt 는 위 absolute path 를 사용해 실제 운영 state 를 읽고 써야 한다.

## 실행 결과 저장 규칙

1. 각 자동화 실행은 먼저 Codex inbox/thread 에 사람용 요약을 남긴다.
2. 같은 실행의 상세 결과는 active absolute root 기준 `guild_hall/state/operations/soulforge_activity/log/YYYY/YYYY-MM-DD/HHMM-<automation-id>.md` 에 저장한다.
3. 각 실행은 active absolute root 기준 `guild_hall/state/operations/soulforge_activity/events/YYYY/YYYY-MM.jsonl` 에 요약 event 1건을 append 한다.
4. 최근 이어받기 surface 는 active absolute root 기준 `guild_hall/state/operations/soulforge_activity/latest_context.json` 에 유지한다.
5. secret, raw mail body, token, password, cookie, session, credential JSON 은 상세 log/report 에 남기지 않는다.
6. `Fix Draft` 는 tracked docs/code 를 직접 바꾸지 않고, draft report 와 activity surface 갱신만 수행한다.
7. 임시 worktree 안의 같은 상대 경로에 저장하는 것은 canonical write 로 인정하지 않는다.

## Codex app 생성 사양

아래 사양은 repo 에 저장해 두는 ready-to-create spec 이다.
다른 PC 에서는 이 문서를 pull 한 뒤, 해당 PC 의 Codex app automation 생성 화면이나 Codex 대화창에서 그대로 참고해 local automation 으로 만든다.

### 1. Boundary Check

- 이름:
  - `Soulforge Boundary Check`
- 권장 주기:
  - 매일 `02:00`
- 권장 상태:
  - 항상 켜 두는 운영 PC 에서만 `ACTIVE`
  - 그 외 PC 는 `PAUSED` 또는 미생성
- 작업 경로:
  - Codex app local cwd 1개
  - 예: `<LOCAL_SOULFORGE_ROOT>`
- 실행 프롬프트:
  - `Treat <LOCAL_SOULFORGE_ROOT> as the active Soulforge root on this PC and <LOCAL_ACTIVITY_ROOT> as the only valid runtime write target for this automation. If Codex is running inside a temporary worktree, do not read or write runtime state under the worktree copy. Read <LOCAL_ACTIVITY_ROOT>/latest_context.json first if it exists, then inspect <LOCAL_SOULFORGE_ROOT>/AGENTS.md, <LOCAL_SOULFORGE_ROOT>/README.md, key architecture docs under <LOCAL_SOULFORGE_ROOT>/docs/architecture, and the companions at <LOCAL_WORKMETA_ROOT> and <LOCAL_PRIVATE_STATE_ROOT> if present. Check for owner-boundary violations, public/private mixing, misplaced project-local rules, and layer confusion across _workspaces, _workmeta, private-state, guild_hall, and .mission. Return at most 3 concrete findings with file paths and one recommended next action. Save a detailed markdown report under <LOCAL_ACTIVITY_ROOT>/log/YYYY/YYYY-MM-DD/HHMM-soulforge-boundary-check.md, append one summary event to <LOCAL_ACTIVITY_ROOT>/events/YYYY/YYYY-MM.jsonl, and refresh <LOCAL_ACTIVITY_ROOT>/latest_context.json with a small recent window. Do not edit files outside <LOCAL_ACTIVITY_ROOT>, do not commit, and do not push.`

### 2. Portability Check

- 이름:
  - `Soulforge Portability Check`
- 권장 주기:
  - 매주 `화/목/토 02:10`
- 권장 상태:
  - 항상 켜 두는 운영 PC 에서만 `ACTIVE`
  - 그 외 PC 는 `PAUSED` 또는 미생성
- 작업 경로:
  - Codex app local cwd 1개
  - 예: `<LOCAL_SOULFORGE_ROOT>`
- 실행 프롬프트:
  - `Treat <LOCAL_SOULFORGE_ROOT> as the active Soulforge root on this PC and <LOCAL_ACTIVITY_ROOT> as the only valid runtime write target for this automation. If Codex is running inside a temporary worktree, do not read or write runtime state under the worktree copy. Read <LOCAL_ACTIVITY_ROOT>/latest_context.json first if it exists, then inspect root docs under <LOCAL_SOULFORGE_ROOT>, bootstrap/update/multi-PC docs, and tracked skill packages under <LOCAL_SOULFORGE_ROOT>/.registry/skills. Check for absolute paths, machine-specific usernames, OS-specific assumptions, host-local values inside tracked skill packages, and instructions that would break on another PC. Return at most 3 portability risks with file paths and one recommended next action. Save a detailed markdown report under <LOCAL_ACTIVITY_ROOT>/log/YYYY/YYYY-MM-DD/HHMM-soulforge-portability-check.md, append one summary event to <LOCAL_ACTIVITY_ROOT>/events/YYYY/YYYY-MM.jsonl, and refresh <LOCAL_ACTIVITY_ROOT>/latest_context.json with a small recent window. Do not edit files outside <LOCAL_ACTIVITY_ROOT>, do not commit, and do not push.`

### 3. Context Drift Check

- 이름:
  - `Soulforge Context Drift Check`
- 권장 주기:
  - 매주 `월/수/금 02:20`
- 권장 상태:
  - 항상 켜 두는 운영 PC 에서만 `ACTIVE`
  - 그 외 PC 는 `PAUSED` 또는 미생성
- 작업 경로:
  - Codex app local cwd 1개
  - 예: `<LOCAL_SOULFORGE_ROOT>`
- 실행 프롬프트:
  - `Treat <LOCAL_SOULFORGE_ROOT> as the active Soulforge root on this PC and <LOCAL_ACTIVITY_ROOT> as the only valid runtime write target for this automation. If Codex is running inside a temporary worktree, do not read or write runtime state under the worktree copy. Read <LOCAL_ACTIVITY_ROOT>/latest_context.json first if it exists, then inspect <LOCAL_SOULFORGE_ROOT>/AGENTS.md, <LOCAL_SOULFORGE_ROOT>/README.md, docs under <LOCAL_SOULFORGE_ROOT>/docs/architecture/foundation and <LOCAL_SOULFORGE_ROOT>/docs/architecture/guild_hall, and recent project-local rule files under <LOCAL_WORKMETA_ROOT> when present. Check whether global rules are leaking into project-local rule files, project-local rules are leaking into global docs, top-level instructions are becoming too large, or nearby owner guidance is missing. Return at most 3 findings with file paths, a suggested owner location for each, and one recommended next action. Save a detailed markdown report under <LOCAL_ACTIVITY_ROOT>/log/YYYY/YYYY-MM-DD/HHMM-soulforge-context-drift-check.md, append one summary event to <LOCAL_ACTIVITY_ROOT>/events/YYYY/YYYY-MM.jsonl, and refresh <LOCAL_ACTIVITY_ROOT>/latest_context.json with a small recent window. Do not edit files outside <LOCAL_ACTIVITY_ROOT>, do not commit, and do not push.`

### 4. Fix Draft

- 이름:
  - `Soulforge Fix Draft`
- 권장 주기:
  - 매일 `02:30`
- 권장 상태:
  - 기본값은 `PAUSED`
  - 운영 PC 에서도 점검 자동화가 안정화된 뒤에만 `ACTIVE`
- 작업 경로:
  - Codex app local cwd 1개
  - 예: `<LOCAL_SOULFORGE_ROOT>`
- 실행 프롬프트:
  - `Treat <LOCAL_SOULFORGE_ROOT> as the active Soulforge root on this PC and <LOCAL_ACTIVITY_ROOT> as the only valid runtime write target for this automation. If Codex is running inside a temporary worktree, do not read or write runtime state under the worktree copy. Read <LOCAL_ACTIVITY_ROOT>/latest_context.json first if it exists, then inspect the latest relevant entries in <LOCAL_ACTIVITY_ROOT>/events/YYYY/YYYY-MM.jsonl and the newest markdown reports under <LOCAL_ACTIVITY_ROOT>/log/YYYY/YYYY-MM-DD/. If Boundary Check, Portability Check, or Context Drift Check found a real issue, write at most one narrow fix draft under <LOCAL_ACTIVITY_ROOT>/log/YYYY/YYYY-MM-DD/HHMM-soulforge-fix-draft.md with affected paths, risk level, owner location, and the safest next action. When needed, inspect the companions at <LOCAL_WORKMETA_ROOT> and <LOCAL_PRIVATE_STATE_ROOT> for additional context, but keep the run draft-only. Append one summary event to <LOCAL_ACTIVITY_ROOT>/events/YYYY/YYYY-MM.jsonl and refresh <LOCAL_ACTIVITY_ROOT>/latest_context.json. Do not edit tracked docs or code outside <LOCAL_ACTIVITY_ROOT>, do not commit, and do not push.`

## 다른 PC 에서 바로 만들 때 쓰는 짧은 지시

- `이 문서의 Boundary Check 사양으로 Codex automation 을 만들어줘.`
- `이 문서의 Portability Check 사양으로 Codex automation 을 만들어줘.`
- `이 문서의 Context Drift Check 사양으로 Codex automation 을 만들어줘.`
- `이 문서의 Fix Draft 사양으로 Codex automation 을 만들어줘.`

자동화 생성 직전에는 `<LOCAL_SOULFORGE_ROOT>`, `<LOCAL_ACTIVITY_ROOT>`, `<LOCAL_PRIVATE_STATE_ROOT>`, `<LOCAL_WORKMETA_ROOT>` 를 그 PC 의 실제 absolute path 로 치환한다.

## 권장 실행 결과 surface

- 사람이 바로 볼 요약:
  - `guild_hall/state/operations/soulforge_activity/latest_context.json`
- append-only event:
  - `guild_hall/state/operations/soulforge_activity/events/YYYY/YYYY-MM.jsonl`
- 상세 실행 log:
  - `guild_hall/state/operations/soulforge_activity/log/YYYY/YYYY-MM-DD/HHMM-<automation-id>.md`
- 다른 PC 연속성:
  - `private-state/guild_hall/state/operations/soulforge_activity/**`

필요하면 자세한 report file 을 별도로 둘 수 있지만, current-default 는 recent-context surface 갱신만으로도 충분하다고 본다.

## Fix Draft 동기화 규칙

1. `Boundary Check`, `Portability Check`, `Context Drift Check` 중 하나라도 목적, 입력 경로, 결과 형식이 바뀌면 `Fix Draft` prompt 도 같은 patch 에서 갱신한다.
2. 새 night_watch 점검 자동화가 추가되면, 해당 자동화가 `Fix Draft` 입력 집합에 들어가는지 여부를 같은 patch 에서 명시한다.
3. `Fix Draft` 가 어떤 점검 자동화를 소비하는지는 이 문서의 사양과 `guild_hall/state/operations/soulforge_activity/log/**` 저장 규칙에 함께 반영한다.
4. 새 점검 자동화가 추가됐는데 `Fix Draft` 갱신이 빠졌으면 owner handoff 전에 보완한다.

## 다른 PC 적용 절차

1. public `Soulforge` 를 pull 한다.
2. `_workmeta/` 와 `private-state/` 를 pull 한다.
3. `latest_context.json` 을 먼저 읽어 최근 운영 맥락을 복원한다.
4. 이 문서를 기준으로 Codex app local automation 을 그 PC 에서 다시 만든다.
5. 그 PC 가 항상 켜 두는 운영 PC 가 아니면 `PAUSED` 또는 미생성 상태로 둔다.

## 관련 경로

- [`../../../guild_hall/README.md`](../../../guild_hall/README.md)
- [`../../../guild_hall/night_watch/README.md`](../../../guild_hall/night_watch/README.md)
- [`GUILD_HALL_MODEL_V0.md`](GUILD_HALL_MODEL_V0.md)
- [`SOULFORGE_ACTIVITY_LOG_V0.md`](SOULFORGE_ACTIVITY_LOG_V0.md)
- [`../bootstrap/UPDATE_MANUAL_V0.md`](../bootstrap/UPDATE_MANUAL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
