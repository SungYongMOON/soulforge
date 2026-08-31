# Soulforge Engineering OS 제품군·명명 재기준 v0

## 문서 상태

| 항목 | 값 |
| --- | --- |
| 상태 | `OWNER_DECISION_DRAFT` |
| 기준일 | 2026-08-29 |
| 목적 | 흩어진 ERP·Engineering Engine·Agent·Context·Asset·Backup 비전을 하나의 제품군 언어로 정리 |
| 현재 효력 | 이름·Module·소유권 검토 초안 |
| 금지 | 실제 폴더·package·DB·TASK·route·runtime rename 또는 migration |

이 문서는 지금까지 확인한 큰그림을 잃지 않기 위한 재기준 초안이다. 기존 정본 owner를
바꾸거나 현재 동작하는 path를 자동으로 새 이름으로 해석하지 않는다. 이름 확정 뒤에도
실제 rename은 caller·pointer·backup·restore 영향 dry-run과 Owner 승인으로 별도 수행한다.

Soulforge의 상위 세계관·철학·판타지 대응·명명 문법·World Balance Review는
[`SOULFORGE_WORLD_BIBLE_V0.md`](SOULFORGE_WORLD_BIBLE_V0.md)가 Owner 초안으로 소유한다.

2026-08-29 Owner는 [`VISION_AND_GOALS.md`](VISION_AND_GOALS.md)의 `Owner 큰 비전 재확인`에
기록된 전체 방향을 보존하라고 지시했다. 큰 비전 내용은 기록된 Owner 방향이지만, 이 문서의
제품군·서브프로젝트 이름과 세 제품 분류는 계속 검토 초안이며 Owner 승인 이름이 아니다.

## 1. 권고하는 전체 이름

> **Soulforge Engineering OS**

짧은 브랜드와 repository 이름은 계속 **Soulforge**로 유지한다.

`Soulforge Engineering ERP`는 전체 플랫폼 이름으로 사용하지 않는다. ERP는 전체 OS 안의
핵심 제품이지만 Engineering Engine과 Agent Platform까지 모두 포함하는 상위 이름으로 쓰면
ERP 제품과 전체 시스템의 범위가 다시 섞인다.

## 2. 한 줄 정의

Soulforge Engineering OS는 회사와 프로젝트의 source·업무 후보·공식 Task·실제 자산·지식·
BOM·자재·Agent·실행·검토·백업을 안정된 ID와 revision으로 연결하고, Engineering Engine의
판단과 사람의 수락을 거쳐 다시 복구 가능한 회사 자산으로 축적하는 Engineering Operating System이다.

### 이름 대안 비교

| 대안 | 장점 | 결함 | 판정 |
| --- | --- | --- | --- |
| `Soulforge` 하나만 사용 | 가장 짧고 기존 path와 일치 | 전체 플랫폼·ERP·Engine·Agent 실행면이 계속 같은 이름으로 섞임 | 브랜드·repo 이름으로 유지 |
| `Soulforge Engineering ERP`를 전체 이름으로 사용 | 자산·업무 플랫폼 성격이 잘 보임 | Engineering Engine과 Agent Platform이 ERP 하위 구현으로 오해됨 | 전체 이름으로 비추천 |
| `Soulforge Engineering OS` + 세 제품 | 전체 북극성과 제품 authority를 동시에 구분 | Owner 결정과 후속 migration이 필요 | 권고 |

이름을 정하지 않으면 기능이 늘 때마다 `ERP`, `AX`, `SYSTEM`, `Engine`, `Bot`이 제품·조직·
runtime 의미를 오가며 owner와 완료 상태가 다시 섞일 위험이 있다.

```text
현실 Source
  -> Event·Work Candidate
  -> ERP Asset·Context·Task
  -> Engineering Engine 판단
  -> 사람 승인
  -> Agent Platform 실행
  -> Artifact·Evidence
  -> 사람 검토·수락
  -> ERP 상태·세계수·지식·백업 환류
```

## 3. 제품군 계층

```text
Soulforge Engineering OS
├─ Soulforge ERP
│  └─ 사람·프로젝트·업무·자산·BOM·지식·권한을 다루는 통합 운영 제품
├─ Soulforge Engineering Engine
│  └─ Core + Domain Engine으로 expected와 observed를 비교하는 판단 제품
└─ Soulforge Agent Platform
   └─ Agent Family·Mark·Deployment·Run과 MCP·runtime·협업 Adapter를 다루는 실행 제품
```

세 제품은 상하 대체관계가 아니다. ERP가 기록과 자산을 소유하고, Engineering Engine이
read-only 판단을 제공하며, Agent Platform이 승인된 Work Unit을 실행한다.

## 4. 공유하는 깊은 Module

제품명을 늘리는 대신 다음은 세 제품이 공유하는 깊은 Module로 둔다.

