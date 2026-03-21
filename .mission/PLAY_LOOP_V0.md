# Play Loop V0

## 목적

- 이 문서는 Soulforge 의 current-default dogfood loop 를 잠그기 위한 owner-local planning note 다.
- 지금 phase 의 목표는 완벽한 자동화가 아니라, 첫 playable alpha 를 열 수 있는 최소 운영 루프를 고정하는 것이다.
- 아직 architecture canon 으로 승격하지 않고, 실제 사용 후 보정할 draft 로 둔다.

## 한 줄 정의

- `PLAY_LOOP_V0` 는 `guild_master` 를 기본 창구로 두고, normalized `메일 event` 를 받아 `workspace intake inbox` 와 `monsters[]` 를 만든 뒤, `dungeon assignment -> .mission draft -> battle execution -> morning_report` 로 이어지는 current-default dogfood loop 다.

## 현재 phase 해석

- v0 는 "전체 판타지 완성" 이 아니라 "하루 업무를 한 번 끝까지 돌려보는 playable slice" 로 본다.
- 자동화, 승격, 세계관, UI polish 는 이 루프를 실제로 써본 뒤에 다듬는다.
- 그래서 v0 는 일부러 scope 를 작게 자르고, source of truth 도 현재 계약을 그대로 유지한다.

## 경계

- `PLAY_LOOP_V0` 는 top-level canonical root 가 아니다.
- 이 문서는 `.mission/` owner-local draft 이며, 현재 default 운영 감각을 정리하는 planning note 다.
- 정본/source of truth 는 계속 `.mission/**`, `guild_hall/state/**`, `_workspaces/<project_code>/.project_agent/**` 에 남긴다.
- 외부 보드나 보조 surface 는 써도 되지만, canonical mission surface 나 runtime truth owner 로 올리지 않는다.
- raw execution truth, private input dump, project-local battle trace 는 tracked repo 로 복제하지 않는다.

## v0 범위

- project 는 `1개` 로 제한한다.
- party 는 `1개` 로 제한하고, current-default party 는 `guild_master_cell` 로 본다.
- monster tier 는 `2개` 정도로 제한한다.
- 기본 창구는 `guild_master` 로 고정한다.
- 첫 입력원은 `메일만` 연다.
- 첫 분류축은 `자동화 가능성` 으로 둔다.

## 이번 잠금선

- 이번 phase 의 첫 성공 기준은 `메일 1건 end-to-end` 다.
- 여기서 첫 `end-to-end` 는 실제 메일 연동 전체를 뜻하지 않고, `mail event -> workspace intake inbox -> dungeon assignment -> .mission draft -> local battle_log/morning_report reference` 가 끊기지 않는지를 본다.
- `workflow_id` 가 아직 안 잠겼더라도 `.mission/**` 에 first tracked draft 를 쓰는 것은 허용한다.
- 다만 그 경우 `readiness` 는 `blocked` 로 남고, blocker owner 를 명시해야 한다.
- current-default 시작 호출과 staging surface 는 [`MAIL_INTAKE_REQUEST_V0.md`](../docs/architecture/workspace/MAIL_INTAKE_REQUEST_V0.md), [`WORKSPACE_INTAKE_INBOX_V0.md`](../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md), [`DUNGEON_ASSIGNMENT_REQUEST_V0.md`](../docs/architecture/workspace/DUNGEON_ASSIGNMENT_REQUEST_V0.md) 에서 잠근다.
- `.mission/**` handoff 최소 필드는 [`MAIL_TO_MISSION_HANDOFF_V0.md`](../docs/architecture/workspace/MAIL_TO_MISSION_HANDOFF_V0.md) 에서 잠근다.

## v0 최소 모델

- `guild_master`
  - user 의 기본 intake 창구
  - normalized mail event 를 받아 intake / assignment / review 흐름으로 연결한다
- `workspace intake inbox`
  - project assignment 전의 staging surface
  - v0 에서는 `guild_hall/state/gateway/intake_inbox/` 로 고정한다
- `monster candidate`
  - mail intake 로부터 파생된 bounded work item
- `project dungeon`
  - workspace intake inbox 의 monster 가 나중에 배치될 실제 project surface
