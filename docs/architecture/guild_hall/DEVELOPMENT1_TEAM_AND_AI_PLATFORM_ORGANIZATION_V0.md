# 개발1팀 실행회사와 AI 기반시스템 개발회사 조직모델 v0

## 상태와 목적

이 문서는 한 명의 최상위 Owner가 서로 다른 두 회사형 AI 조직을 소유하는
사람용 조직모델과 운영 경계를 정의한다.

- 조직 A: 개발1팀 회사형 실행조직
- 조직 B: 개인 AI 기반시스템 개발회사

상태는 `canon_entry`다. Owner는 2026-07-30 두 조직·두 CEO 모델과 아래
권한 경계를 승인했다. 이 문서 자체는 stable route, runtime binding, Slack 조직,
default route 또는 automation을 자동 생성·활성화하지 않는다. 기존 프로젝트별
15개 책임 분야와 실제 프로젝트 TASK도 변경하지 않는다.

역할별 Codex 모델·추론 기본값, Ultra 심의, CEO delta 보고, 외부 조사·자문
지원 채널과 현재 활성 상태 `CODEX_NATIVE + NORMAL`은
`AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`를 따른다. 해당 정책은 조직
authority를 바꾸지 않으며, 외부 LLM 역할 대체와 토큰 부족 overlay는 별도
Owner 승인 전 비활성이다.

## 결정 배경과 적용 원칙

기존 Codex work directory는 `COMMON`, `PROJECTS`, `AX DEVELOPMENT`,
`ERP DEVELOPMENT`, `SYSTEM DEVELOPMENT`를 탐색 root 아래의 sibling branch로
분리한다. 이 구조는 domain authority가 서로 넘어가지 않게 하는 기계 라우팅
토폴로지로 유지한다.

사람에게 보이는 조직도는 이 다섯 branch를 다음 두 조직으로 묶어 설명한다.

- 개발1팀 회사형 실행조직: `COMMON` + `PROJECTS`
- 개인 AI 기반시스템 개발회사: `AX DEVELOPMENT` + `ERP DEVELOPMENT` +
  `SYSTEM DEVELOPMENT`

사람 조직도의 상하관계는 책임·보고·승인 관계를 설명한다. 기계 라우팅의
sibling 관계는 정확한 주소 선택과 fail-closed 경계를 설명한다. 어느 한쪽도
다른 쪽을 없애거나 암묵적으로 authority를 확대하지 않는다.

## 사람에게 보이는 전체 조직도

```text
최상위 Owner — 두 조직의 최종 방향·투자·사람·예산·외부약속·최종수락
│
├─ 조직 A: 개발1팀 회사형 실행조직
│  └─ 개발1팀 회사 CEO
│     ├─ 개발1팀 운영실
│     │  └─ [개발1팀 운영실] 업무운영/팀장
│     │     ├─ 업무기획·포트폴리오 운영
│     │     ├─ 인력·역량·온보딩 지원
│     │     ├─ 협업·회의·결정·공지 운영
│     │     ├─ 자료·지식·표준·업무개선
│     │     └─ 경영지원·구매·재고·업무환경
│     └─ 프로젝트 실행조직
│        ├─ [미할당 프로젝트] 업무운영/팀장
│        └─ 각 프로젝트 업무운영/팀장
│           └─ 기존 15개 책임 분야
│              └─ 결과물 단위 TASK 수행·검토·수락
│
└─ 조직 B: 개인 AI 기반시스템 개발회사
   └─ AI 기반시스템 회사 CEO
      ├─ AX 제품·책임공학 엔진
      │  └─ [AX] 총괄 CEO와 기존 AX 책임자
      ├─ ERP 제품·업무기록 플랫폼
      │  └─ [ERP] 개발 CEO
      └─ SYSTEM·에이전트 실행기반
         └─ [SYSTEM] 기능개발/팀장과 실행기반 책임
```

최상위 Owner는 사람이며 Codex task나 자동 라우팅 대상이 아니다. 두 회사 CEO는
Owner가 위임한 범위 안에서만 조직을 조정한다. 법인 대표권, 인사권, 지출권,
외부 약속과 최종 수락권은 위임 근거가 없으면 Owner에게 남는다.

## 역할·금지·보고관계

