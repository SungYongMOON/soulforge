# Soulforge Voice-First Bot/Agent 운영모델 v0.2 — 최종 확정안

## 문서 상태

| 항목 | 값 |
| --- | --- |
| 결정 상태 | `OWNER_CONFIRMED_PLAN` |
| 구현 상태 | `PARTIAL_FOUNDATION / ACTIVATION_GATED` |
| 기준일 | 2026-08-21 |
| Official Task State Owner | Linear |
| Context·Decision·Policy·Evidence Owner | Soulforge |
| 현재 Chat 1시간 Bot | Owner 보고 v0.4.0 bounded multi-app write 설정; 기존 ID·매시간·활성 유지, first run/readback pending |
| 외부 mutation | Linear·Slack·Calendar·Drive bounded write, Gmail Draft-only; run당 최대 5. actual effect는 first run 관찰 전 `UNKNOWN/HOLD` |

이 문서는 기존 설계를 갈아엎지 않는다. 실제 운영에서 드러난 병목과 Owner의 Voice 사용법을
기준으로 **입구·맥락·판단·학습·실행권한의 순서**를 확정한다. 최종 목표는 낮은 수준의
알림 Bot이 아니라, 높은 판단능력을 갖되 위험도와 검증근거에 따라 실행권한을 다르게 받는
AI 팀 운영체계다.

## 1. 최종 한 문장

> Owner는 ChatGPT Voice 한 곳에서 말하고 판단한다. Voice는 얇은 맥락으로 Project Manager를
> 호출하고, 각 Project Agent는 격리된 Deep Context 안에서 의미 있는 업무단위를 판단·수행한다.
> Soulforge는 판단·권한·원장·Evidence를 소유하고, 반복 성공한 수행법을 Skill·Workflow·Party로
> 승격한다. Linear는 현재 Official Task 상태 정본이며, 실제 권한은 검증된
> `Project × Task Type × Action`부터 단계적으로 연다.

## 2. 최종 판정

| 영역 | 판정 | 확정 내용 |
| --- | --- | --- |
| 전체 아키텍처 | `CONDITIONAL_GO` | 구조는 확정하고 actual Evidence로 단계별 검증 |
| ChatGPT Voice | `GO_AS_HUMAN_INTERFACE` | 단일 비서·교환대·Dispatch Console; 정본 아님 |
| Chat 1시간 Bot | `OWNER_CONFIGURED_BOUNDED_WRITE / READBACK_PENDING` | v0.4.0 permission matrix와 max-effects=5를 Owner가 설정했다고 보고. public A0 contract는 safety baseline이며 실제 first-run effect는 미검증 |
| Project Agent | `TARGET` | Project-scoped Source·Context·Engine·Task만 사용 |
| Portfolio Navigator | `TARGET` | Project State Capsule과 typed projection만 소비, raw 통합 금지 |
| P4·Linear Backup·P5 | `GO_WITH_EXACT_GATES` | actual 한 번의 Evidence 폐루프가 다음 단계 |
| Linear mutation | `HOLD` | C5 품질근거와 capability별 Owner 승인 전 0 |
| AgentRun·Dispatcher | `HOLD` | accepted Work Unit·authority·idempotency 뒤 |
| Hermes | `CONDITIONAL_GO` | 격리 Proposal Runtime, read-only Soulforge Interface부터 |
| Codex | `GO` | 정밀 구현·검증 Worker |
| Gemini Flash | `GO_AS_BOUNDED_BUILDER` | public-synthetic Module·fixture·빠른 구현, Controller 검토 필수 |
| Grok Build | `GO_AS_PILOT_WORKER` | 빠른 병렬 코드 Worker; exact worktree·receipt·review 필요 |
| Claude/Fable | `GO_AS_INDEPENDENT_REVIEWER` | Architecture·Safety·불일치·acceptance 검토 |
| Buzz·Grok Bot | `HOLD` | 새 memory·credential·scheduler·collaboration plane 도입 보류 |

## 3. 기준 아키텍처

