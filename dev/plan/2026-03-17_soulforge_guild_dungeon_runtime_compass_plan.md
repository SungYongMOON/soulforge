# 2026-03-17 Soulforge guild / dungeon runtime compass plan

## 목적

- 이 문서는 사용자가 실제로 만들고 싶은 Soulforge 방향을 잊지 않기 위한 방향 나침반 초안이다.
- 현재 vNext 6축 정본을 깨지 않고, 기존 폴더명을 최대한 유지한 채 게임형 판타지 세계관과 실제 운영 구조를 연결한다.
- 이 문서는 frozen canon 이 아니라 draft compass 다. 이후 정본으로 올릴 항목과 아직 draft 로 남겨야 할 항목을 분리해서 본다.

## 상태

- `Draft`
- 현재 목표는 “지금 당장 구현”보다 “방향을 하나도 빠뜨리지 않고 기록”하는 것이다.
- 기존 폴더명은 최대한 유지한다.

## 한 줄 요약

Soulforge 는 여러 종족과 영웅, 직업, 파티, 워크플로우, appserver, 던전, 몬스터, 보고, 힐링 루프가 함께 돌아가는 판타지형 multi-agent 운영 체계가 되어야 한다.

## 이번 문서에 반드시 기록할 항목

아래 항목은 모두 future Soulforge 방향의 핵심 요구로 기록한다.

- 여러 종족과 영웅을 만든다.
- 여러 직업과 capability package 를 만든다.
- 여러 workflow 를 만든다.
- 여러 party 와 guild-style 운영 조합을 만든다.
- party 별로 appserver 를 따로 운영할 수 있어야 한다.
- workspace 는 던전 개념으로 해석할 수 있어야 한다.
- 실제 던전 roadmap 을 UI 로 볼 수 있어야 한다.
- 종족창, 영웅창, 직업창, party 창, 던전창, 진행상황창이 필요하다.
- 메일함에서 메일을 수신하면 분석해서 몬스터 spawn 으로 던전에 배치할 수 있어야 한다.
- 업무 수준, 난이도, 위험도에 따라 몬스터 종류와 위협도를 달리 반영해야 한다.
- workflow 에 따라 실제 전투가 돌아가야 한다.
- 피드백 수치가 낮은 몬스터는 인간 개입 없이 스스로 처리하게 할 수 있어야 한다.
- 레벨 시스템과 숙련도 시스템이 필요하다.
- 어떤 몬스터는 잘 잡고 어떤 몬스터는 못 잡는지 기록해야 한다.
- 몬스터를 몇 마리 잡았는지, 얼마나 오래 걸렸는지 backlog 로 남겨야 한다.
- 어떤 피드백이 반복되는지 로그로 남겨 workflow 를 개선할 수 있어야 한다.
- 새벽에는 self-healing / self-maintenance 루프가 반복되어야 한다.
- 그날 전투 결과를 보고서로 보내야 한다.
- 몬스터가 respawn 되면 보고할 수 있어야 한다.
- 아이디어와 세계관 영감은 프로젝트 안에 계속 적어 둘 수 있어야 한다.

## 현재 Soulforge 와의 연결 원칙

### 1. 기존 폴더명은 유지한다

- `.agent`
- `.unit`
- `.agent_class`
- `.workflow`
- `.party`
- `_workspaces`

지금 단계에서는 `.guild`, `.dungeon`, `.monster` 같은 새 top-level root 를 추가하지 않는다.
이 개념들은 우선 기존 root 위에 얹는 세계관 / 운영 개념으로 해석한다.

### 2. 정본과 실운영 truth 를 분리한다

- public repo 정본은 catalog, template, canon, curated summary 만 가진다.
- 실제 전투, spawn, battle log, analytics, reports, healing run, artifact 는 local-only `_workspaces/<project_code>/` 아래에 둔다.

### 3. 판타지 용어는 유지하되 owner 를 먼저 고정한다

- 용어가 화려해져도 “누가 owner 인가”가 먼저다.
- 세계관은 UI / UX / naming 에 적극적으로 쓰되, 파일시스템 owner 경계를 흐리지 않는다.

## 세계관 개념과 현재 폴더 매핑

