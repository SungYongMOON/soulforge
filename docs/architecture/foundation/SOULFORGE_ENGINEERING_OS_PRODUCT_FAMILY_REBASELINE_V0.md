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
│  ├─ <project_code>/              실제 프로젝트 source·Dataset·산출물
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