```text
                         Owner
                           │
                  ChatGPT Voice / Chat
              Thin Voice Context + 승인·STOP
                           │
                    Voice Ingress Receipt
                           │
                  Portfolio Navigator
             Project State Capsule만 기본 소비
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
  KVDS Manager        AUV Manager         Project N Manager
       │                   │                   │
 Project-scoped       Project-scoped       Project-scoped
 Source/Context       Source/Context       Source/Context
 Gmail·Slack·Linear   Gmail·Slack·Linear   Gmail·Slack·Linear
 Files·Calendar       Files·Calendar       Files·Calendar
 PLAUD routed subset  PLAUD routed subset  PLAUD routed subset
       │                   │                   │
       └────────────── Project Agent ──────────┘
                           │
           Meaningful / Skillable Work Unit
                           │
                 Codex / Flash / Grok / Hermes
                           │
              Result·Evidence·Execution Receipt
                           │
       Project Decision Ledger + Project Context
                           │
                Portfolio typed projection
```

### 절대 소유 경계

1. Linear가 현재 Sole Official Task State Owner다.
2. 모든 Task mutation은 Sole Coordinator 하나를 통과한다.
3. Accepted Context Generation writer는 HPP의 fenced single writer 하나다.
4. Source 원본, Project Context, Task 상태, AgentRun 결과는 다른 층이다.
5. Voice·Chat·Hermes·Agent 개인 memory는 Project Context로 자동 승격하지 않는다.
6. Project 간 정보 이동은 raw context 공유가 아니라 typed projection/receipt로만 한다.
7. Context scope가 넓을수록 execution authority를 낮게 유지한다.

## 4. Voice는 상시 대기형 비서실·교환대다

Voice는 모든 프로젝트 원문을 보유하는 하나의 뇌가 아니다. 일을 멈추지 않고 Project Manager와
Worker를 호출하는 Dispatch Console이다.

```text
"KVDS 팀장 스레드 가서 진행 확인해줘"
  -> target=KVDS Manager
  -> operation=status_review
  -> expected_result=owner_briefing

"그건 Codex가 실제 파일까지 보고 검토하게 해"
  -> target=KVDS Manager
  -> operation=worker_dispatch_candidate
  -> worker=Codex
  -> authority=별도 확인
```

### Voice 기본 명령

| 명령 | 의미 |
| --- | --- |
| `CAPTURE` | 업무·아이디어·약속을 후보로 캡처 |
| `QUERY` | Project Manager·Worker·Task 상태 조회 |
| `BRIEF` | 중요업무·예외·Owner decision 요약 |
| `APPROVE` | exact Proposal 승인·거절·정정 |
| `STOP` | 지정 Worker·automation 중지 요청 |

### Voice provenance 4층

```text
L1 Voice Raw Event
  audio/session ref, occurred_at, speaker candidate, ASR transcript ref, confidence

L2 Interpreted Intent
  target, operation, expected result, project candidate, authority candidate

L3 Accepted Instruction
  accepted | clarified | rejected | superseded

L4 Execution Receipt
  실제 조회·dispatch·mutation·no-op·blocker
```

`source_channel=chatgpt_voice`와 `requested_by=owner`를 분리한다. Voice AI는 권한자가 아니다.
회의·브레인스토밍의 모든 발화를 Task/Decision으로 승격하지 않고 Observation에서 promotion Gate를
거친다. 오인식·잘못된 routing은 correction/supersession으로 남기며 기존 기록을 수정하지 않는다.

## 5. Project 격리와 Portfolio 총괄

Project scope를 먼저 결정하고 그 경계 안에서 Reasoning한다.

| Project Agent 입력 | 기본 허용 범위 |
| --- | --- |
| Slack | 승인된 Project channel과 관련 Thread |
| Gmail | Project label·binding·승인 검색조건의 Thread |
| Linear | Project·Issue·Child·relation |
| Files | Project workspace·승인 source revision |
| Calendar | Project 관련 일정 |
| PLAUD | Project 일정·회의·시간으로 routing된 recording/transcript revision |
| SE Engine | 해당 Project state·stage·gap·proposal |
| 다른 Project | 기본 차단; typed Cross-Project Context Request 필요 |

