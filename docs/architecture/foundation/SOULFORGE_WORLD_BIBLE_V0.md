# Soulforge World Bible v0

## 문서 상태

| 항목 | 값 |
| --- | --- |
| 상태 | `OWNER_WORLDVIEW_CAPTURE_DRAFT` |
| 기준일 | 2026-08-29 |
| 목적 | 기능별 문서 위에서 Soulforge의 철학·세계 법칙·영역·세력·명명·확장 규칙을 하나로 보존 |
| 이름 효력 | 모든 이름은 Owner 검토 전 후보 |
| 금지 | 실제 폴더·package·DB·TASK·route·runtime rename 또는 신규 조직 자동 생성 |

이 문서는 Soulforge를 기능 모음이 아니라 먼저 세계관으로 설계하기 위한 최상위 Owner 초안이다.
구체 제품·운영 구조는 [`SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md`](SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md)가
상세히 보조한다. 두 문서 모두 실제 migration 승인이나 완료 증거가 아니다.

## 1. 세계의 핵심 정의

> Soulforge는 현실에서 생긴 사건을 업무로 만들고, 사람과 AI가 Hero·Party처럼 수행하며,
> 결과와 경험을 다시 회사의 자산·지식·Skill·Agent 능력으로 제련하는 회사 운영 세계다.

```text
Soul
  사람과 AI Agent의 정체성·역할·능력·기억·경험

Forge
  사건을 업무로, 업무를 결과로, 결과를 경험으로,
  경험을 조직의 재사용 가능한 역량으로 제련하는 작동원리
```

Soulforge는 ERP·세계수·Engine·Task Engine·Chat 예약·Hermes·Buzz·MCP 중 하나가 아니다.
이 기관들이 source·자산·맥락·판단·업무·실행·수락·복구의 한 순환으로 연결된 전체 세계다.

## 2. 창세 순환

```text
현실 Source
  -> Event
  -> Work Candidate
  -> 사람 또는 exact policy 승인
  -> Monster / Official Task
  -> Project Dungeon에서 Hero·Agent·Party 수행
  -> Artifact·Dataset·Evidence
  -> independent review·technical acceptance·human acceptance
  -> Knowledge·Skill·Workflow·Agent Mark·World Tree·Backup으로 환류
```

이 순환의 목적은 AI로 일을 늘리는 것이 아니다. 반복업무·누락·재작업을 줄여 사람이
설계판단·현장·시험·팀 대화에 집중할 시간을 만드는 것이다.

## 3. 현실 업무와 판타지 표현

| 현실 | 판타지 표현 후보 |
| --- | --- |
| 현실 사건·요청·결함 | Monster 발생 징후 |
| Work Candidate | Monster 후보 |
| 승인된 Task | Monster |
| Project | Dungeon·Campaign |
| Stage·Gate | Stage·Boss Gate |
| 사람·AI Agent | Hero·Unit |
| Role | Class |
| Skill·Tool·Agent Mark | 능력·장비·세대 |
| Team | Party |
| Organization | Guild·Company·Order |
| 실행 | Battle |
| Artifact·Dataset | Loot·Artifact·Relic |
| Evidence·Receipt | Battle Log·Chronicle |
| Knowledge·Ontology | World Tree·Library |
| Operations Projection | Watchtower |

실제 데이터는 하나다. 업무 화면과 판타지 화면은 같은 Task·Asset·Agent·Event를 다른
렌즈로 보여준다. 판타지 UI가 별도 Task truth, 완료 상태, 점수 authority 또는 사람평가
정본을 만들지 않는다.

## 4. 세계의 불변 법칙