| 역할 | 책임 | 금지·경계 | 보고·협업 |
| --- | --- | --- | --- |
| 최상위 Owner | 두 조직의 방향, 투자, 사람, 예산, 외부 약속, 최종 수락과 위임 범위를 결정한다. 두 CEO 사이 충돌과 우선순위를 최종 판단한다. | 한 조직의 내부 제안이나 agent 성공을 다른 조직의 승인·수락으로 자동 간주하지 않는다. | 두 CEO에게서 결정 필요사항, 위험, 투자·사람·예산 요청과 수락 후보를 받는다. |
| 개발1팀 회사 CEO | 개발1팀 목표, 프로젝트 portfolio, 업무 우선순위 조정, 결과 통합, 조직 간 조정, blocker·충돌 에스컬레이션을 담당한다. | 프로젝트 분야별 기술 결과물을 대신 만들지 않는다. AI 기반시스템 제품 roadmap·구현 authority를 가져오지 않는다. 사람 관련 결정·인사·예산·구매·발주·외부 약속·전송·기준선·최종 수락을 암묵 승인으로 간주하거나 대리 행사하지 않는다. | Owner에게 유보 권한 판단을 요청한다. 운영실장과 프로젝트 manager에게 Owner 위임 범위 안의 실행 방향을 준다. |
| 개발1팀 운영실 업무운영/팀장 | 공통 intake, 정확한 owner 후보, portfolio·일정·capacity·blocker·결정·후속조치 통합, 운영 보고, 공용 협업공간·지식·자원 운영을 맡는다. | 개발1팀 회사 CEO가 아니다. 사람 배정·인사평가·프로젝트 기술판단·지출·외부전송·기준선·최종수락을 확정하지 않는다. | 개발1팀 회사 CEO에게 운영현황과 판단대기를 보고한다. 프로젝트 manager와는 운영정보·재분류·협업 관계다. |
| 미할당 프로젝트 manager | 프로젝트 후보, 사전 조사, 착수 대기, exact 귀속 미확정 업무를 임시 보관하고 인계 packet을 준비한다. | 회사 공통운영, 기반시스템 개발, 이미 배정된 프로젝트와 기술 기준선을 소유하지 않는다. identity 확정 전 15개 책임 lane을 만들지 않는다. | 개발1팀 회사 CEO와 운영실에 귀속 판단을 요청하고, 확정 뒤 해당 프로젝트 manager에게 인계한다. |
| 프로젝트 업무운영/팀장 | 프로젝트 목표·일정·위험·결과물, 15개 책임 분야의 단일 주관 후보, TASK gate와 검토·수락 증거를 통합하고 승인 요청·승인 결과 적용을 확인한다. | 개발1팀 공통운영이나 기반시스템 제품 roadmap을 소유하지 않는다. 사람·예산·대외약속과 최종수락은 승인 경계를 따른다. | 개발1팀 회사 CEO에게 성과·위험·결정 필요사항을 보고한다. 운영실에는 통합에 필요한 운영 metadata를 제공한다. |
| 프로젝트 15개 책임 분야와 TASK agent | 승인된 프로젝트 범위에서 분야별 결과물을 만들고 협업·독립검토·수락 역할을 분리한다. | 기존 프로젝트 조직 계약을 바꾸지 않는다. agent 완료나 파일 존재만으로 공식 완료를 주장하지 않는다. | 해당 프로젝트 manager에게 결과·증거·blocker를 반환한다. |
| AI 기반시스템 회사 CEO | 개발1팀과 개인 업무에서 들어온 기반기능 요구를 제품 portfolio로 분류하고 AX·ERP·SYSTEM 사이 업무 우선순위 조정, 결과 통합, 조직 간 조정, blocker·충돌 에스컬레이션을 담당한다. | 개발1팀 프로젝트 지휘, 프로젝트 기술수락을 하지 않는다. 사람 관련 결정·인사·예산·구매·발주·외부 약속·전송·기준선·최종 수락을 암묵 승인으로 간주하거나 대리 행사하지 않는다. AX·ERP·SYSTEM의 근거 없는 완료를 묶어 납품 완료로 만들지 않는다. | Owner에게 유보 권한 판단을 요청한다. 개발1팀 회사 CEO와는 고객사–공급사 인터페이스로 협업한다. |
| AX 총괄 CEO | AX 책임공학 엔진 제품축을 소유한다. accepted context 아래 업무·주관·협업·검토·agent 후보와 why·authority 근거를 다룬다. | AI 기반시스템 회사 전체 CEO가 아니다. 후보를 사람 승인으로 간주하거나 개발1팀 프로젝트를 직접 지휘하지 않는다. ERP·SYSTEM 제품 authority를 가져오지 않는다. | AI 기반시스템 회사 CEO에게 AX 제품 상태·위험·결정 필요사항을 보고한다. ERP·SYSTEM에는 제품 간 계약으로 요청한다. |
| ERP 개발 CEO | 승인된 업무·결정·증거·상태를 원자적으로 기록하고 조회·replay 가능한 업무기록 제품을 제공한다. | engineering judge, 프로젝트 귀속·담당·우선순위 결정자 또는 AX engine이 아니다. | AI 기반시스템 회사 CEO에게 저장·projection·무결성 상태를 보고하고 AX·SYSTEM과 데이터 계약으로 협업한다. |
| SYSTEM·에이전트 실행기반 책임 | provider/runtime, session·worktree, 실행환경, 관측성, 배포·복구와 공용 기반기능을 개발·운영한다. | engineering task의 목적·주관 책임자·프로젝트 수락을 결정하지 않는다. AX의 책임공학 판단과 프로젝트 기술결론을 대신하지 않는다. | AI 기반시스템 회사 CEO에게 가용성·incident·release·의존성 위험을 보고한다. AX가 선택한 실행 요구를 안전한 runtime으로 제공한다. |