| Module | 작은 Interface가 제공해야 할 것 | 내부에 숨길 복잡성 |
| --- | --- | --- |
| Intake & Candidate | source 관찰, 업무 후보 제안, 후보 검토 | Chat 예약, Gmail·Slack·PLAUD·Buzz, dedupe, project 분류, 보류·거절 |
| Asset Catalog & Custody | 자산 등록, revision 생성, 자산 조회 | 실제 byte 위치, hash, ACL, quarantine, acceptance, baseline, restore |
| Context World Tree | accepted context 조회, 관계 연결, 시점 질의 | identity, event, decision, evidence, time, ACL, invalidation |
| Task & Decision | 공식 Task 생성·상태변경, 결정 기록 | Linear 연동, sole writer, assignment, idempotency, approval, replay |
| Digital Workforce Registry | Agent Mark 등록, 배치, Run 기록 | model·SOUL·Skill·Tool·권한·Hermes·Buzz·Codex·rollback |
| Connector & Ingress | source 조회, 승인 action, payload 제출 | Plugin, managed App, custom MCP, source ACL, custody, retry |
| Assurance & Recovery | 검증, 수락, backup, restore | delivery·ack·review 분리, audit, DR generation, secret recovery |

Module은 구현 폴더명이나 별도 법인이 아니다. caller가 작은 Interface로 큰 기능을 사용하게
하는 제품 내부의 책임 단위다.

## 5. Soulforge ERP의 사용자 섹터

Soulforge ERP의 사람용 정보구조는 기존 Owner 비전의 여섯 섹터를 유지한다.

| 섹터 | 포함 범위 |
| --- | --- |
| 콕핏 | 오늘 할 일, 일정, 위험, 알림, Agent·backup health |
| 받은 일 | Gmail·Slack·PLAUD·Buzz·파일·사람 요청, Event와 Work Candidate |
| 과제·단계 | Project, stage, requirement, gate, Task, deliverable, Dataset |
| 공유 마스터·조달 | 제품, 보드, Part, BOM, 재고, 위치, 구매, 업체, 납기 |
| 기록물·지식 | 실제 파일, Artifact, Template, Reference, RAG, Wiki, Engine knowledge |
| 운영·관리 | 사람, 조직, Agent Mark, Connector, 권한, 감사, 분석, backup·restore |

## 6. ERP가 보존하는 업무 전체 생명주기

ERP에는 승인된 Task만 넣지 않는다. 승인 전 관찰과 후보, 보류·거절·중복 이유도 별도
ledger에 보존한다.

```text
Observed Event
  -> Work Candidate
     -> Needs Information | Hold | Rejected | Duplicate
     -> Approved
        -> Official Task
           -> Assigned -> Claimed -> Working | Waiting
           -> Result Submitted -> Reviewed -> Human Accepted -> Done
```

Chat 1시간·3시간 예약은 각각 `Automation Definition`과 `Automation Run`으로 등록하고,
조회한 source refs, 생성한 candidate, 적용한 변경, `NO_ACTION` 이유, 오류·복구와 receipt를
남기는 목표다. Google Drive 장부는 현재 source-local 운영 증거일 수 있지만 ERP 밖의 유일한
후보·판단 장부로 영구 유지하지 않는다.

모델의 숨은 reasoning 전문은 저장하지 않는다. 업무 후보를 만든 이유는 source refs,
판단요약, 적용 정책 revision, confidence, duplicate key, human decision으로 구조화한다.

## 7. ERP Asset Plane

Soulforge ERP는 다음 회사 자산을 프로젝트 중심으로 통합 관리한다.

```text
Project Assets
  계약·요구사항·도면·CAD·코드·소나/시험 Dataset·분석·산출물·Baseline·Release
Material Assets
  제품·보드·Part·BOM Revision·재고·위치·구매·업체·성적서
Reusable Assets
  Template·양식·샘플·Reference·표준·Calculator·Skill·Workflow·Party
Knowledge Assets
  Source·Claim·Rule·RAG·Wiki·Context·Domain Engine knowledge
Digital Workforce Assets
  Agent Family·Mark·Deployment·Run·Evaluation·Rollback
External System Assets
  Gmail·Slack·PLAUD·Buzz·Linear·Drive·Git·NAS와 각 backup generation
```

`ERP에 있음`은 단일 boolean이 아니다.

| 상태 | 의미 |
| --- | --- |
| Cataloged | 안정된 자산 ID와 종류가 등록됨 |
| Custodied | 실제 byte가 승인 저장소에 있음 |
| Revisioned | content hash와 parent revision이 있음 |
| Accepted | 책임자가 특정 revision을 수락함 |
| Protected | ACL·retention·audit가 적용됨 |
| Recoverable | exact revision을 backup에서 복원 검증함 |

모든 자산은 `logical owner`, `byte owner`, `revision owner`, `acceptance owner`,
`backup/restore owner`를 분리한다.

## 8. 실제 저장면과 현재 경로

```text
./
├─ ui-workspace/apps/dev-erp/       현재 Soulforge ERP 구현 path; rename 전까지 유지
├─ guild_hall/engineering_engine/  Soulforge Engineering Engine 구현 owner
├─ .registry/                      Skill·Tool·Knowledge·Profile public canon
├─ .unit/                          Unit/Agent 정의 조각
├─ .workflow/                      reusable 업무방법
├─ .party/                         reusable Agent 팀 구성
├─ .mission/                       held execution plan
├─ guild_hall/state/gateway/       cross-project source ingress/staging
├─ _workspaces/
│  ├─ <project_code>/              ERP/Vault 프로젝트 정본 파일 materialization
│  ├─ SE_TEMPLATE_LIBRARY/         실제 Template·양식·샘플
│  ├─ knowledge/                   공통·조직·Domain source 자료
│  └─ system/                      project-agnostic reusable lab material
├─ _workmeta/                      pointer·hash·relation·run·receipt metadata
├─ private-state/                  cross-project protected continuity
└─ docs/architecture/              구조·정본·운영 계약
```

