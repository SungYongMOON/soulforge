# Soulforge World Bible v0

## 문서 상태

| 항목 | 값 |
| --- | --- |
| 상태 | `OWNER_WORLDVIEW_CAPTURE_DRAFT` |
| 기준일 | 2026-08-29 |
| 목적 | 기능별 문서 위에서 Soulforge의 철학·세계 법칙·영역·세력·명명·확장 규칙을 하나로 보존 |
| 이름 효력 | 부품 표시명(층 3)은 2026-09-03 Owner 확정(SHARED_GLOSSARY_V0.md §세계 이름). 출시 브랜드명·길드 계급명·팀 산출물 이름은 후보. 세계관 서술(0장 이하)은 검토 중 |
| 금지 | 실제 폴더·package·DB·TASK·route·runtime rename 또는 신규 조직 자동 생성 |
| 0장 상태 | `OWNER_REVIEW_DRAFT` (2026-09-05 추가) |

이 문서는 Soulforge를 기능 모음이 아니라 먼저 세계관으로 설계하기 위한 최상위 Owner 초안이다.
구체 제품·운영 구조는 [`SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md`](SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md)가
상세히 보조한다. 두 문서 모두 실제 migration 승인이나 완료 증거가 아니다.

## 0. 세계관 한 장 (Owner 검토 초안, 2026-09-05)

상태: Owner 검토 초안(OWNER_REVIEW_DRAFT), 2026-09-05. 외부 검토 EXT-16 반영 2026-09-05 밤.

### 1. 세계 — 대장간, 그리고 밀려오는 몬스터

Soulforge는 대장간이다. 밖에서는 몬스터(밖에서 오는 업무)가 파도처럼 계속 밀려온다. 대장간은 그 몬스터에 맞춰 무기를 계속 진화시켜 무찌른다. 무기는 도구·봇·절차·지식이고, 쓰고 나면 쌓인다. 쌓인 무기가 다음 파도를 더 쉽게 만든다. 이것이 세계의 순환이며 이름이 아니라 개념이다. 타워 디펜스에 가깝다.

대장간 안에서는 현실의 사건(Ore)이 지류(Tributary)를 타고 심재(Heartwood)에 주괴(Ingot)로 쌓이고, 화덕(Hearth)의 불과 풀무(Bellows)의 바람으로 길드(Guild)가 모루(Anvil) 위에서 망치(Hammer)를 휘둘러 무기를 벼린다. 담금질(Quench)과 언약(Covenant)이 그것을 단단하게 하고, 집게(Tongs)만이 뜨거운 것을 잡으며, 야경(Vigil)이 밤을 지키고, 성유물함(Reliquary)이 남는다. 세계수(World Tree)에는 벼려진 정본이 걸리고 아직 벼리는 것은 "검사 중"으로 보이기만 하며, 룬(Rune)은 무엇이 빠졌는지 판단한다.

두 층은 섞이지 않는다. 업무는 게임 층(몬스터·던전·배틀·배틀로그)으로 부르고, 시스템 부품은 대장간 층으로 부른다. 기술 식별자(포트·코드 이름·경로)는 이름이 아니라 주소이므로 첫 등장에 괄호로 한 번만 붙인다.

### 2. 시대 — Canto I · The Kindling (불 지피기)

- 시대는 제련 공정을 따라 셋이다. Canto I · The Kindling(불 지피기) → Canto II · The Forging(벼리기) → Canto III · The Tempering(담금질로 굳히기). 지금은 I이다.
- Kindling의 뜻: 불은 붙었으나 모루 위에 아직 정본 물건이 없다. 이 시대가 끝나는 조건은 첫 정본(Genesis) 1건과 팀원 2명이 각 한 바퀴를 돈 기록이다.
- 시대는 공정이고 보물은 레벨이다. 고정 이름(부품)은 멈추고 코드명만 바뀐다.

### 3. 보물 — Gram (0.1.x)