AX의 에이전트 운영 책임과 SYSTEM 실행기반의 경계는 다음처럼 해석한다.

- AX: 어떤 engineering task에 어떤 capability·agent 후보가 적합한지와 실행
  의미·평가 기준을 다룬다.
- SYSTEM: 선택된 agent가 동작할 provider·runtime·session·worktree·관측·복구
  기반을 다룬다.

이 경계의 상세 제품 계약은 기존 AX·SYSTEM owner가 소유하며 이 문서에서
재정의하지 않는다.

## AI 기반시스템 회사 상향 결과보고 attribution 계약

AI 기반시스템 회사의 하위 책임 route가 상급 manager·CEO·Owner에게 업무 결과를
보고할 때는 통합 결론만 남기지 않고 실제 주관·수행·협업·검토·통합 기여를
구분한다. 이 계약은 AX·ERP·SYSTEM의 기존 제품 authority와 directory v1
topology를 바꾸지 않으며, 다음 필드를 모두 보존한다.

1. `report_item_or_result`: 보고 항목·결과와 `PASS`, `PARTIAL`, `HOLD`,
   `FAILED`, `UNKNOWN` 같은 실제 상태
2. `primary_owner`: 실제 주관 책임의 exact route/title 정확히 1개
3. `executor_or_agent`: 실제 수행 agent·모델·TASK·thread. 요청 모델과 실제
   관찰 모델을 구분하고, provider·모델을 관찰하지 못했으면 `UNKNOWN`
4. `collaborators`: 주관이 아닌 협업 책임·agent·TASK
5. `independent_reviewers`: 실제 독립검토가 있었을 때만 기록하는 검토 주체
6. `manager_or_ceo_contribution`: manager·CEO가 실제 수행한 분류·분장·통합·
   에스컬레이션
7. `source_result_validation_evidence`: source·result·validation·evidence의
   안전한 pointer와 각 상태
8. `owner_decision_or_cross_company_interface`: Owner 결정·승인 또는
   고객사–공급사 interface에서 필요한 다음 gate

운영 guard는 다음과 같다.

- CEO·manager는 하위 책임자나 agent의 실무를 자신이 수행한 것처럼 보고하지
  않는다. 책임 역할, 실제 수행 agent·모델, 독립검토자와 승인자를 섞지 않는다.
- `primary_owner`는 정확히 1개이며 나머지는 협업 또는 독립검토로 구분한다.
  manager·CEO 기여는 실제 분류·분장·통합·에스컬레이션으로 제한한다.
- subagent·CLI·provider worker가 수행했다면 요청 모델과 실제 관찰 모델을
  분리하고, 안전한 session/result digest 또는 evidence pointer를 남긴다.
- 자동 추정 attribution, 숨은 reasoning, credential, 원문·raw payload 노출을
  금지한다. 독립검토가 관찰되지 않았으면 검토자를 만들어내지 않는다.