ERP 제품이 모든 자산을 논리적으로 관리하더라도 모든 byte를 ERP SQLite 안에 넣지 않는다.
실제 payload는 자산별 owner store에 두고 ERP는 stable ID·revision·권한·관계·검색·승격·복구를
통합한다.

`_workspaces/<project_code>`는 Bot scratch나 자유 편집 worktree가 아니라 ERP/Vault가 관리하는
프로젝트 정본 파일 주소다. 실제 bytes가 owner-approved shared worksite에 있어도 이 주소가
materialized view를 제공한다. 단, 폴더에 있다는 사실만으로 특정 revision이 Accepted·Baseline·
Release가 되는 것은 아니며 그 상태는 revision/acceptance metadata가 별도로 소유한다.

프로젝트 안에서 사람이 보는 논리 Asset Tree는 다음 범주를 가져야 한다.

```text
Project
├─ 기본정보·계약
├─ 요구사항
├─ 설계
├─ BOM·자재·구매
├─ 시험·소나 Dataset
├─ 산출물·보고서
├─ 검토·Evidence
├─ Baseline·Release
├─ 맥락·결정·지식
└─ Agent Run·Automation
```

실제 project foldertree는 현행 SE 단계·산출물 규칙을 유지하며, 논리 Asset Tree와
project-relative path를 stable asset ID로 연결한다. 실제 folder rename은 이 문서의 범위가 아니다.

## 9. Soulforge Engineering Engine

Engineering Engine은 다음 질문을 처리한다.

```text
어떤 규칙을 검사해야 하는가?
프로젝트에서 무엇이 실제로 관측됐는가?
둘을 비교하면 무엇이 충족·결손·불명·충돌인가?
```

Core와 Domain Engine은 source truth, project applicability, 사람 수락, Task state를 소유하지
않는다. 결과는 사람과 AX가 검토할 finding·risk·role·Work Unit 후보다.

## 10. Soulforge Agent Platform

```text
Agent Family
  -> Agent Mark
     -> Deployment
        -> Run
           -> Result·Evaluation
              -> Next Mark Candidate
```

Agent Mark는 role, requested/observed model, reasoning, SOUL/instruction ref·hash,
Skill·Workflow·Tool allowlist, memory·workspace·authority policy, evaluation과 rollback을 가진다.
Deployment는 Codex task, Hermes profile, Buzz identity/channel, runtime version을 결속한다.

Buzz는 external collaboration/source system이자 Agent deployment surface다. Buzz message,
attachment, workflow, audit의 source-local SoR는 Buzz relay이며, ERP는 project/task/Agent Mark와의
관계, backup·restore 상태와 promotion receipt를 관리한다. Buzz message나 attachment는 별도
ERP ingress·revision·review 없이 Project Artifact나 Official Task가 아니다.

private key, token, password, cookie, credential body는 ERP에 평문 저장하지 않고
Secret Manager 또는 OS 보호영역에 둔다.

## 11. 외부 시스템과 backup

Linear·Slack·Buzz·Gmail·PLAUD·Drive는 각각 External System Asset이다. ERP에는 system identity,
scope, source owner, retention, backup generation, manifest/hash, last restore와 project 관계를
등록한다.

```text
External System Backup
  Planned -> Captured -> Hash Verified -> Stored
  -> Restore Candidate -> Restore Tested -> Accepted -> Superseded
```

backup receipt, delivery receipt, consumer acknowledgement, result, review, human acceptance는
서로 대체할 수 없다.

## 12. 사람·Agent가 일하는 운영모델

```text
사람 Owner / Chat / Voice / Buzz
  -> Event·Work Candidate
  -> ERP candidate review
  -> Linear Official Task
  -> Assignment·Claim
  -> exact Agent Mark·Deployment
  -> local workspace execution
  -> Artifact Revision·Evidence
  -> independent review·human acceptance
  -> Task·Asset·World Tree·Knowledge·Agent improvement feedback
```

Chat 예약 3종은 Soulforge ERP가 완성되기 전 실제 source를 읽고 후보·중복·복구 문제를
발견하는 빠른 운영 파일럿이다. ERP를 대체하지 않으며, 장기적으로 Automation Run과
Candidate Ledger에 결속한다.

## 13. 명명 crosswalk 초안