벼리고 있는 보물은 Soulforge 자신이다. Gram(0.1.x, 현재) → Gungnir(0.2.x) → Draupnir(0.3.x) → Mjölnir(0.4.x). 코드명은 CHANGELOG 제목과 Vigil 머리에만 쓴다. 출시 단위의 기능명은 "Soulforge Team Pilot 1"이며 브랜드명은 보류다.

### 4. 부품 — 앱과 모듈은 무엇인가

| 표시명 | 비유 | 실제(식별자, 바꾸지 않음) | 2026-09-05 상태 |
| --- | --- | --- | --- |
| World Tree | 세계수. 정본과 업무가 걸리는 나무 | ERP, 코드 `dev-erp`, 포트 4300 | 켜짐(0.1.7). 팀 비개방, Owner loopback |
| Rune | 룬. 규칙과 판단이 새겨진 글자 | Engineering Engine, `guild_hall/engineering_engine` | KVDS 7단계 판단 각 1회 |
| Guild | 길드. 사람과 봇의 조직 | `guild_hall`, 조직 문서 5종, Hermes 봇 | Hermes 프로필 다수(09-02 관측), 명부 0 |
| Ore | 광석. 원천 자료 원본 | source | 흘러드는 중 |
| Tributary | 지류. 광석을 실어 오는 물길 | 수집 lane 7(메일·음성·PC 파일·Codex 작업맥락·Slack·Linear·Buzz), `install/source-lanes` | 7줄기 흐름, Linear·Buzz 15분 |
| Ingot | 주괴. 굳혀 둔 사본 | custody | 쌓이는 중 |
| Heartwood | 심재. 무게를 견디는 비공개 창고 | private data root | 살아 있음 |
| Hearth | 화덕. AI 모델과 연산 | Codex·Claude·GPT·로컬 모델, Sol/Terra/Luna 등급 | 불 붙음 |
| Bellows | 풀무. 사람이 없어도 바람을 넣는 것 | 예약작업(schtasks) | 수집 예약작업 8종 09-03 관측 rc=0(plan 18 §13A·README 참조), 판본 혼재(0.1.7/0.1.6/v2/legacy 1) |
| Anvil | 모루. 형태를 정하는 받침, 곧 정본 | Covenant 뒤의 target `_workspaces`·`_workmeta` | 비어 있음. 새 정본면의 Genesis 수락 0건(기존 규칙·절차 정본 7축은 별개) |
| Hammer | 망치. 업무를 치는 엔진 | Task Engine | 있음. 한 바퀴 0 |
| Quench | 담금질. 검증과 검토 관문 | `validate:*`, `done:check`, review gate | Validate 초록(09-05) · 설치 팩 검사 미완 · 사람 수락 미완 |
| Covenant | 언약궤. 정본 승격 3규칙 | W-AUTH · Canonical Empty-State Genesis · Legacy Freeze | 채택 전 |
| Tongs | 집게. 뜨거운 것을 잡는 유일한 도구, MCP 문 | `dev-erp-mcp`(4311), `engineering_mcp` | 읽기 8·제출 6(plan 18 §5), 봇 경유만 |
| Vigil | 야경대. 감시면 | Board(포트 4192), `guild_hall/watchtower` 모듈 | 켜짐 |
| Sigil | 인장. 봇의 SOUL 스냅샷 | `hermes_profile_snapshot` | 코드만, 운영 전 |
| Reliquary | 성유물함. 백업 | `backup_controller`, N차 백업본 | Linear 1세대 수락, 1차 백업본 staged |

Guild(Agent Platform)의 실행 정체성은 Sigil로 특정하지만, 그것만으로 권한을 얻지는 않는다. 결과는 Quench를 거쳐 권한 있는 사람이 수락하며, 파일럿의 Linear Done은 사람이 처리한다.

### 5. 지금 상태 — 대장간의 밤