Project가 불명확하면 `UNKNOWN/HOLD`다. Portfolio Navigator는 모든 raw Source를 다시 읽지 않고,
각 Project Agent가 만든 Project State Capsule을 소비한다. 기존 한 개의 Chat 1시간 Scheduled Task는
모든 연결업무를 관찰할 수 있지만, Event를 Project scope로 routing한 뒤 Project별 Cycle로 판단하며
raw context를 한꺼번에 합치지 않는다.

## 6. 판단 성숙도와 실행 권한은 별도 축이다

Roadmap의 완료조각 `C0~C6`과 혼동하지 않도록 machine-facing 판단 성숙도는 `JM0~JM6`로
기록한다. Owner 대화의 `C-level`은 표시용 별칭이다.

### 판단 성숙도 `JM0~JM6` (`C-level`)

| 수준 | 판단 능력 |
| --- | --- |
| `JM0` | Source Event 감지·Project 후보 |
| `JM1` | Evidence binding·Coverage·Gap |
| `JM2` | Task identity·NEW/FOLLOW-UP/EVIDENCE/FYI |
| `JM3` | relation·Owner·Due·Waiting·Next Action |
| `JM4` | 완료조건·후속조치·Done candidate |
| `JM5` | Meaningful Work Unit·수행계획·Worker 선택 |
| `JM6` | multi-source Project reasoning·SE proposal·반례·불확실성·escalation |

### 실행 권한 `A0~A6`

| 수준 | 허용 Effect |
| --- | --- |
| `A0` | read + Shadow proposal, 외부 mutation 0 |
| `A1` | Project Decision/Evidence Ledger append |
| `A2` | create-only candidate artifact 또는 승인된 Official Task 생성 |
| `A3` | bounded Task field·Waiting 설정/해소 |
| `A4` | 기계적으로 증명 가능한 Task auto-Done |
| `A5` | approved Work Unit을 Worker에게 dispatch |
| `A6` | 승인된 수신자·template·업무유형의 제한적 외부행위 |

public-synthetic Cycle Contract는 **JM5~JM6를 목표로 하는 A0 baseline**을 유지한다. 실제
`업무 인입 감시` v0.4.0은 Owner 보고상 Linear·Slack·Calendar·Drive bounded write와 Gmail
Draft-only를 열었고 run당 외부 변경은 5건으로 제한한다. Gmail send/reply/forward,
Done/Cancel/Archive/Delete, 계약·비용·대외 약속·중요 기술기준은 계속 Permanent Human Gate다.
first run의 exact receipt/readback 전에는 실제 effect 성공이나 정책 준수를 주장하지 않는다.

### Canary 단위

```text
Project × Task Type × Action × Authority × Policy Revision
```

Agent 전체나 Project 전체에 권한을 한꺼번에 주지 않는다. 자동화 순서는 단순 난이도가 아니라
실패 복구성과 영향범위로 정한다.

1. Artifact Canary: 후보 PPT·보고서·표·분석 결과
2. State Canary: Task 생성·Waiting·Due·relation·Done
3. External Action Canary: Slack·Calendar·Gmail·공유·대외행위

## 7. Chat 1시간 Bot B0~B5

### B0 — exact task freeze

- exact Prompt revision·model 또는 `UNKNOWN`
- all-project observation, Project별 isolated decision cycle
- KST cutoff·source cursor·coverage contract
- output schema·policy revision·allowed effects
- repo contract baseline은 A0이며, 실제 task는 Owner 보고 v0.4.0 permission matrix를 별도 소유한다.
  exact prompt digest·first-run app readback·`gmail_sent=0`·effect≤5 전에는 live acceptance `HOLD`

### B1 — Retrieval Coverage

각 판단 전에 `source_reads[]`를 만들고 `read|empty|partial|unavailable`, cursor, count, latest time,
coverage gap, source refs를 기록한다. 필수 Source가 빠지면 `PROPOSAL`을 확정하지 않고 HOLD한다.

### B2 — hostile context/reasoning test

- relevant Evidence 위치를 앞·중간·뒤로 이동
- noise·duplicate·contradiction·late Event
- prompt injection·cross-project contamination
- stale generation·ambiguous owner·missing Task relation