| 현행 이름 | 권고 이름·분류 | 실제 rename |
| --- | --- | --- |
| `Soulforge` | 짧은 브랜드·repository 이름 | 없음 |
| 전체 큰그림 | `Soulforge Engineering OS` | Owner 결정 대기 |
| `dev-ERP` | 제품명 `Soulforge ERP`; 현재 package/path는 compatibility name | 금지·migration 별도 |
| `AX·SE Engine`, `Engineering Engine` | `Soulforge Engineering Engine` | package path 유지 |
| AI 기반시스템·agent runtime 묶음 | `Soulforge Agent Platform` | owner·path mapping 뒤 별도 |
| 맥락 세계수 | ERP의 `Context World Tree` Module | 별도 제품으로 분리하지 않음 |
| Task Engine | ERP의 `Task & Decision` Module | 현행 SoR 결정 전 rename 금지 |
| Agent Registry/Observation | Agent Platform의 `Digital Workforce Registry` Module | schema/owner 결정 전 materialize 금지 |
| Chat 1h/3h 예약 | `Rapid Operations Pilot` 운영 lane | 예약 이름·설정 변경 없음 |
| Buzz | External Collaboration Adapter + Agent Deployment surface | 제품 owner 아님 |
| Team Ops Board/4192 | read-only Operations Projection surface | dispatcher/writer 아님 |

AI 기반시스템 회사, 개발1팀 회사, AX·ERP·SYSTEM은 조직·authority 이름이다. 제품명과
섞지 않는다.

## 14. 일반적인 SW/OS 설계 산출물

이 재기준 뒤에는 한 장의 그림이 아니라 다음 정본 관점을 별도로 만든다.

1. System Context Diagram — 외부 사람·시스템과 Soulforge 관계
2. Functional Architecture — 기능 Module과 Interface
3. Operating Model / State Machine — Event부터 Candidate·Task·Acceptance까지
4. Information & Asset Model — Entity·ID·revision·relation
5. SoR & Ownership Matrix — logical/byte/revision/acceptance/backup owner
6. Physical Storage & Folder Map — 실제 repo·workspace·DB·vault 경로
7. Runtime & Deployment Diagram — PC·HPP·Buzz·Hermes·Codex process
8. Security & DR Architecture — ACL·secret·backup·restore
9. User Information Architecture — ERP 여섯 섹터·화면·렌즈

## 15. 현재 확인된 공백

- 전체 자산을 아우르는 Asset Catalog와 Source/Candidate 공통 수명주기;
- Google Drive 예약 장부와 ERP Automation Run·Candidate의 reconciliation;
- immutable byte revision store와 baseline/release/restore;
- 소나 Dataset 전용 자산 모델;
- Agent Family·Mark·Deployment 전사 registry;
- External System backup catalog와 actual restore verification;
- Buzz/Slack/Linear 등 source-local event의 승인된 promotion chain;
- Task→Agent→Artifact→human acceptance actual 폐루프;
- 현재 문서들의 stale 이름·상태·table count drift.

## 16. Owner 결정이 필요한 이름

1. 전체 플랫폼 이름을 `Soulforge Engineering OS`로 승인할지;
2. 세 제품명을 `Soulforge ERP`, `Soulforge Engineering Engine`, `Soulforge Agent Platform`으로 승인할지;
3. `dev-ERP`를 compatibility path로 얼마나 오래 유지할지;
4. ERP 사용자 화면의 한글 제품명을 `소울포지 엔지니어링 ERP`로 표시할지;
5. Agent Mark naming을 `Mark`, `Revision`, `Generation` 중 무엇으로 보여줄지.

결정 전에는 이 문서의 권고 이름을 active route·directory·package·DB schema에 적용하지 않는다.

## 17. 완성형 AI 조직과 단계적 구축

목표 AI 조직은 소수 Agent로 시작해 나중에 다시 설계하는 구조가 아니다. 전체 조직도와
프로젝트별 책임 역할, 공통 Agent, 전문 Tool Agent를 먼저 정의하고 실제 Agent Family·Mark·
Deployment·권한은 하나씩 검증하며 materialize한다.

```text
Portfolio Coordination
├─ typed project state만 소비
├─ 프로젝트 간 우선순위·충돌·Owner 판단 통합
└─ raw project context 통합 금지

Project AI Organization A
├─ Project Manager Agent
├─ 분야별 책임 Agent
├─ Project Deep Context
└─ Project-specific Tool·Artifact·Acceptance

Project AI Organization B
├─ 별도 Project Manager Agent
├─ 별도 책임 Agent
└─ 별도 Deep Context
```

프로젝트 팀장 Agent를 하나로 통합하지 않는다. 동일 runtime이나 Tool Workshop을 공유할 수는
있지만 Agent identity, SOUL, memory, project context, authority와 Task lineage는 분리한다.

## 18. 사람·AI Workforce와 Agent 생명주기

ERP의 사람·조직 영역은 사람 사원과 AI 사원의 공통 역할·역량·배정 개념을 제공하되,
사람 개인정보·인사 권한과 AI runtime·model·memory 권한을 분리한다.

```text
Workforce
├─ Human Workforce
│  ├─ 조직·직책·역할·프로젝트 배정
│  ├─ 역량·교육·온보딩
│  └─ privacy·인사 authority
└─ AI Workforce
   ├─ Agent Family·Mark·Role·Project Assignment
   ├─ SOUL·Model·Skill·Tool·Authority
   ├─ Deployment·Run·Evaluation
   └─ Memory·Backup·Restore·Rollback·Retirement
```

### Agent 생성

```text
조직도상 필요 역할
  -> Agent Family
  -> Mark I Candidate
  -> SOUL·Skill·Tool·authority binding
  -> synthetic test
  -> project pilot
  -> human approval
  -> deployment
```