- 실패·`PARTIAL`·`HOLD`도 같은 attribution shape와 실제 수행 주체, blocker를
  보존한다.

직접 적용 범위는 `[AX] 총괄 CEO`와 AX 하위 책임자·manager, `[ERP] 개발 CEO`와
ERP 하위 실행·관리 route, `[SYSTEM] 기능개발/팀장`과 에이전트 실행기반 route,
그리고 앞으로 승인되어 생기는 AI 기반시스템 회사 지속형 manager·책임 route다.
개발1팀 회사는 별도 회사이므로 이 직접 공지 범위에 포함하지 않는다. 다만 두
회사 사이의 고객사–공급사 결과보고에는 같은 attribution shape를 제공하여
공급사 주관·수행·검토·통합 기여와 개발1팀 사용수락, Owner 최종판단을 분리한다.

## 개발1팀 운영실의 다섯 portfolio

현재 COMMON의 일곱 책임은 폐기하지 않고 다음 다섯 사람이 보는 portfolio로
묶는다. portfolio는 사람 수, stable route 수 또는 상시 task 수를 뜻하지 않는다.

| portfolio | 현재 책임과의 연결 | 추가로 보강할 기능 | 승인 경계 |
| --- | --- | --- | --- |
| 업무기획·포트폴리오 운영 | 업무접수·분류 + 일정·일일업무·후속조치 | 목표·수요·capacity·프로젝트 간 충돌·운영위험·성과지표·개선 backlog | 최종 우선순위·사람 배정·프로젝트 시작·종료는 개발1팀 회사 CEO와 Owner 위임 경계 |
| 인력·역량·온보딩 지원 | 신규 지원 responsibility | 역량표, 교육·온보딩, 역할 준비도, 휴가·업무량으로 인한 가용성 신호 | 채용·평가·징계·보상·민감 인사정보 접근은 사람 Owner/승인 조직 |
| 협업·회의·결정·공지 운영 | Slack·협업공간 + 회의·결정기록 + 공지·대내소통 | provider 비종속 협업공간 규칙, 결정·후속 연결, 승인공지 배포 위치 | 게시 surface 관리자는 내용 승인자가 아님 |
| 자료·지식·표준·업무개선 | 자료·지식관리 | 공통 SOP·template·교훈·검색색인·반복 병목·운영개선 후보 | 프로젝트 기준선·기술진실·public canon 승격은 각 owner와 review gate |
| 경영지원·구매·재고·업무환경 | 구매·재고·업무환경 | 공용 예산·비용 후보, 공용 자산·도구·캐비닛·공간·운영연속성 이슈 | 발주·지출·예산증액·프로젝트 BOM 기술대체는 승인 owner |

초기에는 기존 `[공통업무] 업무운영/팀장` 하나가 다섯 portfolio를 책임 모자와
결과물 단위 TASK로 운영한다. 다음 gate가 모두 충족될 때만 별도 지속형
portfolio 책임자 task를 만든다.

1. 반복되는 독립 backlog가 있다.
2. 다른 portfolio와 분리할 custody·authority 경계가 있다.
3. 독립 보고 또는 검토가 지속적으로 필요하다.
4. 입력·출력·완료·중단조건을 고정할 수 있다.
5. Owner가 stable role과 task 생성을 승인했다.

## 두 조직 사이 고객사–공급사 인터페이스

두 조직은 상하 지휘관계가 아니다. 같은 Owner가 양쪽을 소유해도 한 조직의
승인이 다른 조직의 승인으로 자동 전이되지 않는다.

```text
개발1팀 요구
  → AI 기반시스템 회사 접수·수락/재분류
  → 제품축 개발·독립검증
  → 버전·증거가 있는 납품/제공
  → 개발1팀 사용 적합성 확인·수락
  → 운영 피드백·결함·변경요청
```

### 1. 요구

개발1팀 회사 CEO 또는 위임받은 프로젝트 manager가 최소 다음을 제공한다.

- 목적과 why-now
- 업무 owner와 요청 authority
- 필요한 기능·비기능 요구
- 입력·자료 위치와 공개·비공개 경계
- 희망 일정과 우선순위 근거
- 검증 방법과 개발1팀 수락 기준
- 외부전송·지출·secret·프로젝트 기준선 stop condition

