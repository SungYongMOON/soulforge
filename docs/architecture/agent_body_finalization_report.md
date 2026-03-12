
# Soulforge `.agent` 구조 확정 보고서 v1

저장 경로: `docs/architecture/agent_body_finalization_report.md`

이 문서는 설계 결정 보고서다. 실제 반영 상태의 우선 정본은 `docs/architecture/TARGET_TREE.md`, `.agent/body.yaml`, 각 폴더 `README.md` 를 따른다.

## 문서 목적

이 문서는 Soulforge에서 현재 만들고 있는 **하나의 durable agent unit**의 개념을 고정하기 위한 설계 정본이다.

이 문서는 아래를 확정한다.

- `.agent`가 무엇인지
- `.agent_class`, `_workspaces`, 미래 `_teams`와 어떤 관계인지
- `.agent` 내부 폴더를 왜 두는지
- 어떤 폴더를 유지/추가/삭제/개명할지
- 나중에 팀 에이전트로 확장할 때 무엇을 `.agent` 안에 두고, 무엇을 바깥으로 뺄지
- 코덱스에게 단계별로 무엇을 시킬지

---

## 1. 최종 세계관 해석

Soulforge의 기본 단위는 “지속적으로 살아 있는 한 명의 에이전트 유닛”이다.

이 유닛은 아래 네 층으로 해석한다.

```text
Self      = .agent
Loadout   = .agent_class
Mission   = _workspaces
Party     = _teams        (미래 확장)
```

### 1.1 Self = `.agent`
`.agent`는 한 명의 durable agent unit을 이루는 **private operating system**이다.

여기에는 아래가 들어간다.

- 이 유닛이 누구인지
- 어떤 기본 제약을 따르는지
- 무엇을 오래 기억하는지
- 현재 무엇을 이어서 하고 있는지
- 어떤 방식으로 조용히 자기 점검을 하는지
- 어떤 reusable output을 보유하는지

### 1.2 Loadout = `.agent_class`
`.agent_class`는 그 유닛의 **직업/로드아웃**이다.

여기에는 아래가 들어간다.

- skills
- tools
- knowledge
- workflows

즉 `.agent`가 “몸과 운영기관”이라면, `.agent_class`는 “장착한 역할 세트”다.

### 1.3 Mission = `_workspaces`
`_workspaces`는 유닛이 실제로 일하는 **현장**이다.

여기에는 아래가 들어간다.

- 프로젝트 실자료
- 실제 작업 대상
- 과업 문맥
- 프로젝트별 산출물
- 현장 메모

### 1.4 Party = `_teams` (미래)
`_teams`는 여러 durable agent unit이 함께 일하는 **팀 계층**이다.

여기에는 아래가 들어간다.

- 팀 roster
- shared facts
- shared decisions
- handoffs
- mission coordination

---

## 2. OpenClaw에서 가져올 것과 버릴 것

### 2.1 가져올 것

OpenClaw는 “한 agent”를 **자기만의 workspace, state directory(`agentDir`), session store를 가진 fully scoped brain**으로 설명한다. 또한 OpenClaw는 매 실행마다 system prompt를 다시 조립하고, 기본적으로 `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md` 같은 workspace bootstrap 파일을 Project Context로 주입한다. 그리고 `sessions_spawn`으로 isolated session의 sub-agent run을 만들 수 있으며, FAQ에서는 multi-agent 팀 구성이 가능하지만 token heavy하고 보통은 one bot + separate sessions가 더 효율적일 수 있다고 설명한다. agent별 sandbox/tool policy도 지원한다.  
이 해석에서 Soulforge가 가져올 핵심은 아래 다섯 가지다.

- durable agent 단위
- agent마다 분리된 private workspace / memory / session 관점
- 실행 시 context assembly 개념
- agent별 tool / sandbox / policy 분리 가능성
- 필요할 때만 delegated worker를 쓰는 관점

### 2.2 버릴 것

Soulforge는 지금 “문서와 메타가 먼저인 저장소”이므로 아래는 그대로 들여오지 않는다.

- gateway / multi-channel 계정 운영 구조
- channel binding / account routing 복잡도
- heavy transcript 중심 session 관리
- sub-agent 중심의 자유 대화 모델
- export / delivery를 body의 핵심 기관으로 보는 방식

### 2.3 Soulforge가 OpenClaw보다 더 잘해야 하는 지점