1. Event·Candidate·Official Task·Run·Result·Acceptance를 서로 대체하지 않는다.
2. Agent Done, delivery receipt, consumer acknowledgement, review, human acceptance와 Official Done을 분리한다.
3. 실제 byte, metadata, relation, revision, acceptance, backup owner를 구분한다.
4. Project Manager Agent와 Deep Context는 프로젝트별로 격리한다.
5. Portfolio는 raw project context가 아니라 typed state projection만 소비한다.
6. Agent Family·Mark·SOUL·Memory·Deployment·Run 계보를 보존하고 기존 Mark를 무음 덮어쓰지 않는다.
7. Tool PC와 license-bound Tool은 capacity·queue·lease·fencing·receipt가 있는 Workshop으로 운영한다.
8. AI는 준비·제안·수행·검증을 지원하지만 사람·예산·외부약속·기술수락·기준선의 최종 authority를 대체하지 않는다.
9. 특정 provider·Plugin·Buzz·Hermes·Linear가 사라져도 Task·Asset·Context·Agent 계보·receipt는 남아야 한다.
10. 모든 중요한 자산은 catalog·custody·revision·acceptance·protection·restore 상태를 가져야 한다.

## 5. 세계지도 — 논리 영역 초안

`SF-Pxx`는 검토 중 이름과 분리된 stable logical portfolio ID 후보다. 실제 폴더·TASK group을
만들지 않는다.

```text
Soulforge World
├─ SF-P01  현실에서 일을 태어나게 하는 영역
├─ SF-P02  업무와 실제 자산을 관리하는 영역
├─ SF-P03  세계 전체 상태를 관측하는 영역
├─ SF-P04  사람·AI 조직과 Agent 계보가 살아가는 영역
├─ SF-P05  Context·Ontology·Knowledge가 자라는 영역
├─ SF-P06  공학 판단 Engine들이 발전하는 영역
├─ SF-P07  전문 Tool과 공방이 일하는 영역
├─ SF-P08  세계를 보호·저장·복구하는 영역
└─ SF-P09  사람·PC·조직에 배포·교육·확산하는 영역
```

현재 업무형·판타지 이름 후보와 Interface는 제품군 재기준 문서 §25가 소유한다.

## 6. 세계의 세력과 조직

```text
Human Owner
  방향·권한·투자·사람·외부약속·최종수락

Development Team 1
  실제 프로젝트와 사람 조직, 첫 조직 pilot

AI Platform Organization
  ERP·Context·Engine·Agent·Runtime·Tool·Recovery 제품 공급

Project AI Organizations
  프로젝트별 Manager Agent·책임 Agent·Deep Context·Artifact·Acceptance

Common AI Workforce
  공통 PM·Source·Document·Data·Reviewer·Archivist·Operations 역할

Tool Workshops
  PowerPoint·Excel·HWPX·CAD·PCB·소나·시험·보관·복구 전문 Resource
```

조직명, 제품명, Module명, runtime명과 판타지 표시명을 섞지 않는다.

## 7. 등장인물·Agent·모델 명명 문법

| 대상 | 이름 문법 후보 |
| --- | --- |
| 세계·상위 브랜드 | `Soulforge` |
| 대형 프로젝트·영역 | 장소·기관·세력 이름 |
| 모델·지능 프로필 | 천체·자연 이름 — Sol·Terra·Luna 계열 |
| Agent 조직 | Guild·Company·Order·Fleet 계열 |
| 프로젝트 Agent | 프로젝트 고유 세력 + 역할 |
| Tool Workshop | 공방·제작소·연구소·세탁소·보관소 |
| 업무 | Monster·Quest·Mission |
| 프로젝트 | Dungeon·Campaign·Expedition |
| 산출물 | Artifact·Relic |
| 이력·증거 | Chronicle·Battle Log |
| 보안·복구 | Bastion·Citadel·Shield 계열 |

공식 업무명과 판타지 표시명을 함께 둘 수 있다. authority·DB·Interface는 업무형 이름과
stable ID를 사용하고 판타지 이름은 UI·스토리·팀 경험에 사용한다.

## 8. 세계의 자원과 경제

- 사람 시간·전문성·검토 capacity;
- Agent model·token·subscription·quality·latency;
- Tool PC·GPU·license·memory·single-active capacity;
- BOM·material·inventory·supplier·lead time;
- storage·network·backup·restore capacity;
- Context·Knowledge freshness와 사람 보정·재작업 비용.