- `stage`
  - 해당 project 안에서 현재 처리 중인 마일스톤 또는 작업 구간
- `battle`
  - 해당 work item 을 실제로 수행한 한 번의 처리 흐름

## first classification axis

- v0 의 첫 분류축은 `자동화 가능성` 하나로 본다.
- 현재 기본 해석은 아래 두 단계면 충분하다.
  - `low_intervention_candidate`
    - `guild_master` 또는 현재 party 가 거의 단독 처리할 수 있는 업무
  - `manual_assist_needed`
    - 수동 확인, 수정, 승인 같은 사람이 중간에 들어가야 하는 업무
- tier 이름은 나중에 세계관 언어로 다시 다듬을 수 있지만, v0 에서는 classification behavior 가 더 중요하다.

## current-default loop

1. `mail intake request`
   - 입력원은 `메일만` 연다.
   - 시작 호출은 `mail fetch` 가 아니라 normalized `mail_intake_request` 다.
   - 메일은 "일감이 생겼다" 는 bounded signal 로만 보고, 아직 다른 inbox 나 calendar 를 같이 열지 않는다.

2. `workspace intake inbox`
   - mail 1건은 workspace-level inbox container 1개가 된다.
   - 이 container 는 project/stage 가 아직 안 정해졌어도 만들어질 수 있다.
   - current-default 최소 필드는 [`WORKSPACE_INTAKE_INBOX_V0.md`](../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md) 에서 잠근다.

3. `monster candidate / monster list`
   - 각 mail 은 하나 이상의 `monster candidate` 로 정리될 수 있다.
   - candidate 는 "지금 처리 가능한 bounded work item 인가" 를 먼저 본다.
   - v0 에서는 첫 분류축 `자동화 가능성` 으로만 tier 를 나눈다.
   - candidate 판정 규칙과 판정 이유는 [`MONSTER_CANDIDATE_CONTRACT_V0.md`](../docs/architecture/workspace/MONSTER_CANDIDATE_CONTRACT_V0.md) 와 local candidate note 에 남기고, `battle_log` 에서 owner 로 다루지 않는다.
   - 기존 monster 와 match 되는 mail 은 새 monster 를 만들지 않고 기존 monster 를 갱신한다.
   - 새로 materialize 된 known/unknown monster 만 workspace intake inbox 안에 남긴다.

4. `dungeon / stage assignment`
   - candidate 는 현재 집중 중인 `1개 project dungeon` 아래에 배치한다.
   - 해당 dungeon 안에서 현재 맞는 `stage` 로만 연결한다.
   - 이 단계는 `dungeon_assignment_request` 로 분리하고, project/state resolve 규칙을 여기서 적용한다.
   - project 쪽 monster record 가 materialize 되면 같은 `monster_id` 를 유지한 mirror record 와 `project_monster_ref` 를 남긴다.
   - project 가 불명확하거나 stage 가 아직 잠기지 않았다면, candidate 는 workspace intake inbox 에 남기고 임의 canonical 승격은 하지 않는다.

5. `.mission draft handoff`
   - assignment 가 끝난 monster 만 `.mission/**` 아래 held mission plan 으로 넘어간다.
   - current-default v0 handoff 최소 필드는 [`MAIL_TO_MISSION_HANDOFF_V0.md`](../docs/architecture/workspace/MAIL_TO_MISSION_HANDOFF_V0.md) 최소 필드로 맞춘다.

6. `battle execution`
   - `guild_master` 가 current-default party `guild_master_cell` 과 현재 unit assignment 로 실행 방식을 정한다.
   - v0 는 완전자율보다 "실제로 한 번 끝까지 처리하는 것"을 우선한다.
   - 수동 수행, 반자동 수행, 제한적 자동 수행 모두 허용하되, 사람이 실제로 몇 번 개입했는지를 남긴다.
   - mission 내부 `skill` 또는 `workflow step` 이 끝났다고 해서 바로 mission 이 끝난 것으로 보지 않는다.
   - current-default v0 에서 `mission terminal` 은 `required workflow steps done + mission-level battle_event persisted + no open blocker` 로 본다.
   - mission 전체가 terminal 일 때만 종료 브리지 `mission_close` 가 1번 돈다.