Soulforge는 아래의 더 정교한 분해를 목표로 한다.

```text
body(.agent) + class(.agent_class) + mission(_workspaces) + party(_teams)
```

그리고 agent 간 협업도 “자유 대화”보다 아래를 먼저 구조화한다.

- request contract
- handoff contract
- decision contract
- escalation contract
- incident contract

즉 Soulforge의 차별점은 **팀 협업을 프로토콜과 산출물 중심으로 구조화**한다는 데 있다.

---

## 3. 최종 설계 원칙

### 3.1 최상위 원칙
- `.agent`는 현재 한 명의 durable agent unit이다.
- `.agent_class`는 그 unit의 loadout이다.
- `_workspaces`는 그 unit이 일하는 mission site다.
- 미래 팀 협업은 `.agent` 안이 아니라 `_teams/shared` 계층으로 확장한다.
- `.agent/memory`는 현재 body의 **private 중심 memory**다.
- shared team memory는 `.agent` 안에 두지 않는다.
- sessions는 transcript 저장소가 아니라 **작업 연속성 저장소**다.
- autonomic은 daemon이 아니라 **저소음 품질 보정 루틴**이다.
- species는 현재 identity의 durable default만 담당한다.
- species는 폴더 구조 자체를 바꾸지 않고, 각 기관의 우선순위/표현/개입 강도만 바꾼다.
- policy는 species보다 위에 있는 species-free floor다.
- registry는 정본 자산 저장소가 아니라 binding/index/reference 계층이다.

### 3.2 현재는 `species only`
현재 단계에서는 `hero`를 identity 정본으로 두지 않는다.

대신 이렇게 간다.

```text
identity = species only
behavior = registry bindings + operating_profiles
class = loadout
```

필요하면 나중에 `hero` 대신 `operating profile` 또는 `stance profile`을 도입한다.

---

## 4. 유지 / 추가 / 삭제 / 개명 결정

## 4.1 유지
- `identity/`
- `registry/`
- `policy/`
- `communication/`
- `memory/`
- `sessions/`
- `autonomic/`
- `artifacts/`

## 4.2 신규 추가
- `protocols/`

## 4.3 경로 확정
- 기존 `engine/` 개념은 `runtime/` 경로로 확정한다.

> 현재 저장소 정본은 `runtime/` 경로를 사용한다.

## 4.4 삭제 반영
- `export/` 는 body 기관에서 제거한다.

삭제 이유:
- body의 핵심 기관이 아니다
- `artifacts`의 하위 concern이거나 루트 툴체인 concern에 가깝다
- 현재 단계에서 설계를 흐리는 잡음이 될 가능성이 높다

대안:
- 당장은 삭제
- 필요 시 `artifacts/export_profiles/`로 흡수
- 더 커지면 루트 export toolchain으로 분리

---

## 5. 최종 `.agent` target tree

```text
.agent/
├── README.md
├── body.yaml
├── body_state.yaml
│
├── docs/
│   └── architecture/
│       ├── AGENT_BODY_MODEL.md
│       ├── BODY_METADATA_CONTRACT.md
│       ├── RUNTIME_MODEL.md
│       ├── MEMORY_MODEL.md
│       ├── TEAM_EXPANSION_MODEL.md
│       └── COORDINATION_PROTOCOLS.md
│
├── identity/
│   ├── README.md
│   ├── species_profile.yaml
│   └── identity_manifest.yaml
│
├── registry/
│   ├── README.md
│   ├── active_class_binding.yaml
│   ├── workspace_binding.yaml
│   ├── capability_index.yaml
│   └── trait_bindings.yaml
│
├── policy/
│   ├── README.md
│   ├── precedence.yaml
│   ├── safety_rules.md
│   ├── approval_matrix.yaml
│   └── scope_rules.yaml
│
├── communication/
│   ├── README.md
│   ├── human_channel_profile.yaml
│   ├── peer_channel_profile.yaml
│   └── response_contract.md
│
├── protocols/
│   ├── README.md
│   ├── request_contract.yaml
│   ├── handoff_contract.yaml
│   ├── decision_contract.yaml
│   ├── incident_contract.yaml
│   └── escalation_contract.yaml
│
├── runtime/
│   ├── README.md
│   ├── bootstrap_order.md
│   ├── context_assembly.yaml
│   ├── tool_scope.yaml
│   ├── sandbox_profile.yaml
│   └── delivery_profile.yaml
│
├── memory/
│   ├── README.md
│   ├── self/
│   │   └── README.md
│   ├── project/
│   │   └── README.md
│   ├── decisions/
│   │   └── README.md
│   └── handoffs/
│       └── README.md
│
├── sessions/
│   ├── README.md
│   ├── checkpoints/
│   │   └── README.md
│   ├── checkpoint_template.yaml
│   └── active_session.example.yaml
│
├── autonomic/
│   ├── README.md
│   ├── checks/
│   │   └── README.md
│   ├── reminders/
│   │   └── README.md
│   └── rules/
│       └── README.md
│
└── artifacts/
    ├── README.md
    ├── templates/
    ├── playbooks/
    ├── rubrics/
    └── reports/
```