공용 Resource는 무제한으로 간주하지 않는다. Queue·priority·lease·fencing·usage·cost·result
receipt로 운영하고, 비용은 `Cost / Human-Accepted Outcome`과 함께 본다.

## 9. 세계의 역사와 계보

Soulforge는 현재 상태만 보존하지 않는다.

- 결정이 언제 어떤 근거로 바뀌었는가;
- 어느 Agent Mark·SOUL·Memory generation·Tool·Engine version이 사용됐는가;
- 어떤 Project·Task·Artifact·Baseline·Release가 선행 revision을 대체했는가;
- 어떤 실패·incident·correction이 다음 Skill·Workflow·Mark를 만들었는가;
- 어떤 backup generation에서 exact state를 복구할 수 있는가.

게시일·사건일·source available 시각·관찰일·승인일·release일을 분리한다.

## 10. 새 개념을 추가하는 World Balance Review

앞으로 새 기능·Agent·Engine·Tool·Plugin·외부 기술을 설명할 때 해당 주제만 확대하지 않는다.
항상 다음을 함께 검토한다.

```text
새 개념
├─ 어느 SF-Pxx 영역에 속하는가
├─ 어떤 기존 영역이 영향을 받는가
├─ 어떤 Interface·owner·revision이 필요한가
├─ 전체 업무 순환에서 어디에 들어가는가
├─ 무엇을 대체하지 않는가
├─ 판타지 이름·상징이 기존 문법과 맞는가
├─ 보안·비용·backup·교육 영향은 무엇인가
└─ 전체 세계의 균형이 어떻게 변하는가
```

이 검토 없이 새 top-level 프로젝트, 제품명, Agent 조직, Folder, Engine 또는 자동 권한을 추가하지 않는다.

## 11. World Bible 권·장 구조

```text
Volume I    창세·철학·세계 법칙
Volume II   세계지도·대형 프로젝트·Interface
Volume III  사람·AI 조직·Agent·세력
Volume IV   Engine·Tool·Workshop·자원
Volume V    ERP·Asset·Context·Ontology·Knowledge
Volume VI   Event·Monster·Mission·Battle 운영
Volume VII  운영·유지보수·보안·복구
Volume VIII 배포·교육·개발1팀·전사 확산
Volume IX   역사·version·migration·chronicle
Volume X    현실 업무 ↔ 판타지 UI 대응표
```

## 12. 성용님과의 세계관 검토 방식

```text
Owner가 새 개념 설명
  -> 해당 개념을 bounded하게 정리
  -> 전체 World Map에 배치
  -> 다른 영역 영향·충돌 확인
  -> 전체 균형도와 이름 정합성 재제시
  -> Owner가 유지·수정·폐기 판단
  -> 승인된 내용만 canon·roadmap·migration에 반영
```

조사 초안 저장과 Owner 승인 이름·정본 승격을 분리한다.

## 13. 외부 검토 위치

- Pro 자문은 public-safe 초안의 외부 독자·제품·이름·사용성 관점 advisory다.
- Ultra·Fable5 검토 여부와 역할은 World Bible과 inventory가 충분히 정리된 뒤 Owner가 별도로 정한다.
- 어떤 외부 자문도 source truth, Owner 승인, 제품명 확정이나 canon promotion을 만들지 않는다.

## 14. 현재 다음 작업

1. `SF-P01~P09` 영역 자체가 맞는지 Owner와 검토;
2. 세계 철학과 이름 문법 확정;
3. 각 영역의 현행 Engine·앱·문서·TASK·폴더 inventory;
4. 대형 영역의 업무형 공식명과 판타지 이름 결정;
5. 각 영역의 서브프로젝트와 Interface 결정;
6. 실제 path·DB·runtime crosswalk와 migration dry-run;
7. World Bible 전체 균형 검토 뒤에만 rename·조직·배포 변경.