### Agent 변경

기존 Mark를 덮어쓰지 않는다. SOUL, model, reasoning, Skill, Tool, authority, memory policy,
runtime 또는 project scope가 바뀌면 새 Mark Candidate를 만들고 diff·회귀시험·독립검토·
승인 뒤 current pointer를 변경한다.

### Agent Memory와 backup

Agent local memory, Project Context, raw chat history를 구분한다. Agent 복구는 `Family + Mark +
SOUL revision + Skill/Tool version + Project assignment + Memory generation + Deployment + secret_ref`
가 함께 맞아야 한다. raw chat이나 runtime memory가 accepted project knowledge로 자동 승격되지 않는다.

### Agent 퇴역과 장애

- 신규 Assignment 차단 → 진행 Run 종료·회수 → Task·Artifact·Memory handoff → backup → retired;
- 장애 시 side effect 확인 → claim·lease 회수 → same Mark 복구 또는 approved prior Mark rollback →
  incident·개선 후보 기록.

## 19. 전문 Tool Workshop과 Resource Job Shop

PowerPoint, Excel, HWPX, Allegro, AutoCAD, PCB library, 소나·시험 분석처럼 한 PC나 license-bound
Tool을 동시에 하나만 안정적으로 사용할 수 있는 기능은 전문 Agent와 공용 Workshop으로 둔다.

```text
Project/Common Agent
  -> Tool Job 제출
  -> Workshop Queue
  -> exact Tool PC Resource Lease (capacity=1)
  -> Specialist Agent 실행
  -> validator
  -> result·artifact·receipt 반환
```

Workshop은 input/output contract, supported format, Tool·library version, PC/resource identity,
capacity, priority, lease/fencing, timeout, retry, validation, output custody와 rollback을 소유한다.

| Workshop 후보 | 전담 범위 |
| --- | --- |
| 문서 제작소 | 보고서·회의록·업무자료 |
| 데이터 세탁소 | Excel·CSV·정규화·비교·계산 |
| HWPX 공방 | HWPX 변환·작성·검증 |
| 설계 대장간 | Allegro·AutoCAD·PCB·CAD 산출물 |
| 시험 연구소 | 소나·시험 Dataset·교정·분석 |
| 발표 공방 | PPT·도식·이미지·렌더 QA |
| 기록보관소 | 자료 분류·revision·catalog·archive |
| 복구소 | backup·restore·DR 검증 |

이 이름은 판타지 UI·운영 label 후보이며 실제 package·directory 이름이 아니다.

## 20. 운영·유지보수 정책 범위

### 일일 운영

- Agent·runtime·Connector health, Queue·Lease, 실패 Run, source freshness, backup, project·ACL 혼입 점검;
- production status는 UI idle이 아니라 exact receipt·readback으로 판단.

### 주간 운영

- Agent 품질·재작업·사람 보정, Skill·Tool drift, memory freshness, unresolved HOLD,
  restore sample, project별 Agent·Tool capacity 검토.

### 월간 운영

- Agent Mark 개선·퇴역 후보, model·비용·품질 비교, Tool PC capacity, Context 품질,
  권한·보안·backup coverage와 교육·지원 지표 검토.

### 변경관리

SOUL·model·Tool·Hermes·Buzz·ERP schema·프로젝트 조직 변경은 version pin, acceptance contract,
회귀시험, 독립검토, staged deployment와 rollback plan을 요구한다.

## 21. 팀원 PC 배포·업데이트·지원

```text
Team Member Device Profile
├─ 사람 identity·조직·역할·프로젝트 권한
├─ ERP account·MCP client·필요 Plugin
├─ Agent/Runtime binding
├─ local workspace·outbox·cache
├─ 사용 가능한 Tool·Workshop
├─ Secret binding ref
├─ update ring·current version
└─ backup·support·recovery policy
```

배포 절차는 PC 사전점검 → ERP 연결 → Plugin/MCP → project workspace → Agent binding →
권한검증 → smoke test → 교육 → 지원·복구의 순서를 가진다. update는 pilot → 관리자 →
개발1팀 → 전사 ring으로 확대하고, 실패 시 prior approved version으로 rollback한다.

## 22. 신규·경력·관리자 교육

| 대상 | 교육 내용 |
| --- | --- |
| 공통 | Soulforge 목적, ERP에서 업무·자산 찾기, 후보와 공식 Task, revision, Agent 의뢰, 보안·외부전송 |
| 신규 | 프로젝트 용어·단계·산출물, 작은 업무, 질문·멘토 검토, Agent 활용 |
| 경력 | 기존 업무 mapping, 전문 Workshop, 기술수락, Agent 결과 검증, Skill 후보 제안 |
| 관리자 | 프로젝트별 AI 조직, 역할·권한, HOLD·incident, Agent Mark 승인, 비용·품질·rollback |

교육 이수와 업무권한 개방은 분리한다. 교육 완료가 write·external action 권한을 자동 부여하지 않는다.

## 23. 개발1팀 첫 조직 pilot