오류는 `SOURCE_UNAVAILABLE`, `RETRIEVAL_MISS`, `ASSEMBLY_MISS`, `REASONING_MISS`,
`POLICY_AMBIGUITY`, `APPLICATION_FAILURE`로 분리한다.

### B3 — real-work evaluation

모든 연결 업무가 실전 평가셋이다. 품질은 평균 하나가 아니라 다음 축으로 본다.

```text
project × task_type × source
v0.3 이후: + decision_type
```

초기 Acceptance 기준:

| 지표 | 기준 |
| --- | ---: |
| Evidence ref·Coverage 상태 | 100% |
| 동일 identity+digest NO_ACTION 안정성 | 100% |
| duplicate proposal | 0 |
| cross-project contamination | 0 |
| 승인 없는 external effect | 0 |
| proposal precision | 85% 이상 |
| actionable recall | 90% 이상 |
| 마지막 20건 critical false positive/negative | 0 |

첫 10건 뒤 taxonomy는 correction으로 보정하고 기존 결과를 삭제하지 않는다. 50건부터 정식 Shadow
평가, 마지막 20건을 연속 안정성 Gate로 쓴다.

### B4 — Accepted Context A/B

같은 Event를 live-only와 live+P5 Accepted Context로 비교한다. Task match, false NEW, Owner,
HOLD, precision/recall, context cost, summary noise와 실제 L0~L4 조회깊이를 측정한다.

### B5 — capability별 Effect Canary

C5 품질근거와 별도 Owner 승인 뒤 하나씩 연다. 첫 후보를 하나의 Project에 영구 고정하지 않고,
실전 데이터에서 가장 안정적인 `Project × Task Type × Action`을 선택한다. 다른 업무는 A0 Shadow를
유지한다.

## 8. Decision Ledger

### 소유 구조

```text
Soulforge private state
├─ Project Decision Ledger: 판단·정정·승인·적용 history 정본
└─ Portfolio Decision Projection: Project별 상태·위험·Owner decision 요약

Linear: What is the official task state?
Decision Ledger: Why was that interpretation/decision made?
```

Drive·Sheet·Dashboard는 전달·사람용 projection이지 정본이 아니다. Chat task history도 정본이 아니다.

### 최소 Record

```text
cycle_id, project_ref, occurred_at, observed_at
trigger_identity, source_revision_refs, read_set, coverage, freshness
candidate_task_refs, exclusions
intake_class, task_identity, task_type, relation, lifecycle, routing
disposition, why_code, short_summary, missing_context
proposed_action, required_authority
human_verdict, correction_category, supersedes_ref
next_check_at, later_outcome, application_receipt
```

같은 identity+digest는 `NO_OP`, 같은 identity+다른 digest는 새 평가 Event다. Bot 자신의 effect는
`APPLICATION_ECHO`로 표시해 새 Trigger로 사용하지 않는다. Chain-of-Thought와 Source 본문 전체를
Ledger에 저장하지 않는다.

## 9. Meaningful / Skillable Work Unit

Soulforge는 micro-step을 모두 오케스트레이션하지 않는다. 기본 관리단위는 맥락·판단·산출물·검증을
포함한 의미 있는 업무단위다.

```text
Mission
  -> Meaningful / Skillable Work Unit
    -> Agent internal decomposition
      -> Atomic tool actions
```

좋은 Work Unit은 다음을 가진다.

1. 명확한 목적과 `why/why-now`
2. 한정된 Project Context 경계
3. Agent가 수행할 실제 판단
4. 검증 가능한 산출물·Evidence
5. 명확한 완료조건·Authority·Stop condition

예: `PPT 7페이지 수정`이 아니라 `새 시험결과가 CDR 성능 주장에 미치는 영향을 검토하고,
관련 자료 후보본·미해결 Gap·검증 receipt를 제출`한다.

## 10. Capability Learning Loop

```text
Work Unit 수행
  -> Agent 시행착오·self validation
  -> 사람 correction / independent review
  -> Execution Retrospective
  -> 반복 패턴 발견
  -> Skill Candidate
  -> Project Skill
  -> Workflow
  -> 필요할 때 Party
  -> 여러 Project 재현 뒤 Shared Skill 후보
```

### 승격 기준