### 2. 공급사 접수

AI 기반시스템 회사 CEO는 요청을 `수락`, `재분류 요청`, `추가정보 요청`,
`보류`, `거절` 중 하나로 반환한다. 수락 시 AX·ERP·SYSTEM 중 주관 제품축
하나, 협업·독립검토, 예상 결과물, 의존성과 납품 기준을 기록한다.

이 단계는 법률상 계약 체결을 뜻하지 않는다. 별도 외부 계약이 아니라 두 조직
사이의 내부 서비스 요청·수락 기준서다.

### 3. 개발·검증

공급 조직은 개발 결과와 함께 최소 다음 증거를 준비한다.

- 버전 또는 immutable revision
- 변경 범위
- acceptance 기준별 검증 결과
- 알려진 제한·운영조건·rollback
- private/raw/secret 비포함 확인
- 미해결 위험과 Owner 판단 항목

### 4. 납품·수락

AI 기반시스템 회사의 `제공 완료`와 개발1팀의 `사용 수락`은 분리한다.

- 공급 조직은 납품 packet과 증거를 제공한다.
- 개발1팀은 실제 업무 목적과 수락 기준에 맞는지 확인한다.
- Owner 유보 항목은 Owner가 최종 판단한다.
- agent success, commit, 파일 존재, 시연만으로 양쪽 완료를 동시에 주장하지
  않는다.

### 5. 피드백과 변경

운영 중 결함·요구변경·사용성 문제는 기존 납품의 thread 또는 lineage에
연결한다. 같은 요구를 중복 발행하지 않고, 범위·수락 기준이 달라질 때만 새
변경요청이나 TASK를 만든다.

### 데이터와 authority 경계

- 프로젝트 원문·기술 기준선·사람 업무 authority는 개발1팀 프로젝트 owner가
  유지한다.
- AX·ERP·SYSTEM source code·architecture·release authority는 AI 기반시스템
  제품 owner가 유지한다.
- 두 조직 사이에는 필요한 최소 metadata와 승인된 pointer만 전달한다.
- secret, 메일·Slack 원문, 개인정보와 private payload를 공용 public 문서나
  route title에 복사하지 않는다.

## 기계 라우팅 topology와 사람 조직도의 공존

기계 directory의 고정 branch는 그대로 유지한다.

```text
navigation root (authority 없음)
├─ COMMON
├─ PROJECTS
├─ AX DEVELOPMENT
├─ ERP DEVELOPMENT
└─ SYSTEM DEVELOPMENT
```

사람 조직도는 위 branch를 두 조직으로 묶는 read-only projection이다.

| 사람 조직 | 기계 branch |
| --- | --- |
| 개발1팀 회사형 실행조직 | `COMMON`, `PROJECTS` |
| AI 기반시스템 개발회사 | `AX DEVELOPMENT`, `ERP DEVELOPMENT`, `SYSTEM DEVELOPMENT` |

공존 원칙:

1. 최상위 Owner와 두 회사 grouping은 navigation·governance projection이며
   자동 send target이 아니다.
2. 현행 route catalog v1은 정확히 다섯 branch만 허용하고
   `manager_route_id`도 같은 branch 안에서만 허용한다. 따라서 두 회사 CEO를
   기존 v1 catalog의 cross-branch parent로 억지 등록하지 않는다.
3. 같은 v1 branch 안의 기존 보고관계만 private stable catalog의
   `manager_route_id`로 표현한다. 여러 branch를 묶는 CEO governance는 별도
   승인된 governance overlay와 authority ref로 표현해야 한다.
4. 조직을 넘는 요청은 고객사–공급사 관계 metadata와 기존 협업·검토·재분류
   요청 의미를 함께 보존한다.
5. exact unique route와 active binding이 없으면 자동 전달하지 않는다.
6. 사람 조직도는 route, TASK 상태, runtime readiness를 만들어내지 않는다.

### CEO task와 directory v1의 단계적 공존

두 CEO task를 실제로 만들더라도 현행 v1이 cross-branch governance를 표현할 수
없는 동안에는 다음처럼 제한한다.