7. `battle_log`
   - 각 battle 의 trace 는 local-only surface 에 남긴다.
   - mission-level terminal battle outcome 이 확인되면 `battle_event` 를 1건 영속화하고 summary trace 를 함께 남긴다.
   - battle log 는 battle provenance 와 battle result 중심으로만 적고, monster candidate 판정 규칙과 intake-side 분류 이유는 별도 candidate note 로 분리한다.
   - 권장 출력:
     - `_workspaces/<project_code>/.project_agent/log/battle_log/<date>.md`
     - `_workspaces/<project_code>/.project_agent/log/battle_log/latest.md`
   - 최소 기록 항목:
     - source mail reference
     - assigned dungeon / stage
     - chosen party / unit
     - intervention count
     - result summary
     - next action note

8. `mission_close`
   - `mission_close` 는 `guild_master lane` 종료 규칙을 자동 집행하는 종료 브리지다.
   - `battle_event` 가 영속화된 뒤에만 호출하고, terminal mission 에 대해 한 번만 돈다.

9. `morning_report`
   - battle_log 와 mission surface 를 읽어 다음 owner-facing briefing 을 준비한다.
   - 권장 출력:
     - `_workspaces/<project_code>/.project_agent/reports/morning_report/<date>.md`
     - `_workspaces/<project_code>/.project_agent/reports/morning_report/latest.md`
   - `morning_report` 는 dogfood 과정에서 "어제 무엇을 처리했고, 어디에 사람이 개입했고, 오늘 무엇을 다시 볼지"를 요약하는 첫 브리핑 surface 다.
   - nightly review 는 raw event 를 새로 만들지 않고, 이 surface 들의 누락과 anomaly 를 검토한다.

## v0 핵심 지표

- 첫 핵심 지표는 `사람 개입 횟수` 다.
- 이 지표는 아래 질문을 가장 빨리 드러낸다.
  - 어떤 monster candidate 는 거의 자동으로 흘러가는가
  - 어떤 candidate 는 아직 사람이 자주 붙어야 하는가
  - 어느 stage 에서 반복 개입이 늘어나는가
- v0 에서는 fancy score 보다 battle 당 intervention count 를 남기는 것이 더 중요하다.

## source of truth

- mission plan / readiness / assignment 상태는 계속 `.mission/**` 를 본다.
- workspace intake inbox 와 intake-side candidate note 는 `guild_hall/state/gateway/intake_inbox/` 아래 staging surface 를 본다.
- local battle trace / logs / reports 는 `_workspaces/<project_code>/.project_agent/**` 를 본다.
- project 쪽 monster surface 는 `_workspaces/<project_code>/.project_agent/**` 에 남기고, `captured` 이후에도 삭제하지 않는다.
- 외부 보드, inbox mirror, helper dashboard 는 있더라도 보조 surface 로만 다룬다.
- canonical 판단이나 사후 분석은 위 두 source 에서만 시작한다.

## v0 에서 하지 않는 것

- 복잡한 승격 공식
- 화려한 UI
- 완전자율 auto-run 기본값
- 정교한 종족 / 영웅 / 직업 밸런싱
- 파티 효율 공식화
- 정식 level 계산식
- 복수 project 동시 운영
- 복수 입력원 동시 intake
- 외부 보조 surface 를 source of truth 로 승격

## dogfood 후 다음 순서

- 먼저 이 루프를 실제 업무에 한 번 이상 써본다.
- 그다음 아래 순서로 다듬는다.
  1. `VISION_AND_GOALS.md` 에 현재 쓰는 감각과 목표를 보강
  2. 세계관/표시 언어를 `AGENT_WORLD_MODEL` 계열에 보강
  3. 플레이어/운영자 관점 manual 초안 작성
  4. 그 뒤에 `nightly_sweep`, 승격 규칙, level 모델을 강화

## ASSUMPTIONS

- v0 의 가장 중요한 성공 조건은 "하루 업무를 한 번 끝까지 굴릴 수 있느냐" 이며, full automation 여부가 아니다.
- 첫 입력원은 `메일만` 열어도 playable alpha 를 판단하기에 충분하다고 본다.
- monster tier 이름 자체보다 `자동화 가능성` 에 따른 행동 차이가 현재 phase 에 더 중요하다고 본다.