---

## 6. 폴더별 헌장

## 6.1 `identity/`
한 줄 정의: **이 agent가 누구인지**를 담는 정본.

### 포함 대상
- body의 id / name / version
- species profile
- durable default traits
- identity synopsis / notes

### 제외 대상
- 현재 프로젝트 상태
- binding 표
- policy 원문
- sessions 상태
- memory 내용
- tool 목록 전체

### 대표 파일
- `species_profile.yaml`
- `identity_manifest.yaml`

### 예시
```yaml
species_id: human_crafter
display_name: Human Crafter
synopsis: 구조를 먼저 세우고 안정적인 결과물을 선호하는 기본 본체
default_traits:
  decision_tempo: moderate
  risk_posture: cautious
  memory_bias: decisions_first
  communication_tone: direct_clear
  autonomy_noise: low
  artifact_style: structured
notes:
  - species는 policy를 우회하지 않는다
  - species는 기관 구조를 바꾸지 않는다
```

---

## 6.2 `registry/`
한 줄 정의: **무엇이 어디에 있고 어떻게 연결되는지**를 담는 binding/index/reference 계층.

### 포함 대상
- active class 참조
- active workspace 참조
- capability index
- trait → subsystem binding
- section index

### 제외 대상
- identity 원본
- policy 원문
- 실제 memory 데이터
- 세션 본문
- 산출물 원문

### 대표 파일
- `active_class_binding.yaml`
- `workspace_binding.yaml`
- `capability_index.yaml`
- `trait_bindings.yaml`

### 예시
```yaml
communication:
  tone_profile: from.communication_tone
  question_budget_style: from.risk_posture

sessions:
  checkpoint_style: from.decision_tempo

memory:
  recall_priority: from.memory_bias

autonomic:
  reminder_noise: from.autonomy_noise

artifacts:
  render_profile: from.artifact_style
```

### 핵심 경고
registry는 **정본 저장소가 아니다**.  
정본을 가리키는 등록/색인/참조/바인딩만 둔다.

---

## 6.3 `policy/`
한 줄 정의: **이 agent가 넘으면 안 되는 경계**를 담는 상위 제약 계층.

### 포함 대상
- safety rules
- approval matrix
- precedence
- scope restrictions
- forbidden / caution rules

### 제외 대상
- 말투
- 요약 형식
- 세션 체크포인트
- 실제 memory 내용
- species 설명

### 대표 파일
- `precedence.yaml`
- `approval_matrix.yaml`
- `scope_rules.yaml`
- `safety_rules.md`

### 예시
```yaml
precedence:
  - repository_rules
  - local_execution_constraints
  - current_task_goal
  - identity_traits

approval_required:
  - destructive_repo_changes
  - external_side_effects

forbidden:
  - fabricate_runtime_state
  - bypass_safety_floor
```

### 핵심 원칙
policy는 **species-free floor**다.  
species는 policy를 낮추지 못한다.

---

## 6.4 `communication/`
한 줄 정의: **사람과 바깥 채널에 어떻게 말할지**를 담는 표현 계층.

### 포함 대상
- 응답 구조
- 질문 예산
- 상태 업데이트 규칙
- human-facing tone
- peer-facing tone

### 제외 대상
- 정책 금지 규칙
- 팀 handoff schema
- 세션 상태 데이터
- runtime 실행 순서

### 대표 파일
- `human_channel_profile.yaml`
- `peer_channel_profile.yaml`
- `response_contract.md`

