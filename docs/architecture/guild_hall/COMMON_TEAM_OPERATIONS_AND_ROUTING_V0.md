# 회사·팀 운영 조직과 업무분장 v0

## 상태와 목적

이 문서는 프로젝트에 속하지 않는 팀 공통업무의 조직, 업무분장,
협업공간 운영과 조직 간 요청 경계를 정의하는 public-safe 운영 계약이다.
상태는 `canon_entry`이며, 실제 사람 직책·Slack 권한·안정 route·runtime
binding을 자동으로 만들거나 변경하지 않는다.

기존 stable branch id `COMMON`은 호환성을 위해 유지한다. 사람에게 보이는
대표 manager 명칭은 `[개발1팀 운영실] 업무운영/팀장`으로 사용한다. 이 역할은
`개발1팀 회사 CEO` 아래의 운영실장·운영조정자이며 CEO가 아니다. 실제 route
title과 runtime pointer는 승인된 private/local 주소록이 소유한다.

## 적용 범위

이 계약은 다음 업무에 적용한다.

- 프로젝트가 아직 확인되지 않은 업무·메일·파일·할 일의 접수와 재분류
- 팀 공통 Slack 협업공간, 공지, 질문·도움, 회의기록 운영
- 공통 자료·지식, 일일업무, 일정·후속조치, 공용 재고·업무환경 관리
- 프로젝트·AX·ERP·SYSTEM 사이의 협업·검토·재분류 요청 연결

다음 업무에는 적용하지 않는다.

- 프로젝트 기술 판단과 프로젝트별 원본·기준선 소유
- AX·ERP·SYSTEM 개발 방향과 구현 authority
- 회사 전체 인사·조직·경영 의사결정
- 외부 전송, 구매·지출, 계약·기준선·최종 수락·공개 승인

프로젝트 후보임은 확인됐지만 exact 프로젝트 귀속이 아직 정해지지 않은 업무는
`[미할당 프로젝트] 업무운영/팀장`에게 재분류 요청한다. 프로젝트 귀속이 확인된 업무는
`PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`에 따라 해당 프로젝트
총괄 CEO/업무운영·팀장에게 인계한다.

## 사람에게 보이는 조직도

```text
Soulforge 탐색 루트 — 조직 authority 없음
│
├─ 개발1팀 회사형 실행조직
│  ├─ 개발1팀 회사 CEO
│  └─ 개발1팀 운영실 (`COMMON`)
│     └─ [개발1팀 운영실] 업무운영/팀장
│        ├─ 업무기획·포트폴리오
│        ├─ 인력·역량·온보딩 지원
│        ├─ 협업·회의·결정·공지
│        ├─ 자료·지식·표준·업무개선
│        └─ 경영지원·구매·재고·업무환경
│
├─ 프로젝트 수행 (`PROJECTS`)
│  ├─ [미할당 프로젝트] 업무운영/팀장
│  └─ 각 확정 프로젝트 총괄 CEO/업무운영·팀장
│
├─ AX 개발 (`AX DEVELOPMENT`)
│  └─ [AX] 총괄 CEO
│
├─ ERP 개발 (`ERP DEVELOPMENT`)
│  └─ [ERP] 개발 CEO
│
└─ SYSTEM 개발 (`SYSTEM DEVELOPMENT`)
   └─ [SYSTEM] 기능개발/팀장
```

기계 directory의 `COMMON`, `PROJECTS`, `AX DEVELOPMENT`, `ERP DEVELOPMENT`,
`SYSTEM DEVELOPMENT`는 계속 sibling이다. 사람용 회사 grouping은
`DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`를 따르며 자동 route
authority를 만들지 않는다.

하위 책임 분야는 업무 분류 surface다. 실제 업무량이 작으면 한 사람이 여러
책임을 맡을 수 있고, 지속형 manager route나 별도 책임자 스레드는 owner가
필요성을 승인한 경우에만 등록한다.

## 역할과 경계