불은 붙었고, 일곱 지류가 심재로 흐르고, 풀무는 돈다. 성유물함에 1차 백업본이 들었으나 도장은 아직이다. 야경은 서 있다. 그러나 모루 위에는 아무 물건도 없고, 망치는 한 바퀴도 치지 않았으며, 담금질 첫 문은 열렸으나 팩 검사와 도장은 아직이고, 언약궤는 닫혀 있고, 길드에는 명부가 없다. 이것이 Canto I이다.

사다리: 1칸 Owner 한 바퀴 + 도장 2개 → 2칸 팀원 2명 각 1건 → 3칸 첫 정본(Genesis)·봇 명부·Reliquary 실동작·원격 Tongs.

### 6. 은퇴하는 말

- 은퇴하는 것은 기술 층의 표시어뿐이다: 4192, 상황판, Team Ops Board, ERP/dev-erp(표시), Task Engine, 수집 lane, MCP 문, 백업(표시), 3규칙, 예약작업(표시). 대조표대로 대장간 이름으로 바꾸고 첫 등장에 식별자를 괄호로 한 번 병기한다.
- 게임 층은 업무를 부르는 말로 남는다: 몬스터(외부 업무), 던전(프로젝트), 배틀(실행), 배틀로그(실행 기록). 기존 뜻 그대로이며 이 장은 새 뜻을 만들지 않는다. Quest·Boss·Reward처럼 뜻이 문서마다 달랐던 말은 Master Map M0의 보류(OWNER_DEFERRED)를 유지한다.
- 식별자(`guild_hall/gateway`, `night_watch`, `healer`, `town_crier`, `.party`, `.mission`, `.registry/species`·`classes`, 포트 4192, 코드 `dev-erp`)는 바꾸지 않는다.
- 유지하는 고유명: Soulforge, World Tree, Rune, Guild, Buzz, Hermes, Linear, Codex, Claude, GPT, Main Node, Universal Client, Team Pilot 1, NAS. 외부 제품·물리 노드·출시 기능명이다.
- CHANGELOG 과거 항목은 역사라 고치지 않는다.

### 7. 아직 이름이 없는 자리 — Owner 선택 (급하지 않음)

게임 층을 남기므로 새 이름이 필요한 자리는 둘뿐이고, 둘 다 한국어로 두어도 된다.

| 자리 | 지금 부르는 말 | 후보 (유래) | 비고 |
| --- | --- | --- | --- |
| 길드 계급 | 사람, 봇, 창구 봇 | Master(사람) · Journeyman(봇) · Apprentice(창구 봇). Owner 09-03 안 | 봇 명부의 판타지 별칭 자리 |
| 팀 산출물(제출물) | 산출물, 제출물 | Commission(길드에 들어온 주문; 라틴 committere) | 09-03에 나온 후보 |

결정 전에는 한국어 표기를 쓴다. 이 두 자리는 lane D를 막지 않는다.

### 8. 규칙 — 지침에 박을 문장

AGENTS.md "안전·저장 경계" 아래 한 줄: "문서·화면·예약작업 이름·CHANGELOG 제목·보고에는 `SHARED_GLOSSARY_V0.md` §세계 이름의 표시명을 쓴다. 은퇴한 표시어(같은 문서 §옛 표기 → 표시명 대조표)는 새로 쓰지 않는다. 파일·폴더·포트·스키마·예약작업 ID 같은 식별자는 바꾸지 않으며 첫 등장에 괄호로 한 번 병기한다."

같이 놓는 것: 용어집 §옛 표기 → 표시명 대조표(식별자 열 포함), README "Soulforge 한 장"을 §5 문장으로 교체, Master Map M0의 game-term 문단에 "업무는 게임 층, 부품은 대장간 층" 한 줄과 이 장으로 가는 포인터를 추가(OWNER_DEFERRED 항목은 그대로), 검사기 후보(문서 본문의 은퇴 표시어 검출, 식별자 문맥 예외)는 D-2에서.

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

Soulforge는 ERP·세계수·Rune·Hammer·Chat 예약·Hermes·Buzz·MCP 중 하나가 아니다.
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
| Operations Projection | Vigil |

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