1. 사람용 task와 승인된 private address-book pointer만 만든다.
2. 자동 route와 `execution_ready`는 활성화하지 않는다.
3. Owner 또는 검증된 현행 manager가 exact task를 명시한 요청만 전달한다.
4. CEO가 받은 결과를 기존 branch의 domain authority로 승격하지 않는다.
5. 다음 중 하나가 승인·검증된 뒤에만 자동 routing을 검토한다.
   - route catalog v2의 별도 governance-route/organization-group 계약
   - v1 domain catalog와 분리된 read-only governance binding 계약

권장 방향은 다섯 domain branch를 그대로 두고, 그 위에
`organization_group_id`, `ceo_coordination_route`, `member_branch_ids`,
`owner_authority_ref`를 갖는 별도 governance overlay를 두는 것이다. 이 overlay는
domain manager hierarchy나 resolver 기본값을 바꾸지 않고, exact CEO coordination
route만 제공해야 한다. schema·validator·writer owner가 없는 상태에서는 실제
파일명이나 값을 임의로 만들지 않는다.

## 기존 task 재사용과 신규 CEO task gate

### 재사용

- 현재 `[공통업무] 업무운영/팀장`은 개발1팀 회사 CEO로 승격하지 않는다.
  개발1팀 운영실장·운영조정자로 그대로 재사용한다.
- 표시명을 바꾸기로 승인하면 기존 task를 유지한 채
  `[개발1팀 운영실] 업무운영/팀장`으로 rename한다. 새 동일 task를 만들지 않는다.
- 기존 프로젝트 manager, `[미할당 프로젝트]`, 프로젝트 15개 책임자와 TASK는
  그대로 둔다.
- 기존 `[AX] 총괄 CEO`는 AX 제품축 CEO로 유지한다. AI 기반시스템 회사 CEO로
  rename하거나 겸임시키지 않는다.
- `[ERP] 개발 CEO`, `[SYSTEM] 기능개발/팀장`과 기존 AX 책임자도 그대로
  재사용한다.

### 개발1팀 회사 CEO 신규 task gate

다음 조건이 모두 충족되면 별도 지속형 CEO task가 필요하다.

1. 여러 프로젝트와 운영실 사이 우선순위·capacity·착수·수락 조정을 반복한다.
2. Owner가 위임할 결정 범위와 Owner 유보 범위를 문서로 구분한다.
3. 입력 보고, 결정 packet, 산출 보고와 escalation 기준을 고정한다.
4. 운영실과 프로젝트 manager의 authority를 가져오지 않는 경계를 검증한다.
5. exact title, private address-book owner와 CEO governance binding 계획이
   준비된다.

사용자가 별도 CEO 역할을 확정했고 위 기능은 기존 운영실과 다른 지속 책임이므로
조직모델상 `필요 후보`다. 실제 task 생성은 authority packet과 address-book
gate 승인 뒤에만 하며, governance overlay 전에는 자동 route를 활성화하지 않는다.

### AI 기반시스템 회사 CEO 신규 task gate

다음 조건이 모두 충족되면 별도 지속형 CEO task가 필요하다.

1. AX·ERP·SYSTEM 세 제품축의 요구·우선순위·통합 납품을 반복 조정한다.
2. 기존 AX 총괄 CEO와 구분되는 제품 portfolio authority를 고정한다.
3. 개발1팀 고객요구 접수, 공급 수락, 검증, 납품, 피드백 interface를 소유한다.
4. Owner 유보 권한과 제품축별 독립 authority를 침범하지 않는다.
5. exact title, private address-book owner와 CEO governance binding 계획이
   준비된다.

이 기능은 기존 AX CEO가 소유하지 않으므로 별도 CEO task로 운영한다. task
생성·검증은 같은 gate를 적용하며, governance overlay 전에는 자동 route를
활성화하지 않는다.

## 정본과 thread-manager의 적용 범위

### public 적용

1. 이 문서를 승인된 `canon_entry` 조직 계약으로 등록한다.
2. `COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`
   - COMMON을 개발1팀 운영실로 설명한다.
   - 다섯 portfolio와 개발1팀 회사 CEO 보고 경계를 연결한다.
3. `CODEX_WORK_DIRECTORY_V1.md`
   - 고정 다섯 branch는 유지한다.
   - 두 회사형 human projection과 두 CEO가 navigation root를 대체하지 않는
     경계를 추가한다.