| 역할 | 맡는 업무 | 맡지 않는 업무·주요 인계 |
| --- | --- | --- |
| 팀 업무운영/팀장 | 팀 공통업무 목표·우선순위, 미분류 업무 1차 분류, 정확히 한 주관 책임자 지정안, 분야·조직 간 충돌 조정, 프로젝트/개발 branch 인계, 열린 조치·blocker 통합, 사람 owner 판단 요청 | 프로젝트 기술결론, AX·ERP·SYSTEM 구현, 사람의 최종 배정·외부 전송·구매·지출·공개·최종 수락을 대신하지 않는다. |
| 업무접수·분류 | `업무-미분류`와 공통 inbox를 확인하고 업무 목적·프로젝트 후보 여부·exact 프로젝트 귀속·주관 후보·근거·확신도를 기록한다. exact 프로젝트나 개발 branch가 확인되면 해당 manager에게 재분류 요청하고, 프로젝트 후보지만 exact 프로젝트가 미확정이면 미할당 프로젝트 manager에게 요청한다. | 담당 조직을 추정하거나 프로젝트 기술 판단을 하지 않는다. 공통업무인지 프로젝트 후보인지도 불명확하면 업무운영/팀장에게 반환한다. |
| Slack·협업공간 운영 | Slack section·채널 구조, 채널 목적, 제목·상태·thread 규칙, 중복 게시 점검, pinned 안내·색인·정리 후보, 질문·도움의 담당 route 연결을 관리한다. | 게시 내용의 기술·경영 판단을 대신하지 않는다. owner 승인 없이 권한 변경, 채널 삭제·archive, 외부 공개를 하지 않는다. |
| 회의·결정기록 | 회의 안건·사전 준비, 회의록, 확정·보류·추가자료, 담당·기한, 결정 근거와 후속조치 추적을 관리한다. | 회의에서 확정되지 않은 결정·담당·기한을 만들지 않고, 기술·계약·지출 결정을 대신 승인하지 않는다. |
| 자료·지식관리 | 공통 자료 위치·명명·metadata·검색성·보존·접근 경계, 자료공유 색인, 최신본·검토상태·근거 pointer를 관리한다. | 원문을 public canon에 복사하거나 기술 내용·기준선·지식 승격을 임의 승인하지 않는다. 프로젝트 자료는 해당 프로젝트 owner에게 인계한다. |
| 구매·재고·업무환경 | 공용 공구·소모품·비품의 구매 후보, 재고 위치·수량·상태, 입고·출고·반납, 업무공간·캐비닛 위치 정보를 관리한다. | 프로젝트 BOM·기술 대체품 판단, 공급자 품질 수락, 예산 증액, 발주·지출 승인을 대신하지 않는다. 프로젝트 귀속 자재는 프로젝트 구매·자재재고 책임자에게 인계한다. |
| 일정·일일업무·후속조치 | 팀 공통 일정, 일일·주간 업무 요약, 열린 조치, 기한·대기·blocker, 회신·후속조치 상태를 추적한다. | 근거 없이 완료·발송·승인 상태를 만들거나 사람 담당자·기한을 임의 확정하지 않는다. |
| 공지·대내소통 | 승인된 팀 지침·운영 변경·회의 공유·공지 후보를 정리하고 `전체공지`와 `업무-일반`의 게시 위치·중복·원문 링크를 관리한다. | 회사 정책이나 대외 발표를 단독 확정하지 않는다. 사람 owner가 승인하지 않은 공지·메시지·외부 전송을 실행하지 않는다. |

## Slack 협업공간 책임표

Slack의 section이나 채널은 조직이 아니라 업무를 담는 운영 surface다. 채널마다
별도 팀장을 만들지 않고 다음 주관 책임을 적용한다.

| Slack 공간 | 주관 책임 | 운영 기준 |
| --- | --- | --- |
| `업무-미분류` | 업무접수·분류 | 목적·귀속·주관 후보를 확인하고 exact route로 인계한다. |
| `업무-일반` | 팀 업무운영/팀장 | 프로젝트 하나에 속하지 않는 팀 공통업무와 열린 조치를 공유한다. |
| `자료공유` | 자료·지식관리 | 자료 자체를 복제하기보다 승인된 위치, 최신상태와 pointer를 남긴다. |
| `전체공지` | 공지·대내소통 | 사람 owner가 승인한 공지만 게시하고 기존 원문이 있으면 링크한다. |
| `질문`, `도움` | Slack·협업공간 운영 | 질문 내용의 owner를 찾아 연결하며 운영 책임자가 답을 지어내지 않는다. |
| `회의기록` | 회의·결정기록 | 회의 결과, 결정·보류, 담당·기한과 후속조치를 한 원 게시글의 thread로 추적한다. |
| 프로젝트별 채널 | 해당 프로젝트 업무운영/팀장 | 프로젝트 업무는 공통 채널에 중복 게시하지 않고 필요한 경우 원문 링크만 연결한다. |