```text
PILOT-0 준비
  팀원·PC·프로젝트·Tool·권한·교육 inventory
PILOT-1 읽기 중심
  ERP·자료·오늘 일·Agent 질의, mutation 0
PILOT-2 후보·자료 제출
  Work Candidate·파일·Agent 초안, 사람 검토
PILOT-3 프로젝트별 AI 팀
  별도 팀장·책임 Agent, Project Context 격리, Workshop 사용
PILOT-4 제한적 쓰기
  검증된 task type, exact writer, rollback 가능한 상태변경
PILOT-5 평가·확산
  시간·재작업·오류·사람보정·사용성·교육부담·비용 측정
```

외부전송·구매·기준선·기술수락·최종완료는 별도 사람 authority를 유지한다.

## 24. 구조 재정리와 실제 현업 병행

```text
Program A — Architecture & Governance
  portfolio·name·owner·Interface·storage·deployment·operations·training·migration

Program B — Development Team 1 Field Pilot
  Chat 예약·공통 Agent·project Agent·Workshop·실제 저위험 Work Unit·관찰 feedback
```

전체 정리가 끝날 때까지 현업을 미루지 않되, pilot의 임시 우회를 target architecture로
자동 승격하지 않는다. target organization은 고정하고 Agent·Deployment·권한만 점진적으로 연다.

## 25. 대형 프로젝트 포트폴리오 논리 폴더 초안

아래 `SF-Pxx`는 검토 중 이름과 무관하게 discussion에서 사용하기 위한 stable logical ID 후보다.
실제 directory, package, DB schema, TASK group을 만들거나 rename하지 않는다.

사람이 보는 표기는 `SF-P01`처럼 대문자를 사용하고, 기계 wire ID는 현행 Path Registry와
맞춰 `sf-p01`처럼 소문자로 정규화한다. display label과 wire ID를 같은 필드로 비교하지 않는다.

```text
Soulforge Portfolio (logical only)
├─ SF-P01  Work Discovery & Mission
├─ SF-P02  ERP & Asset Management
├─ SF-P03  Operations Console
├─ SF-P04  AI Workforce & Organization
├─ SF-P05  Knowledge & Ontology
├─ SF-P06  Engineering Engine Family
├─ SF-P07  Tool Workshops
├─ SF-P08  Platform, Security & Recovery
└─ SF-P09  Deployment, Training & Adoption
```

| ID | 업무형 이름 후보 | 판타지 label 후보 | 포함 범위 |
| --- | --- | --- | --- |
| `SF-P01` | Work Discovery & Mission | Monster Forge | Source event, Chat 예약, Work Candidate, AX 판단, TaskIntent·Work Brief |
| `SF-P02` | ERP & Asset Management | Vault | Project·Task·Asset·Dataset·BOM·Material·Template·Artifact·Revision |
| `SF-P03` | Operations Console | Watchtower | 4192, portfolio·project·Agent·Run·Engine·backup read-only projection |
| `SF-P04` | AI Workforce & Organization | Guild Hall | 사람·AI 조직, 프로젝트별 팀, Agent Mark·Memory, Hermes·Buzz·Codex 운영 |
| `SF-P05` | Knowledge & Ontology | World Tree | Entity·Context·Evidence·time·ACL·RAG·Wiki·Ontology·지식승격 |
| `SF-P06` | Engineering Engine Family | Engine Foundry | Engine Core와 현재·미래 Domain Engine별 독립 backlog·version·검증 |
| `SF-P07` | Tool Workshops | Artisan District | 문서·데이터·HWPX·CAD·PCB·시험·발표·보관·복구 Workshop |
| `SF-P08` | Platform, Security & Recovery | Bastion | Ingress, identity, secret, storage, runtime foundation, audit, backup·restore |
| `SF-P09` | Deployment, Training & Adoption | Academy | 다중 PC bootstrap·update·rollback, 팀원 교육·지원, 개발1팀·전사 rollout |

### 포트폴리오 Interface 초안

- `SF-P01`은 Event와 Work Candidate를 만들고 `SF-P02`의 Candidate/Task ledger에 제출한다.
- `SF-P05`와 `SF-P06`은 accepted context와 engineering finding을 `SF-P01`에 제공한다.
- `SF-P02`는 공식 Task·자산·revision·acceptance를 소유한다.
- `SF-P04`는 승인된 Assignment를 exact Agent Mark·Deployment에 결속한다.
- `SF-P07`은 resource job과 Artifact result를 반환한다.
- `SF-P03`은 모든 portfolio의 typed projection만 읽고 writer·dispatcher가 되지 않는다.
- `SF-P08`은 공통 identity·custody·security·recovery Interface를 제공한다.
- `SF-P09`는 검증된 release를 사람·PC·조직에 배포하고 교육·지원 결과를 환류한다.

## 26. Shared Ledger, Process Mining, and Learning Dataset Plane

Ledger는 네 번째 제품이 아니라 세 제품과 아홉 portfolio를 가로지르는 공통 plane이다.
ERP는 업무·자산·현재 projection과 catalog를, Engineering Engine은 rule evaluation·finding을,
Agent Platform은 Agent/Deployment/Run/Tool 실행을 각각 소유한다. 공통 Ledger Module은
catalog, envelope validation, append/idempotency, clock/relation, owner-local outbox relay,
reconciliation, replay/export 같은 기계 계약만 소유하고 Domain 의미·수락·권한을 가져오지
않는다. 4192는 typed projection만 읽고 writer가 되지 않는다.