4. 별도 governance overlay 계약 또는 route catalog v2 향후 변경
   - 두 CEO와 member branch grouping을 v1 `manager_route_id`와 분리한다.
   - exact CEO coordination route, Owner authority ref, fail-closed를 정의한다.
   - owner가 이 구조 변경을 별도로 승인하기 전에는
     `HOLD/non-routable`로 둔다.
5. `.workflow/codex_thread_manager_v0/**`
   - 승인된 CEO 역할의 create·rollover·retire와 exact title 검증
   - 같은 조직 내부 보고와 두 조직 간 고객사–공급사 요청 metadata 보존
   - ambiguous·stale·unbound CEO route의 fail-closed
6. canonical/installed `soulforge-codex-thread-manager`
   - workflow 변경이 승인된 뒤 같은 revision으로 동기화·검증한다.
7. 관련 README, validator, `CHANGELOG.md`
   - 구조·표시·검증 표면을 같은 변경에서 동기화한다.

기존 `PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`의 15개 책임과 프로젝트
TASK 규칙은 변경하지 않는다. AX·ERP·SYSTEM architecture 정본도 이 문서에서
재정의하지 않고 최소 참조만 둔다.

### private/local 적용 상태

- 승인된 private address book의 두 CEO exact task pointer
- 별도 승인된 governance overlay의 두 CEO coordination binding과 rollover history
- 기존 v1 stable route catalog와 live binding은 domain route 정본으로 유지
- 실제 사람용 조직도 projection
- Owner 위임·유보 authority pointer
- 기존 task 표시명 변경 이력
- 고객사–공급사 요청·납품·수락 packet의 private metadata

실제 사람 이름, thread id, runtime binding, 업무·자료 원문은 public 문서에
기록하지 않는다. private writer와 정확한 저장 owner가 관찰되지 않으면 임의로
파일을 만들지 않고 `HOLD`한다.

## migration 실행 순서

1. **Owner 승인 — 완료**
   - Owner가 두 CEO의 역할명, 위임·유보 권한, 다섯 portfolio와
     고객사–공급사 interface를 승인했다.
2. **public 계약 보정**
   - 최신 main의 별도 검증 가능한 변경면에서 문서·workflow·validator를
     최소 수정한다.
3. **독립 검토**
   - 기존 project authority, AX·ERP·SYSTEM authority, public/private 경계와
     fail-closed를 fresh review한다.
4. **private route 계획**
   - 현행 v1 catalog에는 두 CEO를 cross-branch parent로 추가하지 않는다.
   - private address-book pointer와 governance overlay 후보는 계약·validator가
     생길 때까지 `HOLD/non-routable`로 두고, 이후 검증을 통과시킨다.
5. **CEO task 순차 생성**
   - 개발1팀 회사 CEO를 먼저 만들고 binding·보고관계를 확인한다.
   - 다음으로 AI 기반시스템 회사 CEO를 만들고 AX·ERP·SYSTEM 연결을 확인한다.
   - 같은 순간에 두 task를 일괄 생성하지 않는다.
   - governance overlay 전에는 두 task 모두 명시적 요청 전용이며 자동 routing은
     `HOLD`한다.
6. **기존 task 재연결**
   - 공통업무 task는 같은 ID로 운영실 역할을 유지한다.
   - AX CEO는 AX 제품축으로 유지하고 두 CEO와 중복 생성·rename하지 않는다.
7. **사람 조직도·주소록 갱신**
   - actual task·route·binding 검증이 끝난 항목만 표시한다.
8. **한 건 shadow pilot**
   - 개발1팀 요구 한 건을 공급사 접수→개발·검증→납품→사용수락까지
     외부전송 없이 시험한다.
9. **활성 판정**
   - 중복·misroute·authority 혼선이 없고 검증이 통과할 때만 active routing과
     전 조직 배포를 검토한다.
10. **commit·push**
    - fresh acceptance가 끝난 변경만 non-force로 main에 반영한다.

## 중복·권한혼선 방지

- `개발1팀 회사 CEO`와 `개발1팀 운영실 업무운영/팀장`을 같은 task로 만들지
  않는다.
- `AI 기반시스템 회사 CEO`와 `[AX] 총괄 CEO`를 같은 task로 만들거나 rename하지
  않는다.
- 사람 조직명, stable route, live binding, TASK, agent를 서로 같은 것으로
  취급하지 않는다.