- 재사용 가능성 낮음: execution receipt와 retrospective만
- 2~3회 반복: Skill Candidate
- 반복 검증 성공: Project Skill
- 여러 Skill의 안정된 순서: Workflow
- 병목이 역할 분리를 요구: Party
- 여러 Project에서 재현: Shared Skill 후보

`Skill=방법`, `Workflow=순서`, `Party=역할 구성`이다. Agent가 Skill을 제안할 수 있지만 자기승격·
자동배포하지 않는다.

## 11. Worker·Runtime 역할

| 실행 주체 | 역할 | 현재 권한 |
| --- | --- | --- |
| ChatGPT Voice | 사람용 입력·조회·승인·STOP | Interface; 정본·writer 아님 |
| Chat 1시간 Bot | all-project routing·Project별 high-judgment Shadow | A0 |
| Codex | canon·repository·문서·검증 정밀 Worker | approved Work Brief 범위 |
| Gemini Flash | 빠른 public-synthetic Builder·fixture·반복 구현 | Controller가 apply/review, actual effect 없음 |
| Grok Build | 독립 병렬 코드 Worker·교차 구현 Pilot | isolated worktree·receipt·review 필요 |
| Claude/Fable | fresh Architecture·Safety·acceptance Reviewer | read-only review 우선 |
| Hermes | 지속 Proposal Runtime·메시징·Cron 후보 | 격리 설치 뒤 read-only MCP·Proposal-only |
| Buzz | 별도 collaboration plane | HOLD |
| Grok Bot | 장기 External Worker 후보 | HOLD until C5/C6 |

Hermes는 공식 문서상 Windows native·WSL2·Docker를 지원한다. Soulforge는 운영 credential·자동 memory
promotion·skill auto-deploy를 허용하지 않는 격리 Runtime으로 먼저 시험한다. Grok Build도 official
source와 exact version을 고정하고 Soulforge sole-writer authority를 부여하지 않는다.

## 12. 실행 순서 `VF-0~VF-8`

기존 Roadmap P0~P10/C0~C6와 충돌하지 않는 Voice-First 전용 slice ID다.

| Slice | 작업 | 완료 증거 |
| --- | --- | --- |
| `VF-0` | 운영모델 정본·Owner decision·Stop condition 고정 | 이 문서+Roadmap/Master Plan sync |
| `VF-1` | C0 mutation default-OFF — `DONE_FOR_SYNTHETIC_SCOPE 2026-08-21` | pre-fix RED 뒤 synthetic restart/launcher·core GREEN, explicit opt-in 보존, implicit enable 0; live runtime posture는 별도 승인 restart 전 미검증 |
| `VF-2` | 현재 Chat Bot Prompt freeze·B0/B1/B2 계측 — `FOUNDATION_DONE / ACTUAL_TASK_HOLD 2026-08-21` | required-source/A0/payload-bounded Cycle Contract와 hostile fixture GREEN; actual Chat prompt digest·app binding은 `HB-D1` 전 `UNKNOWN/HOLD` |
| `VF-3` | C3 Project Decision Ledger·Portfolio Projection·ShadowEvaluator — `DONE_FOR_PUBLIC_SYNTHETIC_SCOPE 2026-08-21` | in-memory append/replay/NO_OP/correction/digest chain, identical-horizon portfolio, live-only synthetic quality receipt; persistent private writer는 `HB-D2` 전 0 |
| `VF-4` | C1 actual P4 + C2 actual Linear backup 병렬 — `C2_RUNTIME_ADAPTER_FOUNDATION_DONE / ACTUAL_RUN_HOLD 2026-08-22` | Linear runtime 22/22·LB1 50/50·Backup 135/135; actual project/source/stored-byte/human restore receipts는 Owner binding 뒤 |
| `VF-5` | C4 Accepted Generation + read-only Context Query | one accepted generation, ACL/generation/no-fallback receipt |
| `VF-6` | Hermes 격리 install + read-only Proposal canary | doctor, exact version, no credential/write/memory promotion |
| `VF-7` | Grok Build/Flash/Codex Worker comparison | same Work Unit quality·time·correction·receipt comparison |
| `VF-8` | C5 Shadow evidence 뒤 first `Project×TaskType×Action` canary | Owner approval, readback, rollback, sole writer; other scopes A0 |