### 예시
```yaml
response_shape:
  - summary
  - steps
  - options
  - caveats
  - q1_q3

question_budget:
  default: 2
  prefer_assumption_when_possible: true

status_updates:
  cadence: concise
  when: long_tasks_only
```

---

## 6.5 `protocols/`  **(신규)**
한 줄 정의: **다른 agent 또는 팀 계층과 협업할 때 쓰는 구조화된 교신 규약**.

### 왜 필요한가
이 폴더가 Soulforge의 핵심 엣지다.

OpenClaw의 agent-to-agent/session tools 개념은 참고하되, Soulforge는 “자유 대화”보다 아래를 먼저 정형화한다.

- request
- handoff
- decision
- escalation
- incident

### 포함 대상
- 작업 요청 형식
- 결과 전달 형식
- 결정 기록 형식
- blocker 보고 형식
- escalation 형식
- incident 형식

### 제외 대상
- 사람과의 일반 대화 규칙
- 세션 상태
- 장기 기억 내용
- 정책 원문

### 대표 파일
- `request_contract.yaml`
- `handoff_contract.yaml`
- `decision_contract.yaml`
- `incident_contract.yaml`
- `escalation_contract.yaml`

### 예시
```yaml
request_contract:
  required:
    - request_id
    - requester
    - mission
    - scope
    - expected_output
    - deadline
    - escalation_rule

handoff_contract:
  required:
    - handoff_id
    - source_agent
    - target_agent
    - summary
    - decisions
    - open_risks
    - next_action
```

---

## 6.6 `runtime/`  **(현재 body 실행 경로)**
한 줄 정의: **이 agent가 자기 기관들을 어떤 순서로 읽고 조립해 실행하는지**를 담는 기관실.

### 포함 대상
- bootstrap order
- context assembly
- tool scope
- sandbox profile
- delivery profile
- runtime contract

### 제외 대상
- species 원본
- memory 본문
- 세션 체크포인트 본문
- 산출물 원문

### 대표 파일
- `bootstrap_order.md`
- `context_assembly.yaml`
- `tool_scope.yaml`
- `sandbox_profile.yaml`
- `delivery_profile.yaml`

### 예시
```yaml
load_order:
  - policy
  - identity
  - registry
  - communication
  - sessions
  - memory
  - artifacts
  - autonomic

execution_phases:
  - resolve_context
  - apply_constraints
  - consult_continuity
  - render_output
  - run_post_checks
```

### 핵심 원칙
runtime은 species에 의해 교체되지 않는다.  
species는 runtime이 참조하는 기본값만 제공한다.

---

## 6.7 `memory/`
한 줄 정의: **이 agent의 private 장기 기억**.

### 포함 대상
- self facts
- project facts (distilled)
- decisions
- future handoffs
- retention / recall 관련 메타

### 제외 대상
- transcript 전체
- 임시 scratch
- 현재 task의 짧은 중간상태
- raw project source

### 하위 구조
- `self/` = 이 body 자신의 안정적 기억
- `project/` = 프로젝트의 공통 사실과 맥락
- `decisions/` = 확정된 판단과 합의
- `handoffs/` = 미래 multi-agent 전달문 예약 구조

### 예시
```yaml
memory_profile:
  scope: private_first
  zones:
    - self
    - project
    - decisions
    - handoffs
  recall_priority: decisions_first
```

### 핵심 원칙
`memory/`는 private 중심이고, future shared board는 `.agent` 밖으로 뺀다.

---

## 6.8 `sessions/`
한 줄 정의: **현재 작업의 연속성을 잇는 체크포인트 저장소**.

### 포함 대상
- 현재 task id
- 현재 목표
- 마지막 결정
- 다음 액션
- 열린 리스크
- checkpoint template

### 제외 대상
- transcript 전체
- 장기 기억
- policy 원문
- artifact 원문

### 대표 파일
- `checkpoint_template.yaml`
- `active_session.example.yaml`

### 예시
```yaml
task_id: body-finalization
goal: .agent 구조를 durable unit 기준으로 확정
last_decision: export 제거와 runtime 경로 확정을 반영했다
next_action: body 메타와 subdirectory README 정합성을 검증한다
open_risks:
  - protocols 범위를 너무 크게 잡지 않도록 주의
```

### 핵심 원칙
sessions는 **transcript 저장소가 아니라 continuity 저장소**다.

---

## 6.9 `autonomic/`
한 줄 정의: **조용한 자기 점검과 품질 보정 루틴**.