### Ledger Catalog와 owner 관계

중앙에 두는 것은 하나의 전사 event database가 아니라 `Ledger Catalog`다. 실제 Event Store는
프로젝트·조직·source·retention·ACL·legal-hold 경계에 따라 분할할 수 있다. 단일 SQLite WAL은
한 프로젝트 bounded pilot 후보일 뿐 전사 target이 아니다.

각 Catalog row는 다음을 구분한다.

```text
ledger_id / ledger_kind
producer_portfolio / logical_owner_portfolio / infrastructure_portfolio / consumer_portfolios
SoR / sole_writer / schema_revision
case_type / case_issuer / activity_registry_ref / clock_contract_ref / relation_contract_ref
storage_class / project_or_org_scope / ACL / retention / legal_hold
backup_restore_class / projection_refs / review_acceptance_owner
mining_eligible / learning_eligible / people_analytics_allowed   # 모두 deny-by-default
current_state / gap / evidence_ref
```

`ledger_kind`는 최소 `source_sor`, `event_ledger`, `receipt_store`, `cursor`, `current_state`,
`projection`, `backup_generation`, `dataset`을 구분한다. 같은 사건을 여러 요약 장부가 가리킬
수는 있지만 원천 occurrence 하나와 projection/summary 관계를 결속하고 별도 사건으로 중복
계산하지 않는다.

| Portfolio | Ledger family | 최소 분석 가능 질문 |
| --- | --- | --- |
| SF-P01 | source occurrence, candidate, decision, no-action/hold/reject/approve | 어떤 사건이 왜 업무가 되었거나 되지 않았는가 |
| SF-P02 | task, asset, BOM/material, ArtifactRevision, review/acceptance | 무엇이 언제 어떤 revision으로 완료·수락됐는가 |
| SF-P03 | health/incident/action projection, coverage, lag, quality, aggregate cost | 병목·장애·비용·capacity가 어디에 있었는가 |
| SF-P04 | person/Agent Mark, deployment, WorkSession, run, delivery/ack/result | 누가·어떤 Agent/모델/도구로 얼마나 일했는가 |
| SF-P05 | source revision, knowledge access, RAG index/eval/invalidation/promotion | 어떤 근거와 지식이 결과에 쓰였고 언제 stale해졌는가 |
| SF-P06 | rule/profile/binding, typed facts, Engine evaluation/finding | 어떤 규칙·관측·판단이 업무와 결과에 영향을 줬는가 |
| SF-P07 | resource job, lease/fence, tool/library version, artifact result | 전문 Tool 대기·실행·재작업 병목은 무엇인가 |
| SF-P08 | identity/grant, custody, backup/restore, audit | 어떤 상태를 어느 세대에서 복구·검증할 수 있는가 |
| SF-P09 | pack/release/install/update/training/support | 배포·교육·지원이 성과와 오류에 어떤 영향을 줬는가 |

### Case, Activity, Time, Relation

`case_ref`는 공통 Module이 임의 발급하는 전역 업무 ID가 아니다. primary lifecycle의 Domain
owner가 `case_type`과 함께 발급하고 Ledger Catalog가 issuer와 형식을 등록한다. Project, Task,
Assignment, Run, ArtifactRevision, Backup Generation은 서로 다른 object이며, 여러 object를 한
process 분석에 결속할 때 `object_refs`와 typed relation을 사용한다.

`activity_code`의 의미와 version은 originating portfolio/domain owner가 등록하고 공통 Module은
`activity_definition_ref`와 형식만 검증한다. `activity_instance_ref`는 실제 한 번의 발생·실행을
식별한다. `assignment_ref`와 `run_ref`는 해당되는 Task/Execution event에서 필수이고, 적용되지
않는 event는 Catalog의 applicability로 명시한다.

공통 Event Envelope는 최소 다음을 가진다.

```text
event_id / ledger_id / schema_revision / event_type
case_ref / case_type / object_refs
project_ref / work_ref / task_ref / assignment_ref / run_ref
activity_code / activity_definition_ref / activity_instance_ref
actor_ref / role_at_event_ref / organization_at_event_ref
agent_mark_ref / deployment_ref / tool_ref / profile_ref
occurred_at / observed_at / recorded_at / effective_from / effective_to
from_state / to_state / relation_refs / idempotency_key
source_revision_ref / artifact_revision_ref / backup_generation_ref
input_refs / output_refs / evidence_refs / review_refs / acceptance_refs
coverage_ref / reconciliation_state / correction_or_supersession_ref
```

`relation_refs`의 공통 vocabulary는 최소 `precedes`, `depends_on`, `forks_from`, `joins`,
`hands_off_to`, `rework_of`, `reopens`, `corrects`, `rolls_back`, `supersedes`를 구분한다.
Waiting은 단일 duration 숫자가 아니라 `Working -> Waiting -> Working|Closed` 전이와 원인·resolver
refs로 계산한다. review, acceptance, restore, restore acceptance도 서로 다른 event/time 의미다.
`occurred/observed/recorded`는 수집 clock이고, `effective_from/to`는 사실·role·ACL·binding의
유효기간이다. 기존 Domain의 `valid_at/known_at`, `reviewed_at`, `accepted_at`, `restored_at`은
Catalog clock mapping을 통해 연결한다.

