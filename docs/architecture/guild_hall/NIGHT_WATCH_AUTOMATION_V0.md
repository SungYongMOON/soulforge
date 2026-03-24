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

## current-default 후보 3개

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
  - read-only
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
  - read-only
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
  - read-only
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
  - `~/Workspace/Soulforge`
- 실행 프롬프트:
  - `Review the Soulforge workspace for long-term architecture drift. Read guild_hall/state/operations/soulforge_activity/latest_context.json first if it exists, then inspect the root AGENTS.md, README.md, key architecture docs, and the _workmeta and private-state companions if present. Check for owner-boundary violations, public/private mixing, misplaced project-local rules, and layer confusion across _workspaces, _workmeta, private-state, guild_hall, and .mission. Return at most 3 concrete findings with file paths and one recommended next action. Do not edit files, do not commit, and do not push.`

### 2. Portability Check

- 이름:
  - `Soulforge Portability Check`
- 권장 주기:
  - 매주 `화/목/토 02:10`
- 권장 상태:
  - 항상 켜 두는 운영 PC 에서만 `ACTIVE`
  - 그 외 PC 는 `PAUSED` 또는 미생성
- 작업 경로:
  - `~/Workspace/Soulforge`
- 실행 프롬프트:
  - `Review the Soulforge workspace for portability risks. Read guild_hall/state/operations/soulforge_activity/latest_context.json first if it exists, then inspect the root docs, bootstrap/update/multi-PC docs, and tracked skill packages under .registry/skills. Check for absolute paths, machine-specific usernames, OS-specific assumptions, host-local values inside tracked skill packages, and instructions that would break on another PC. Return at most 3 portability risks with file paths and one recommended next action. Do not edit files, do not commit, and do not push.`

### 3. Context Drift Check

- 이름:
  - `Soulforge Context Drift Check`
- 권장 주기:
  - 매주 `월/수/금 02:20`
- 권장 상태:
  - 항상 켜 두는 운영 PC 에서만 `ACTIVE`
  - 그 외 PC 는 `PAUSED` 또는 미생성
- 작업 경로:
  - `~/Workspace/Soulforge`
- 실행 프롬프트:
  - `Review the Soulforge workspace for context bloat and instruction drift. Read guild_hall/state/operations/soulforge_activity/latest_context.json first if it exists, then inspect AGENTS.md, README.md, docs/architecture/foundation, docs/architecture/guild_hall, and recent project-local rule files under _workmeta when present. Check whether global rules are leaking into project-local rule files, project-local rules are leaking into global docs, top-level instructions are becoming too large, or nearby owner guidance is missing. Return at most 3 findings with file paths, a suggested owner location for each, and one recommended next action. Do not edit files, do not commit, and do not push.`

## 다른 PC 에서 바로 만들 때 쓰는 짧은 지시

- `이 문서의 Boundary Check 사양으로 Codex automation 을 만들어줘.`
- `이 문서의 Portability Check 사양으로 Codex automation 을 만들어줘.`
- `이 문서의 Context Drift Check 사양으로 Codex automation 을 만들어줘.`

## 권장 실행 결과 surface

- 사람이 바로 볼 요약:
  - `guild_hall/state/operations/soulforge_activity/latest_context.json`
- append-only event:
  - `guild_hall/state/operations/soulforge_activity/events/YYYY/YYYY-MM.jsonl`
- 다른 PC 연속성:
  - `private-state/guild_hall/state/operations/soulforge_activity/**`

필요하면 자세한 report file 을 별도로 둘 수 있지만, current-default 는 recent-context surface 갱신만으로도 충분하다고 본다.

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