## 업무분장과 조직 간 요청 규칙

1. 사람 owner의 현재 지시는 `owner 지시`로 기록한다.
2. 팀원이나 공통 inbox에서 처음 접수한 요청은
   `request_origin_relationship: common_intake_request`로 보존하고, 분장 뒤에는
   현재 `request_relationship`을 `internal_assignment` 또는 필요한 조직 간
   요청 관계로 별도 기록한다.
3. AX·ERP·SYSTEM·프로젝트 팀장과 팀 업무운영/팀장은 서로 동급
   branch owner다. 서로의 요청은 `협업 요청`, `검토 요청`, `재분류 요청` 중
   하나로 표시하며 상하관계의 지시로 해석하지 않는다.
4. 요청을 받은 owner는 자기 범위이면 `수락`하고, 범위 밖이면 수행하지 않고
   `사유 + 적절한 주관 후보`를 포함해 반환한다.
5. 한 업무의 주관 책임자는 정확히 한 역할이다. 다른 역할은 협업 또는 독립
   검토로 구분한다.
6. 프로젝트 후보임은 확인됐지만 exact 귀속이 미확정이면 미할당 프로젝트
   manager에게 재분류 요청하고, 귀속이 확인되면 exact 프로젝트 manager에게
   인계한다. 인계는 프로젝트 domain authority를 `COMMON`으로 가져오지 않는다.
7. 공통업무인지 프로젝트 업무인지, 또는 어느 개발 branch인지 불명확하면
   팀 업무운영/팀장이 분류안을 만들고 사람 owner에게 판단을 요청한다.
8. 수락·재분류는 실제 사람 배정, 외부 전송, 구매·지출, 기준선 변경, 공개,
   최종 수락·완료 승인을 자동 허가하지 않는다.

분장안의 최소 기록 형식은 다음과 같다.

```text
업무 → 요청 원천 관계 → 현재 요청 관계 → 업무 종류 → 주관 책임자 → 협업 → 독립 검토
     → 수락·재분류·에스컬레이션 → 근거 → 확신도 → TASK 판단
```

## TASK 운영

공통업무도 새 결과물, 다단계 실행, 지속 추적, 별도 검증·독립 검토·수락이
필요하면 별도 TASK를 만든다. 같은 목적·주관·범위·승인 경계 안의 작은 보완은
기존 TASK에 이어 기록한다.

TASK 시작 전에는 최소한 목적, 기대 결과물, 주관 책임자, 수행자 또는 에이전트,
협업, 독립 검토자, 수락·승인자, 입력과 저장 위치, 완료 기준·증거, owner 승인
경계와 중복 TASK 여부를 확인한다. 하나라도 안전하게 정할 수 없으면 만들거나
실행하지 않고 `확인대기` 또는 `HOLD`로 둔다.

TASK에는 다음 논리 역할을 구분한다.

- 책임 owner
- 수행자 또는 에이전트
- 독립 검토자
- 수락·승인자

프로젝트 TASK와 동일하게 시작·변경·완료 gate를 적용한다. 파일 존재, 메시지
작성, 에이전트 성공만으로 완료를 주장하지 않는다.

## 상급자 결과 보고 attribution

개발1팀 내부 공지는 개발1팀 회사가 자기 COMMON 운영실 manager와 프로젝트
manager에게 적용하는 별도 캠페인이다. 두 manager가 상급자에게 업무 결과를
보고할 때는 공유 `codex_thread_manager_v0`의
`upward_result_attribution_reporting_policy`가 정한 단일 8필드 shape를 그대로
사용한다. 팀장 자신의 통합 결과만 말하지 않고 실제 업무를 주관한 책임자,
수행 TASK·agent, 협업, 독립 검토와 팀장 기여를 분리한다.