| 세계관 개념 | 현재 Soulforge 경로 | 의미 |
| --- | --- | --- |
| 종족 도감 | `.agent/` | species / hero catalog |
| 영웅 도감 | `.agent/species/<species>/heroes/` | species 위의 hero overlay 모음 |
| 활성 유닛 | `.unit/<unit_id>/` | 실제 active owner surface |
| 직업 / 클래스 사전 | `.agent_class/<class_id>/` | reusable class / package catalog |
| 공략서 / 전술서 | `.workflow/<workflow_id>/` | workflow canon |
| 파티 전형 | `.party/<party_id>/` | reusable party template |
| 길드 운영 개념 | `.unit` + `.party` + `.workflow` + appserver binding 의 조합 | logical meta-layer, 아직 별도 root 아님 |
| 던전 | `_workspaces/<project_code>/` | 실제 프로젝트 / mission site |
| 몬스터 | workspace 안에서 처리할 일 / 이벤트 / 문제 | local-only runtime entity |
| 전투 로그 | `_workspaces/<project_code>/.project_agent/runs/` | raw execution truth |
| 던전 로드맵 | `_workspaces/<project_code>/.project_agent/dungeons/` | dungeon board / roadmap / spawn state |
| 치유 루프 | `_workspaces/<project_code>/.project_agent/nightly_healing/` | nightly maintenance |
| 전투 리포트 | `_workspaces/<project_code>/.project_agent/reports/` | battle / status reports |
| 성과 분석 | `_workspaces/<project_code>/.project_agent/analytics/` | backlog / metrics / recurrence |

## 실질적 Soulforge 방향 재점검

현재 Soulforge 는 “문서형 구조 저장소”에서 멈추면 안 된다.
장기적으로는 아래 세 층이 모두 필요하다.

### A. canon layer

- 종족 / 영웅 / 클래스 / workflow / party 의 reusable canon
- public repo 중심
- 사람이 설계하고 정리하는 계층

### B. active owner layer

- 실제 현재 어떤 유닛이 어떤 class, workflow, party 를 사용 중인지
- `.unit/` 중심
- “누가 싸우는가”를 고정하는 계층

### C. dungeon runtime layer

- 실제 프로젝트 현장에서 어떤 몬스터가 spawn 되었고, 어떤 파티가 어떤 workflow 로 대응했고, 어떤 결과가 났는지
- `_workspaces/<project_code>/.project_agent/` 중심
- local-only runtime truth 계층

## multi-agent 구조 초안

### 1. species / hero

- 여러 species 를 `.agent/species/` 아래에 둔다.
- 각 species 는 여러 hero overlay 를 가진다.
- hero 는 개성과 bias 를 주지만 owner 경계는 `.agent` 안에 머문다.

### 2. units

- 여러 active unit 을 `.unit/<unit_id>/` 로 둘 수 있다.
- unit 은 실제 현장 투입 주체다.
- unit 은 species, hero, class, workflow, party binding 을 가진다.

### 3. classes

- `.agent_class/` 는 capability package catalog 다.
- class 는 스킬 / 도구 / 지식 패키지와 profile / manifest 를 가진다.
- 전투력, 대응력, 전문성의 base kit 역할을 한다.

### 4. workflows

- `.workflow/` 는 공략서다.
- workflow 는 몬스터 분류, 전투 순서, handoff, escalation, auto-resolve rule 의 base 를 가진다.
- 향후 몬스터 처리 rule 과 inbox triage rule 을 `.workflow/*/monster_rules.yaml` 에 적극적으로 넣을 수 있다.

### 5. parties

- `.party/` 는 reusable party template 다.
- party 는 member slot, allowed species/class/workflow, appserver profile 을 가진다.
- 실제 프로젝트에서 어느 파티를 어떤 dungeon 에 투입할지는 `_workspaces/<project_code>` binding 으로 결정한다.

### 6. appserver

- party 별 appserver 운영은 `.party/<party_id>/appserver_profile.yaml` 에 base profile 을 둔다.
- 실제 project-level appserver binding 과 runtime endpoint 는 local-only `_workspaces/<project_code>/.project_agent/` 아래에서 관리한다.

## 던전 운영 모델 초안

### dungeon = workspace

- `_workspaces/<project_code>/` 를 단순 프로젝트 폴더가 아니라 dungeon site 로 해석한다.
- dungeon 은 실제 업무 현장이다.
- 같은 project 안에 여러 dungeon lane / scenario / board 를 둘 수 있다.

### 몬스터 = 처리할 일 / 위협 / 이벤트

아래는 몬스터로 해석할 수 있다.