raw bytes와 긴 body는 owner store에 두고 Ledger는 exact revision pointer/hash만 가진다. 현재
상태는 Event replay의 rebuildable projection이며 과거 Event를 update/delete하지 않는다. 정정과
삭제·철회는 append-only correction/invalidation event로 남긴다.

### Outbox와 RAG lifecycle

Source capture와 Event append를 다른 저장소에 걸친 하나의 distributed transaction으로
주장하지 않는다. authoritative owner-local transaction이 source/event와 metadata-only outbox를
같이 commit하고, 공통 relay는 outbox identity·idempotency·retry·poison HOLD·reconciliation을
통해 scoped Event Store와 RAG worker에 전달한다. RAG 실패는 Source/Ledger commit을 되돌리지
않는다.

RAG worker는 exact source revision set과 ACL-policy revision을 결속해 extraction/parser/chunker/
tokenizer/embedding/model/backend/library revision을 가진 Index Generation을 만들고 evaluation 뒤
active pointer를 전환한다. lifecycle은 `active -> stale -> superseded|rebuild_required -> rebuilt`를
구분하며 source revision, ACL, legal hold, deletion, correction 변경은 invalidation을 발생시킨다.
pre-retrieval과 post-retrieval 모두 ACL을 적용하고 project/common index를 섞거나 foreign existence를
노출하지 않는다. byte-identical exact rebuild lane과 evaluation-equivalent rebuild lane을 구분한다.
Structured task/time/count 질의는 DB projection, 근거·대화·문서 검색은 RAG를 사용한다.

Process Mining·분석·학습 pipeline은 별도 authority chain을 가진다.

```text
accepted ledger cutoff + source/artifact refs
  -> consent/ACL/redaction/de-identification
  -> versioned process-mining/learning dataset
  -> feature/label/split manifest + quality review
  -> offline analysis/evaluation
  -> process/Skill/Agent Mark/model improvement candidate
  -> human review and staged deployment
```

Dataset은 case/activity/timestamp/resource/duration/wait/rework/error/result/quality/cost fields와
source lineage를 보존해야 한다. 사람 평가·성과평가로 사용할 때는 별도 정책과 설명가능성·
오류정정·이의제기·접근권한이 필요하며, 자동 인사평가나 개인 감시로 확장하지 않는다.

Dataset manifest는 exact cutoff/generation/query digest, source/Artifact revision closure, purpose,
legal basis/consent revision과 withdrawal, `label_authority`, annotator/reviewer, uncertainty/dispute/
correction lineage, temporal split cutoff, same case/actor/artifact group split 금지, project/customer/
organization leakage guard, exact/near duplicate 검사, feature builder·library·environment revision,
retention/delete/legal-hold propagation, quality/bias/privacy review와 Human approval ref를 가진다.
검증되지 않은 Agent 결과는 event로 보존할 수 있지만 ground-truth label로 사용하지 않는다.
`mining_eligible`, `learning_eligible`, `people_analytics_allowed`는 서로 다른 deny-by-default 상태다.

## 27. 2026-08-31 독립검토 통합판정

Owner가 제공한 fresh Fable 5 검토는 `ACCEPT_WITH_REVISIONS`, Sol Ultra 검토는 `REVISE`였다.
두 결과는 북극성 구조를 부정하지 않았고, LR1 진입 준비도에 서로 다른 강도를 적용했다.

통합판정은 다음과 같다.

| 대상 | 통합판정 |
| --- | --- |
| 세 제품·아홉 portfolio·Ledger 공통 plane | `ACCEPT` |
| Linear Official Task SoR, reference-in-place, 4192 read-only, five-owner | `ACCEPT` |
| 현재 문서의 LR0 종료·LR1 준비 주장 | `REVISE` |
| 전사 단일 Event SQLite, 자동 RAG, Process Mining/학습 export | `HOLD` |

채택한 보정은 Ledger Catalog taxonomy, case/activity issuer, assignment/run refs, effective clock,
typed causal relations, owner-local outbox/reconciliation, scoped Event Store, project/common RAG·Dataset
격리, learning/people-analysis deny-by-default다. Sol 검토의 `pre-LR1` 목록 중 Catalog row 작성과
golden trace는 LR1의 산출물·종료조건이므로 LR0 진입조건으로 순환시키지 않는다.

## 28. 통합검토 순서 후보

1. Owner vision·현행 inventory·이 문서를 입력 packet으로 고정;
2. Ultra가 전체 portfolio, Ledger family, 사후분석·Process Mining·학습데이터, Agent 조직, Tool Workshop, 운영·배포·교육과 current path/TASK crosswalk를 통합;
3. Fable5가 장부 누락·중복·시간/case/activity/lineage 단절·RAG outbox/복구 gap·context/authority 혼입·migration 과잉을 독립 red-team;
4. 필요 시 public-safe packet으로 Pro가 외부 제품·명명·도입·교육 관점을 자문;
5. Owner가 전체 이름, `SF-Pxx` 범위, 업무형 이름과 판타지 label을 확정;
6. 그 뒤에만 tracked canon update와 실제 migration plan을 분리 수행.