### 포함 대상
- preflight check
- verify reminder
- stale checkpoint 감지
- docs / README / worklog sync reminder
- drift 감지
- unresolved handoff 감지

### 제외 대상
- daemon
- worker queue
- heartbeat service
- polling runtime
- transcript 저장

### 하위 구조
- `checks/`
- `reminders/`
- `rules/`

### 예시
```yaml
autonomic_profile:
  style: low_noise
  checks:
    - preflight
    - consistency
    - stale_checkpoint
    - docs_sync
  reminder_noise: low
  drift_sensitivity: medium
```

### 핵심 원칙
autonomic은 운영 데몬이 아니라 **저소음 품질 보정**이다.

---

## 6.10 `artifacts/`
한 줄 정의: **이 agent가 재사용 가능한 공용 산출물로 보관하는 서가**.

### 포함 대상
- templates
- playbooks
- rubrics
- reusable reports
- body-level reusable outputs

### 제외 대상
- 특정 workspace의 현장 납품물
- 임시 scratch
- export packaging 규칙
- policy 문서

### 하위 구조
- `templates/`
- `playbooks/`
- `rubrics/`
- `reports/`

### 핵심 원칙
재사용 가치가 **body 자체에 귀속**되면 `artifacts/`다.  
특정 mission 결과물이면 workspace로 간다.

---

## 7. 루트 메타 파일

## 7.1 `body.yaml`
목적: `.agent` 전체의 정적 메타 지도

### 최소 필드
```yaml
id: soulforge-main-body
name: Soulforge Main Body
version: 0.1.0
description: Durable agent unit for mission-oriented work
operating_context: ide

identity_assets:
  species_profile: .agent/identity/species_profile.yaml
  trait_bindings: .agent/registry/trait_bindings.yaml

operating_profiles:
  sessions: continuity_first
  memory: private_first
  autonomic: low_noise

sections:
  identity:
    path: .agent/identity
  registry:
    path: .agent/registry
  policy:
    path: .agent/policy
  communication:
    path: .agent/communication
  protocols:
    path: .agent/protocols
  runtime:
    path: .agent/runtime
  memory:
    path: .agent/memory
  sessions:
    path: .agent/sessions
  autonomic:
    path: .agent/autonomic
  artifacts:
    path: .agent/artifacts

future_expansion:
  team_ready: true
  shared_memory_inside_body: false
```

## 7.2 `body_state.yaml`
목적: 저장소 추적 가능한 현재 구조 스냅샷

### 최소 필드
```yaml
body_id: soulforge-main-body
operating_context: ide

sections:
  identity:
    path: .agent/identity
    present: true
  registry:
    path: .agent/registry
    present: true
  policy:
    path: .agent/policy
    present: true
  communication:
    path: .agent/communication
    present: true
  protocols:
    path: .agent/protocols
    present: true
  runtime:
    path: .agent/runtime
    present: true
  memory:
    path: .agent/memory
    present: true
  sessions:
    path: .agent/sessions
    present: true
  autonomic:
    path: .agent/autonomic
    present: true
  artifacts:
    path: .agent/artifacts
    present: true

operating_profiles:
  summary:
    sessions: continuity_first
    memory: private_first
    autonomic: low_noise

future_expansion:
  team_ready: true
  shared_memory_inside_body: false

status:
  summary: aligned
  warnings: []
```

---

## 8. `.agent` 밖의 미래 확장 구조

현재는 만들지 않아도 되지만, 문서에는 예약한다.

```text
_teams/
└── raid-alpha/
    ├── team.yaml
    ├── members.yaml
    ├── shared/
    │   ├── facts/
    │   ├── decisions/
    │   └── handoffs/
    └── missions/
        └── mission-001/
            ├── brief.md
            ├── plan.md
            └── status.md
```

### 핵심 원칙
- `.agent/memory` = private
- `_teams/shared` = shared
- 둘을 섞지 않는다

---

## 9. 무엇을 하지 않을 것인가

아래는 현재 단계에서 **명시적으로 하지 않는다**.

- OpenClaw gateway / channel / account routing 구조 복사
- heavy transcript 기반 세션 저장소
- agent 간 자유 채팅 시스템
- daemon / worker / polling / heartbeat service 구현
- export를 body 핵심 기관으로 유지
- species가 policy나 runtime 구조 자체를 바꾸는 설계
- hero motif를 identity 정본으로 먼저 확정하는 설계