- 메일에서 들어온 업무 요청
- 반복되는 피드백
- 장애 / 버그 / 분석 요청
- 긴급도 높은 운영 이슈
- 아직 정리되지 않은 backlog

### spawn model

- 외부 메일함 / 입력 채널에서 이벤트를 받는다.
- classifier 가 이벤트를 분석한다.
- 업무 수준, 위험도, urgency, 반복성, 난이도, owner 불명확성 등을 기준으로 monster type 을 붙인다.
- dungeon board 에 spawn 된다.

### battle model

- 어떤 party 가
- 어떤 workflow 로
- 어떤 unit / appserver 조합을 써서
- 어떤 몬스터를
- 어느 정도 autonomy 로 처리할지를 결정한다.

### autonomy model

- feedback 수치가 낮고 위험도가 낮은 몬스터는 auto-resolve 가능
- 위험도가 높거나 반복 실패한 몬스터는 escalation
- owner confirmation 이 필요한 몬스터는 manual intervention

이 rule 은 장기적으로 `.workflow/monster_rules.yaml`, `.unit/autonomic/`, `_workspaces/<project_code>/.project_agent/dungeons/` 의 조합으로 구현할 수 있다.

## local-only `_workspaces/<project_code>` 방향 초안

아래는 기존 folder naming 을 최대한 유지하면서도 하고 싶은 일을 담는 초안이다.

```text
_workspaces/
└── <project_code>/
    ├── ... actual project files ...
    └── .project_agent/
        ├── contract.yaml
        ├── bindings/
        │   ├── party_binding.yaml
        │   ├── workflow_binding.yaml
        │   ├── appserver_binding.yaml
        │   └── mailbox_binding.yaml
        ├── dungeons/
        │   └── <dungeon_id>/
        │       ├── roadmap.yaml
        │       ├── spawn_board.yaml
        │       ├── monster_queue.yaml
        │       ├── progress.yaml
        │       └── alerts.yaml
        ├── runs/
        │   └── <run_id>/
        │       ├── battle.yaml
        │       ├── result.yaml
        │       ├── feedback.yaml
        │       └── timing.yaml
        ├── analytics/
        │   ├── kill_stats.yaml
        │   ├── failure_patterns.yaml
        │   ├── feedback_recurrence.yaml
        │   ├── monster_difficulty_profile.yaml
        │   └── level_progress.yaml
        ├── nightly_healing/
        │   ├── healing_policy.yaml
        │   └── healing_log/
        ├── reports/
        │   ├── daily_battle_report.md
        │   ├── spawn_report.md
        │   └── escalation_report.md
        └── artifacts/
```

## 각 아이디어를 현재 구조에 어디에 둘지

### 1. 종족 / 영웅 / 직업 / workflow / party

- `.agent/`
- `.agent_class/`
- `.workflow/`
- `.party/`

### 2. 실제 active 캐릭터 / 멀티에이전트 roster

- `.unit/`

### 3. 던전 진행 상황

- `_workspaces/<project_code>/.project_agent/dungeons/<dungeon_id>/progress.yaml`

### 4. 몬스터 spawn

- `_workspaces/<project_code>/.project_agent/dungeons/<dungeon_id>/monster_queue.yaml`
- `_workspaces/<project_code>/.project_agent/dungeons/<dungeon_id>/spawn_board.yaml`

### 5. 메일함 기반 분석

- 외부 mail intake 는 runtime integration 이고
- 결과 spawn record 는 `_workspaces/<project_code>/.project_agent/dungeons/` 아래로 귀속

### 6. 피드백 수 기준 auto-resolve

- `.workflow/<workflow_id>/monster_rules.yaml`
- `.unit/<unit_id>/autonomic/`
- project-local outcome 는 `_workspaces/<project_code>/.project_agent/runs/`

### 7. 레벨 시스템

- actual level / xp / 성장 이력은 local-only `_workspaces/<project_code>/.project_agent/analytics/level_progress.yaml`
- template-level progression idea 는 `.party/stats/` 또는 docs summary 로만 일부 반영 가능

### 8. 무엇을 잘 잡고 무엇을 못 잡는가

- `_workspaces/<project_code>/.project_agent/analytics/kill_stats.yaml`
- `_workspaces/<project_code>/.project_agent/analytics/failure_patterns.yaml`

### 9. 몇 마리 잡았고 얼마나 걸렸는가