- CEO가 결과를 통합해도 분야 owner의 기술진실, independent review와 수락 증거를
  대체하지 않는다.
- 두 조직의 같은 Owner를 이유로 자료·secret·승인 authority를 자동 공유하지
  않는다.
- 기존 프로젝트 TASK를 새 조직도에 맞추려고 복제·이동·재생성하지 않는다.
- cross-organization 요청에는 요청자, source authority, 주관, 협업·검토,
  acceptance owner와 stop condition을 함께 보존한다.

## 되돌림 조건과 방법

다음 중 하나가 발생하면 활성화를 중단하고 마지막 검증 상태로 되돌린다.

- CEO와 운영실 또는 AX CEO 사이 authority가 ambiguous하다.
- stable route·governance binding이 중복·stale·unknown이다.
- 프로젝트 업무가 기반시스템 조직으로 잘못 라우팅되거나 반대가 발생한다.
- private/raw/secret 또는 사람 정보가 public 조직도에 노출된다.
- 고객사 요구와 공급사 납품의 acceptance owner가 분리되지 않는다.
- validator 또는 fresh independent review가 실패한다.

되돌림은 다음 순서를 사용한다.

1. 새 CEO governance binding을 해당 계약이 정의한 비활성 상태로 내린다.
   계약이 아직 없으면 `HOLD/non-routable`로 표시하고 자동 route를 중지한다.
2. 사람용 projection을 기존 다섯 sibling view로 되돌린다.
3. 기존 프로젝트·COMMON·AX·ERP·SYSTEM task와 stable route는 유지한다.
4. 생성된 CEO task는 unique 업무·결정·handoff를 보존한 뒤에만 archive 후보로
   둔다.
5. force reset, task 삭제, branch 삭제, private evidence 삭제는 하지 않는다.

## 변경 전·후 쉬운 비교

| 구분 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 최상위 | navigation root만 보이고 사람 Owner가 조직도에 명시되지 않음 | 두 조직을 소유하는 최상위 Owner를 사람 governance에 명시 |
| 개발1팀 운영 | COMMON과 PROJECTS가 sibling이지만 회사형 실행조직으로 묶여 보이지 않음 | 개발1팀 회사 CEO 아래 운영실·미할당·프로젝트 실행조직으로 표시 |
| 공통업무 manager | 팀장인지 CEO인지 혼동 가능 | 개발1팀 운영실장·운영조정자로 명확화 |
| 프로젝트 조직 | 프로젝트별 manager·15책임·TASK | 변경 없음 |
| 기반시스템 | AX·ERP·SYSTEM이 각각 sibling이고 전체 조정 owner가 없음 | AI 기반시스템 회사 CEO가 제품 portfolio·납품을 조정 |
| AX CEO | 전체 AX 관련 조직의 최상위처럼 보일 수 있음 | AX 제품·책임공학 엔진 축 CEO로 한정 |
| 두 조직 관계 | peer collaboration만 표현 | 고객사 요구→공급사 개발·검증→납품→수락·피드백을 명시 |
| 기계 라우팅 | 다섯 sibling branch | 그대로 유지 |
| 실제 task | 기존 task만 존재 | 승인·gate 전에는 변경 없음 |

## Owner 승인 상태

- 두 CEO의 정본·task 표시명은 우선 역할명으로 사용한다.
- 개발1팀 회사 CEO의 개인 한국 이름은 Slack 투표가 끝난 뒤 별도 작은
  change gate로 표시명만 보정한다.
- 두 CEO 권한은 조정·제안·통합·상태관리·에스컬레이션까지다.
- 사람 관련 결정, 인사, 예산, 구매·발주, 외부 약속·전송, 기준선과 최종
  수락은 Owner에게 유보한다.
- 다섯 개발1팀 운영 portfolio와 고객사–공급사 interface를 채택한다.
- 기존 공통업무 manager task는 같은 ID·이력을 유지한 채
  `[개발1팀 운영실] 업무운영/팀장`으로 표시명을 보정한다.
- CEO 자동 routing은 별도 governance overlay 또는 directory v2가
  승인·검증되기 전까지 `HOLD/non-routable`이다.

## 참조 정본

- `COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`
- `PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`
- `CODEX_WORK_DIRECTORY_V1.md`
- `../foundation/DEVELOPMENT_ROADMAP_V0.md`
- `../workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`