---

## 10. 이 설계의 핵심 장점

### 10.1 durable unit 관점이 선명하다
`.agent`는 sub-agent 같은 임시 작업자가 아니라, 나중에 팀에 들어갈 **지속형 유닛 1기**로 정의된다.

### 10.2 body / class / mission / party가 분리된다
- body = `.agent`
- class = `.agent_class`
- mission = `_workspaces`
- party = `_teams`

이 분해 덕분에 같은 species로 다른 class를 입히거나, 같은 class를 다른 mission에 투입하거나, 여러 unit을 팀으로 묶기가 쉬워진다.

### 10.3 협업이 “대화”보다 “프로토콜” 중심이 된다
`protocols/`를 두면 팀 에이전트 설계가 “그냥 서로 대화한다”에서 끝나지 않고,
실제 업무용 협업 절차로 구조화된다.

### 10.4 private와 shared가 나중에 안 꼬인다
지금부터 shared memory를 `.agent` 밖으로 예약하면,
future multi-agent 확장 때 구조를 다시 뒤집을 필요가 크게 줄어든다.

---

## 11. 코덱스 단계별 수정 작업 계획

아래는 실제로 코덱스에게 순서대로 맡길 수 있는 작업 지시서다.

---

## Phase 0. 탐색 및 현황 점검

### 목표
현재 `.agent` 구조와 README, 관련 architecture 문서를 읽고 충돌 지점을 정리한다.

### 작업 범위
- `.agent/README.md`
- `.agent/*/README.md`
- `.agent/docs/architecture/*`
- 루트 `README.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/DOCUMENT_OWNERSHIP.md`

### 산출물
- 현재 구조 요약
- 유지/삭제/추가/개명 후보 목록
- 문서 충돌 메모

### 코덱스 지시문
```text
Soulforge 저장소에서 .agent 구조를 durable agent unit 기준으로 재정의하려고 한다.
먼저 아래 파일을 읽고 현재 구조를 요약하라.

- .agent/README.md
- .agent/*/README.md
- .agent/docs/architecture/*
- README.md
- docs/architecture/TARGET_TREE.md
- docs/architecture/DOCUMENT_OWNERSHIP.md

출력은 다음 형식으로 정리하라.
1) 현재 폴더별 정의 요약
2) 서로 충돌하는 설명
3) 유지/삭제/추가/개명 후보
4) 바로 수정하면 위험한 지점
```

---

## Phase 1. architecture 정본 문서 확정

### 목표
`.agent` 개념을 durable unit 기준으로 문서화한다.

### 생성/수정 대상
- `.agent/docs/architecture/AGENT_BODY_MODEL.md`
- `.agent/docs/architecture/BODY_METADATA_CONTRACT.md`
- `.agent/docs/architecture/RUNTIME_MODEL.md`
- `.agent/docs/architecture/MEMORY_MODEL.md`
- `.agent/docs/architecture/TEAM_EXPANSION_MODEL.md`
- `.agent/docs/architecture/COORDINATION_PROTOCOLS.md`

### 핵심 반영 사항
- `.agent = durable private operating system`
- `.agent_class = loadout`
- `_workspaces = mission site`
- `_teams = future shared coordination layer`
- `protocols/`의 필요성
- `export/` 제거
- `runtime/` 경로 확정
- `species only`
- `policy species-free floor`
- `memory private`, `shared outside body`

### 코덱스 지시문
```text
다음 설계 원칙으로 .agent architecture 문서를 정리하라.

- .agent는 한 명의 durable agent unit을 이루는 private operating system이다.
- .agent_class는 loadout이다.
- _workspaces는 mission site다.
- 미래 팀 협업은 .agent 안이 아니라 _teams/shared로 확장한다.
- export는 body 핵심 기관이 아니므로 제거한다.
- protocols 폴더를 신규 도입한다.
- runtime/은 body 실행 경로로 고정한다.
- species는 identity의 durable default만 담당한다.
- policy는 species-free floor다.
- sessions는 transcript가 아니라 continuity 저장소다.
- autonomic은 저소음 품질 보정 루틴이다.

문서마다 목적/범위/포함 대상/제외 대상/미래 확장 방향을 명확히 적어라.
```

---

## Phase 2. `.agent` 폴더 skeleton 및 README 정리