개발1팀 표면의 `primary responsibility owner`는 canonical `primary_owner`,
`independent reviewer`는 `independent_reviewers`, `manager_contribution`은
`manager_or_ceo_contribution`의 표시명이다. TASK·thread·evidence pointer와
상태는 `source_result_validation_evidence`에, Owner 결정·승인 필요사항은
`owner_decision_or_cross_company_interface`에 기록한다. 이는 새 필드나
별도 schema를 정의하지 않는다. 팀장은 책임자가 한 실무를 자기 작업처럼
뭉뚱그리지 않으며, 책임자 역할명과 실제 수행 agent를 혼동하지 않는다.

내부 캠페인의 허용 수신자는 `[개발1팀 운영실] 업무운영/팀장`과 active·
`EXACT`로 해석된 프로젝트 manager뿐이며, `[미할당 프로젝트] 업무운영/팀장`도
active·`EXACT`일 때만 포함한다. 모든 수신 route는 private stable catalog와
live binding이 각각 `EXACT`로 일치하고 `execution_ready=true`여야 한다.
하나라도 없거나 불일치하면 공지는 `HOLD`한다. AI 기반시스템 회사 CEO와
AX·ERP·SYSTEM 제품조직은 이 개발1팀 내부 캠페인의 직접 수신자가 아니다.

사람 이름·민감정보보다 public-safe route/title과 근거 pointer를 우선한다.
관찰 근거 없이 attribution을 추정하지 않고, 확인되지 않은 값은 `미확정`으로
남긴다. primary는 정확히 하나이며 나머지 참여는 협업 또는 독립 검토다.

### Public-safe 적용 예시 — Workspace Board

| 보고 필드 | 기록 |
| --- | --- |
| `report_item_or_result` | Workspace Board Owner Action Inbox MVP |
| `primary_owner` (`primary responsibility owner`) | `[개발1팀 운영실] 전략기획·포트폴리오/책임자` |
| `executor_or_agent` | `[SYSTEM] Workspace Board MVP 구현/TASK` |
| `collaborators` | 미확정 |
| `independent_reviewers` (`independent reviewer`) | 구현 TASK·agent·fork가 아닌 fresh verifier |
| `manager_or_ceo_contribution` (`manager_contribution`) | 업무 분류, 주관·수행 분장, fresh review gate 설정, 결과 통합 |
| `source_result_validation_evidence` | `[SYSTEM] Workspace Board MVP 구현/TASK`; `CHANGELOG.md`의 `Workspace Board Owner Action Inbox MVP`; 구현 결과와 fresh review 근거를 분리해 기록, Owner 최종 수락 전 |
| `owner_decision_or_cross_company_interface` | Owner 최종 수락·state writer 연결·deploy는 `HOLD` |

이 예시는 실제 사람 이름, thread id, 로컬 절대 경로, private runtime 값을
공개하지 않으면서도 주관·수행·검토·통합을 서로 분리하는 보고 형태를 보여준다.
AI 기반시스템 회사가 개발1팀 manager에게 직접 공지하지 않는 경계와 두 회사의
고객사–공급사 interface도 변경하지 않는다.

## 사람 owner 승인 경계

다음은 팀 업무운영/팀장이나 하위 책임자가 자동으로 확정하지 않는다.

- 실제 사람 담당자와 우선순위의 최종 확정
- Slack·메일·외부 시스템 전송과 공식 약속
- 채널 권한 변경, 삭제·archive와 회사 전체 운영정책
- 구매·발주·지급·예산·계약 변경
- 프로젝트 기술 기준선, 공개, 최종 수락과 완료 승인

승인 근거가 없으면 `제안`, `검토 중`, `확인대기`까지만 표시한다.

## 공개·비공개 경계

- 이 문서에는 역할, 규칙과 합성 channel 이름만 둔다.
- 실제 사람, 업무, 메시지, 프로젝트 code, thread id, runtime binding과 근거는
  승인된 private/local owner surface가 소유한다.
- 메일·Slack 원문, 첨부, 개인정보, private payload와 secret을 public 문서나
  업무 제목에 복사하지 않는다.
- 이 문서만으로 조직 스레드, Slack 채널, TASK, automation, party 또는 default
  route를 만들지 않는다.