## 13. Stop Conditions

다음 중 하나라도 발생하면 권한 확대를 중단한다.

1. Linear와 dev-ERP가 동시에 Official Task 상태를 씀
2. 필요한 Source Coverage 없이 NEW·Done·mutation 확정
3. NO_ACTION receipt 없이 반복 판단
4. Bot effect가 새 Trigger가 됨
5. provider acknowledgement 불명인데 blind retry
6. exact authority 없는 외부 effect
7. Chain-of-Thought·secret·raw source body를 Ledger에 저장
8. cross-project raw context 혼입
9. Agent memory의 Accepted Context 자동승격
10. Skill 자기수정·자동승격·자동배포
11. AgentRun success를 Official Done으로 사용
12. backup·replay·rollback·canary 없이 writer 전환
13. Portfolio Navigator가 Project raw Source를 상시 통합
14. micro-step orchestration이 Owner 병목을 다시 만듦

## 14. Owner 확정 결정

1. Voice를 단일 사람용 비서·Dispatcher Interface로 채택한다.
2. Voice provenance는 남기되 Voice AI를 authority로 기록하지 않는다.
3. Thin Voice Context와 Deep Project Context를 분리한다.
4. Project별 Manager/Agent와 Context Firewall을 두고 Portfolio는 projection만 본다.
5. 현재 Linear를 Sole Official Task State Owner로 유지한다.
6. Soulforge가 Context·Decision Ledger·Policy·Evidence·Agent Receipt를 소유한다.
7. 1시간 Bot public contract는 A0 baseline이고, 실제 `업무 인입 감시`는 Owner 보고 v0.4.0 bounded multi-app write다. first-run receipt/readback 전 actual acceptance는 `HOLD`다.
8. 최종 목표는 `JM6(C6) 판단능력 × task-type별 A0~A6 가변권한`이다.
9. Permanent Owner Authority 영역은 높은 단계에서도 Human Gate다.
10. Canary 단위는 `Project×TaskType×Action×Authority×Policy Revision`이다.
11. 품질은 `project×task_type×source`로 측정하고 이후 decision_type을 추가한다.
12. Decision Ledger는 Project별 정본과 Portfolio Projection으로 분리한다.
13. Soulforge의 기본 작업단위는 Meaningful / Skillable Work Unit이다.
14. Worker가 내부 micro-step을 분해하며 Soulforge는 목적·맥락·완료조건·권한을 준다.
15. 반복 성공한 수행법은 Skill Candidate→Project Skill→Workflow→Party로 승격한다.
16. Chat Bot, Hermes, Codex, Flash, Grok의 capability와 Soulforge authority를 분리한다.
17. Hermes는 격리 Proposal Runtime, Grok Build는 병렬 코드 Worker, Claude/Fable은 독립 Reviewer다.
18. Buzz·Grok Bot은 현재 도입하지 않는다.
19. 이 문서 확정만으로 Scheduled Task·app permission·external account·runtime을 변경하지 않는다.

## 15. 현재 바로 다음 행동

1. `VF-1` C0 default-OFF 구현·회귀시험 — synthetic 완료
2. `VF-2` B0/B1/B2 public-synthetic foundation 완료; actual Chat 1시간 Bot exact Prompt 보존·적용은 `HB-D1` 전 `HOLD`
3. `VF-3` in-memory Ledger·Portfolio·ShadowEvaluator 완료; private persistent writer는 `HB-D2` 전 `HOLD`
4. `VF-4` actual P4·Linear backup adapter/Evidence 병렬
5. `VF-6` Hermes exact install packet·격리 host·rollback 확정 전 offline gate부터 구현

## Source refs

- ChatGPT Scheduled Tasks: `https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt`
- ChatGPT Apps: `https://help.openai.com/en/articles/11487775-connectors-in-chatgpt`
- Hermes Agent docs: `https://hermes-agent.nousresearch.com/docs/`
- Grok Build docs: `https://docs.x.ai/build/overview`
- Lost in the Middle: `https://arxiv.org/abs/2307.03172`
- RAGChecker: `https://arxiv.org/abs/2408.08067`