- `_workspaces/<project_code>/.project_agent/runs/<run_id>/timing.yaml`
- `_workspaces/<project_code>/.project_agent/analytics/kill_stats.yaml`

### 10. 반복 피드백과 workflow 개선

- raw recurrence = `_workspaces/<project_code>/.project_agent/analytics/feedback_recurrence.yaml`
- curated canon improvement = `.workflow/<workflow_id>/history/`

### 11. nightly healing

- `_workspaces/<project_code>/.project_agent/nightly_healing/`

### 12. 전투 결과 보고 / respawn 보고

- `_workspaces/<project_code>/.project_agent/reports/`

## UI 초안

장기적으로 아래 화면이 필요하다.

### core roster UI

- species 도감
- hero 도감
- active unit 창
- class / 직업 창
- workflow 공략서 창
- party 창

### dungeon UI

- dungeon roadmap
- dungeon board
- monster queue
- battle progress
- escalation lane
- spawn report panel

### operations UI

- mailbox intake / spawn monitor
- daily report center
- healing dashboard
- analytics / backlog panel
- monster difficulty / level / kill ratio panel

## 길드 개념 초안

길드는 지금 당장 새 top-level root 로 만들 필요는 없다.
현재는 아래를 묶는 logical meta-layer 로 해석하는 편이 안전하다.

- `.unit` = 길드 소속 실제 멤버
- `.party` = 파티 편성 템플릿
- `.workflow` = 공략서
- `appserver_binding` = 파티가 쓸 실제 장비 / 서버
- `_workspaces/<project_code>` = 던전

즉 길드는 우선 “UI / 운영 개념”으로 두고, 정말 별도 owner 가 필요해질 때만 새 root 를 검토한다.

## 무엇을 지금 정본으로 올리지 말아야 하는가

아래는 아직 draft 로 남기는 게 맞다.

- `.guild/` 같은 새 top-level root
- monster 세부 taxonomy 의 확정 스키마
- mail ingestion 구현 상세
- appserver orchestration 구현 상세
- level 공식
- exact battle log schema
- exact report delivery transport

이것들은 먼저 방향을 문서로 붙잡고, 실제 정본 root 를 늘리는 건 그 다음이다.

## 무엇을 다음 차수에서 frozen decisions 후보로 올릴 수 있는가

아래는 정본 후보로 올리기 좋은 항목이다.

1. dungeon = `_workspaces/<project_code>/`
2. monster runtime truth = `_workspaces/<project_code>/.project_agent/dungeons/`
3. run truth = `_workspaces/<project_code>/.project_agent/runs/`
4. analytics / nightly_healing / reports owner = `_workspaces/<project_code>/.project_agent/`
5. party-level appserver base profile = `.party/<party_id>/appserver_profile.yaml`
6. workflow-level monster policy = `.workflow/<workflow_id>/monster_rules.yaml`

## 구현 우선순위 초안

### Phase A. 방향 고정

- 이 문서를 유지한다.
- 세계관 용어와 실제 경로 매핑을 더 다듬는다.
- guild 를 새 root 로 만들지 말지 보류한다.

### Phase B. local runtime draft

- `_workspaces/<project_code>/.project_agent/dungeons/` 초안 스키마를 만든다.
- `party_binding.yaml`, `workflow_binding.yaml`, `appserver_binding.yaml` draft 를 만든다.
- monster queue / roadmap / progress 초안을 만든다.

### Phase C. UI draft

- unit / class / party / workflow / dungeon board 를 보는 UI draft
- roadmap view
- spawn / report panel

### Phase D. automation

- mailbox intake -> monster spawn
- feedback recurrence -> workflow improvement hint
- nightly healing
- daily battle report

## 지금 이 문서가 하는 역할

- 방향 나침반
- 아이디어 누락 방지 기록
- future frozen decision 후보 목록
- 새 채팅에서 구조 감리를 받을 때 넘길 개념 문서

## ASSUMPTIONS

- 기존 top-level 폴더명은 현재 vNext 6축(`.agent`, `.unit`, `.agent_class`, `.workflow`, `.party`, `_workspaces`)을 유지하는 것이 우선이라고 본다.
- `guild` 는 지금 당장 새 root 로 만들기보다 logical layer 로 두는 편이 구조 리스크가 낮다고 본다.
- actual mail integration, report delivery, monster taxonomy 는 현재 단계에서 canon 이 아니라 runtime draft 로 취급한다.