### 목표
실제 폴더 구조와 로컬 README를 정본 수준으로 정리한다.

### 생성/수정 대상
- `.agent/identity/README.md`
- `.agent/registry/README.md`
- `.agent/policy/README.md`
- `.agent/communication/README.md`
- `.agent/protocols/README.md`
- `.agent/runtime/README.md`
- `.agent/memory/README.md`
- `.agent/memory/self/README.md`
- `.agent/memory/project/README.md`
- `.agent/memory/decisions/README.md`
- `.agent/memory/handoffs/README.md`
- `.agent/sessions/README.md`
- `.agent/sessions/checkpoints/README.md`
- `.agent/autonomic/README.md`
- `.agent/autonomic/checks/README.md`
- `.agent/autonomic/reminders/README.md`
- `.agent/autonomic/rules/README.md`
- `.agent/artifacts/README.md`

### README 공통 템플릿
각 README에 아래 항목을 통일한다.

- 목적
- 포함 대상
- 제외 대상
- 대표 파일
- 참조 관계
- 변경 원칙

### 코덱스 지시문
```text
.agent 하위 폴더 README를 durable agent unit 구조에 맞게 정리하라.
각 README는 아래 6개 섹션을 반드시 포함한다.

- 목적
- 포함 대상
- 제외 대상
- 대표 파일
- 참조 관계
- 변경 원칙

특히 아래 경계를 명확히 써라.
- identity vs registry
- policy vs communication
- memory vs sessions
- artifacts vs export
- communication vs protocols
- runtime vs policy
```

---

## Phase 3. 메타 파일 생성

### 목표
구조를 기계 판독 가능한 메타 파일로 고정한다.

### 생성/수정 대상
- `.agent/body.yaml`
- `.agent/body_state.yaml`
- `.agent/identity/species_profile.yaml`
- `.agent/identity/identity_manifest.yaml`
- `.agent/registry/active_class_binding.yaml`
- `.agent/registry/workspace_binding.yaml`
- `.agent/registry/capability_index.yaml`
- `.agent/registry/trait_bindings.yaml`
- `.agent/policy/precedence.yaml`
- `.agent/policy/approval_matrix.yaml`
- `.agent/policy/scope_rules.yaml`
- `.agent/communication/human_channel_profile.yaml`
- `.agent/communication/peer_channel_profile.yaml`
- `.agent/protocols/*.yaml`
- `.agent/runtime/context_assembly.yaml`
- `.agent/runtime/tool_scope.yaml`
- `.agent/runtime/sandbox_profile.yaml`
- `.agent/sessions/checkpoint_template.yaml`

### 코덱스 지시문
```text
다음 메타 파일을 YAML 중심으로 생성하라.

- body.yaml
- body_state.yaml
- species_profile.yaml
- identity_manifest.yaml
- active_class_binding.yaml
- workspace_binding.yaml
- capability_index.yaml
- trait_bindings.yaml
- precedence.yaml
- approval_matrix.yaml
- scope_rules.yaml
- human_channel_profile.yaml
- peer_channel_profile.yaml
- request_contract.yaml
- handoff_contract.yaml
- decision_contract.yaml
- incident_contract.yaml
- escalation_contract.yaml
- context_assembly.yaml
- tool_scope.yaml
- sandbox_profile.yaml
- checkpoint_template.yaml

원칙:
- runtime 상태를 지어내지 말 것
- 현재는 species only
- policy는 species-free floor
- shared memory inside body는 false
- sessions는 continuity only
- memory는 private-first
```

---

## Phase 4. 삭제/개명 반영

### 목표
불필요한 폴더를 제거하고 이름을 정리한다.

### 작업
- `export/` 삭제 반영
- `runtime/` 경로 확정
- `protocols/` 신규 추가
- `registry/` 범위 축소

### 코덱스 지시문
```text
다음 구조 조정을 반영하라.

1. export 폴더는 삭제 상태를 유지하고 body target tree에 다시 올리지 마라.
2. body 실행 경로는 runtime/ 으로 고정하고 engine 대체 경로를 남기지 마라.
3. protocols 폴더를 신규 추가하라.
4. registry는 정본 저장소가 아니라 binding/index/reference 계층으로 좁혀라.
```

---

## Phase 5. 루트 문서 정합성 맞춤

### 목표
루트 문서와 `.agent` 정본 설명이 충돌하지 않게 맞춘다.

### 수정 대상
- `README.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/DOCUMENT_OWNERSHIP.md`

### 코덱스 지시문
```text
루트 문서를 .agent 최종 구조와 정합되게 맞춰라.

원칙:
- 루트 README는 상위 지도만 유지
- .agent 상세 운영은 .agent/docs/architecture/* 와 각 로컬 README가 정본임을 명시
- TARGET_TREE에는 최종 .agent target tree를 반영
- DOCUMENT_OWNERSHIP에는 어떤 문서가 어느 폴더의 정본인지 명확히 적기
```

---

## Phase 6. 검증 및 최종 보고

### 목표
문서와 실제 구조, 메타와 README가 서로 맞는지 확인한다.

### 검증 항목
- 폴더 구조와 TARGET_TREE 일치 여부
- README 상대 경로 / 링크 점검
- YAML 형식 검증
- `body.yaml`과 `body_state.yaml` 정합성
- `identity` / `registry` / `policy` / `runtime` 경계 점검
- `export` 제거 여부
- `protocols` 추가 여부
- `memory private`, `shared outside body` 원칙 점검

### 코덱스 지시문
```text
최종 검증을 수행하라.

검증 항목:
1. 실제 폴더 구조와 TARGET_TREE 문서 일치 여부
2. README 링크와 상대 경로 유효성
3. YAML 문법 유효성
4. body.yaml / body_state.yaml / species_profile.yaml / trait_bindings.yaml 정합성
5. export가 target structure에서 제거되었는지
6. protocols가 존재하는지
7. memory가 private-first인지
8. shared memory가 body 밖으로 예약되었는지
9. sessions가 transcript 저장소로 오해되지 않도록 문구가 정리되었는지
10. autonomic이 daemon이 아니라 저소음 품질 보정으로 정리되었는지

마지막에 수정 파일 목록과 핵심 diff 포인트를 보고하라.
```

---

## 12. 최종 체크리스트

### 구조
- [ ] `.agent`를 durable unit으로 정의했다
- [ ] `.agent_class`를 loadout으로 정의했다
- [ ] `_workspaces`를 mission site로 정의했다
- [ ] `_teams`를 future shared layer로 예약했다

### 폴더
- [ ] `identity/` 유지
- [ ] `registry/` 유지하되 binding/index 전용으로 축소
- [ ] `policy/` 유지
- [ ] `communication/` 유지
- [ ] `protocols/` 신규 추가
- [ ] `runtime/` 유지
- [ ] `memory/` 유지
- [ ] `sessions/` 유지
- [ ] `autonomic/` 유지
- [ ] `artifacts/` 유지
- [ ] `export/` 제거

### 원칙
- [ ] species only
- [ ] policy species-free floor
- [ ] memory private-first
- [ ] shared memory outside body
- [ ] sessions continuity-only
- [ ] autonomic low-noise
- [ ] protocols for structured coordination
- [ ] artifacts only for reusable body outputs

---

## 13. 최종 선언문

```text
.agent는 한 명의 durable agent unit을 이루는 private operating system이다.
.agent_class는 그 unit의 loadout이다.
_workspaces는 그 unit이 활동하는 mission site다.
미래 팀 협업은 body 안이 아니라 protocols와 _teams/shared 계층으로 확장한다.

identity는 species 중심의 durable default를 담고,
registry는 자산 참조와 trait binding을 담당하며,
policy는 species-free floor를 유지하고,
communication은 사람-facing 표현을,
protocols는 agent-to-agent 협업 규약을,
runtime은 context assembly와 실행 순서를,
memory는 private 장기 기억을,
sessions는 작업 연속성을,
autonomic은 저소음 품질 보정을,
artifacts는 reusable output을 담당한다.

export는 body의 핵심 기관이 아니므로 제거한다.
현재는 hero motif를 identity 정본으로 두지 않고,
필요 시 future operating profile로 확장한다.
```


---

## 참고한 OpenClaw 공식 문서

- Multi-Agent Routing: https://docs.openclaw.ai/concepts/multi-agent
- Session Tools: https://docs.openclaw.ai/concepts/session-tool
- Context: https://docs.openclaw.ai/concepts/context
- FAQ: https://docs.openclaw.ai/help/faq
- Multi-Agent Sandbox & Tools: https://docs.openclaw.ai/tools/multi-agent-sandbox-tools
