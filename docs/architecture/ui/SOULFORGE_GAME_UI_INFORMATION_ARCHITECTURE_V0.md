# Soulforge Game UI Information Architecture v0

## 목적

Soulforge UI 는 현실 업무를 `Dungeon -> Stage/Floor -> Monster -> Mission -> Battle Log -> Artifact -> Promotion` 루프로 읽게 하는 Guild Master 작전판이다.

이 문서는 UI 코드를 더 만들기 전에 화면 목적, 정보 구조, read-only snapshot gate, 기존 `renderer-web` 재배치 방향을 고정한다.

## ASSUMPTIONS

- 현재 개발 우선순위는 `DEVELOPMENT_ROADMAP_V0.md` 의 `snapshot_to_operation_board_v0` 를 따른다.
- 새 앱을 만들지 않고, 기존 `ui-workspace/apps/renderer-web` 를 재구성한다.
- v0 UI 는 원본 `_workspaces`, `_workmeta`, `private-state`, raw mailbox, attachment, credential 을 직접 읽지 않고 sanitized snapshot 과 public-safe contract 만 소비한다.

## 한 줄 목적

Soulforge UI 의 한 줄 목적은 사용자가 파일트리를 외우지 않아도 오늘의 던전, 열린 몬스터, 준비된 미션, 막힌 조건, 다음 action 을 한 작전판에서 판단하게 하는 것이다.

## Main / Support 구분

### Main Screens

| Screen | 역할 | v0 데이터 입력 |
| --- | --- | --- |
| `Guild Hall` | 전체 운영 첫 화면. snapshot freshness, gateway 상태, 오늘의 next action, blocked lane 을 보여준다. | `soulforge_snapshot.json` summary |
| `Dungeon Map` | 프로젝트 던전들의 위치와 상태를 보여주는 중심 지도다. `_workspaces`, `_workmeta`, `.mission` 관계를 원본 대신 projection 으로 본다. | snapshot project / mission projection |
| `Dungeon Detail` | 한 project dungeon 의 stage/floor, boss clear 조건, open monster, artifact 상태를 본다. | snapshot + public-safe stage model |
| `Mission Board` | `.mission` 의 held plan, readiness, party/workflow binding, blocker 를 업무 단위로 본다. | `.mission` summary projection |
| `Monster Gate` | mail/manual/request 유입 후보를 monster encounter 로 staging 하고 dungeon assignment 상태를 본다. | gateway intake summary projection |

### Support Screens

| Screen | 역할 | v0 데이터 입력 |
| --- | --- | --- |
| `Battle Log` | mission 실행 결과와 terminal provenance pointer 를 읽는 회고/검증 surface 다. | battle event summary projection |
| `Bestiary` | monster family, monster type, spawn kind, encounter role 을 설명하는 catalog surface 다. | public workspace/gateway contracts |
| `Workshop` | 반복 성공, 자동화 후보, workflow/skill promotion candidate 를 재료로 모으는 surface 다. | promotion candidate summary |
| `Codex` | file browser/editor, canon 문서, schema, raw-ish tracked file 을 다루는 보조 도구다. | selected public/tracked files |
| `Diagnostics` | validate, snapshot freshness, docs link, fixture 상태를 보여주는 검증 surface 다. | validation outputs |

## Codex 보조 원칙

파일 브라우저와 editor 는 Soulforge UI 의 메인이 아니다.

- `Codex` 는 정본 파일을 찾아보고 수정하는 보조 도구다.
- 일반 사용자의 첫 화면은 editor 가 아니라 `Guild Hall` 또는 `Dungeon Map` 이어야 한다.
- editor 를 열어야 하는 상황은 "작전판에서 문제를 발견한 뒤 근거 파일을 확인하거나 고치는 경우" 로 제한한다.
- `Preview` 도 메인 화면이 아니라 renderer/fixture 소비층 점검 surface 로 둔다.

## Game Mapping

| 현실/구조 | UI 세계관 이름 | UI 의미 |
| --- | --- | --- |
| Project | `Dungeon` | 하나의 실제 과제/프로젝트 |
| Systems engineering phase / milestone | `Dungeon Stage` 또는 `Floor` | SRR, SFR, PDR 같은 체계공학 진행 층 |
| Stage completion condition | `Boss Clear` | 해당 stage 의 승인, 납품, gate evidence 완료 |
| 업무, 메일, 요청 | `Monster Encounter` | 처리해야 하는 일감 |
| Gateway intake | `Monster Gate` | 새 encounter 가 들어오는 관문 |
| Mission | `Quest / Mission` | monster 를 처리하기 위해 연 실행 계획 |
| Output / deliverable | `Artifact / Loot` | 산출물, 납품물, 갱신 결과 |
| 반복 성공한 절차 | `Skill / Workflow` | 재사용 가능한 공략법 |
| 자동화 후보 | `Workshop Material` | skill/workflow 승급 검토 재료 |
| Execution result | `Battle Log` | 작업 결과, provenance, 실패 원인 |

## Snapshot Freshness Gate

snapshot freshness 는 모든 UI 의 gate 다.

1. `Guild Hall` 과 `Dungeon Map` 은 freshness 상태를 화면 상단에 항상 표시한다.
2. `fresh` 가 아니면 UI 는 원본을 직접 읽어 보정하지 않는다.
3. `stale`, `missing`, `unavailable` 상태에서는 write action, mission close, promotion candidate 생성 같은 의미 있는 action 을 막거나 disabled 로 둔다.
4. stale 이유는 `Diagnostics` 로 보내되, 사용자가 어떤 source observation 이 바뀌었는지 알 수 있게 한다.
5. freshness 해결의 첫 action 은 snapshot 재생성 또는 snapshot check 이며, raw source 탐색이 아니다.

## Screen Roles

### Guild Hall

- 첫 진입점이다.
- 오늘의 snapshot 상태, gateway status, open dungeon count, blocked mission, next action 을 보여준다.
- 사용자가 "지금 어디를 봐야 하는가" 를 결정하게 한다.

### Dungeon Map

- UI 의 중심이다.
- project dungeon 을 카드나 2D 지도 node 로 보여주고, 각 dungeon 의 workspace/workmeta/mission presence 를 표시한다.
- v0 에서는 실제 파일 내용이 아니라 project code, presence, readiness, blocker count 같은 projection 만 보여준다.

### Dungeon Detail

- 선택한 dungeon 의 stage/floor 진행도를 보여준다.
- stage 별 open monster, boss clear 조건, artifact evidence, blocker 를 묶는다.
- v0 에서는 SE stage model 과 snapshot summary 를 연결하는 read-only view 로 시작한다.

### Mission Board

- `.mission` 을 사람이 읽는 board 로 보여준다.
- readiness, workflow/party binding, notification toggle 상태, terminal provenance pointer 를 노출한다.
- v0 에서는 mission draft 생성이나 close 는 하지 않고, read-only sorting/filtering 을 우선한다.

### Monster Gate

- gateway intake 와 manual input 후보를 monster encounter 로 보여준다.
- `assigned`, `partially_assigned`, `blocked` 를 구분한다.
- raw mailbox, attachment, credential 은 표시하지 않는다.

### Battle Log

- mission run 결과를 회고하는 surface 다.
- v0 에서는 raw run truth 를 직접 표시하지 않고, battle event id, result, blocker, artifact pointer 정도만 projection 한다.
- `Mission Close Provenance` 와 연결해 readiness terminal 상태가 근거를 갖는지 확인한다.

### Bestiary

- monster family/type catalog 를 읽는 설명 surface 다.
- spawn kind (`spawned`, `fixed`, `respawn`) 와 encounter role (`normal`, `elite`, `boss`) 을 사용자 언어로 설명한다.
- v0 에서는 분류 설명과 예시만 제공하고, 복잡한 레벨/희귀도 시스템은 만들지 않는다.

### Workshop

- 자동화 후보와 promotion candidate 를 모으는 surface 다.
- 반복된 battle success, manual intervention count, reusable workflow 후보를 material 로 보여준다.
- v0 에서는 후보를 읽는 데 집중하고 자동 승급은 하지 않는다.

### Codex

- 현재 control center 의 file tree/editor 를 흡수하는 보조 surface 다.
- owner file navigation, selected file editing, notification toggle 같은 작업은 Codex 안에 둔다.
- Codex 는 작전판의 원인을 추적하는 도구이지, 첫 화면이 아니다.

### Diagnostics

- validate, docs link check, snapshot freshness, fixture contract 상태를 한곳에서 보여준다.
- 실패는 action 의 blocker 로 표시하고, raw/private 내용을 노출하지 않는다.

## v0 Scope

v0 에서 만든다.

- `Guild Hall` 을 첫 화면 개념으로 고정한다.
- `Dungeon Map` 을 중심 화면으로 승격한다.
- `Dungeon Detail` 의 SE stage/floor read-only outline 을 만든다.
- `Mission Board`, `Monster Gate`, `Diagnostics` 를 snapshot projection 기반으로 정리한다.
- file browser/editor 를 `Codex` 로 이름과 위치를 낮춘다.
- snapshot freshness 가 모든 의미 있는 화면의 gate 라는 UI rule 을 적용한다.

## v1 이후로 미룬다

- 3D 던전 탐험 화면
- 실시간 자동 전투
- 복잡한 캐릭터 장비/경제/희귀도 시스템
- raw mailbox/thread/attachment browsing
- `_workspaces` 실제 파일 내용 indexing
- automatic mission close write-back
- automatic skill/workflow promotion
- 여러 프로젝트 동시 실시간 전투 연출

## Current renderer-web 재배치

기존 `renderer-web` 은 버리지 않는다. 역할을 아래처럼 재배치한다.

| 현재 요소 | 재배치 방향 |
| --- | --- |
| topbar `SOULFORGE Dashboard` | `Guild Hall` shell header 로 유지 |
| owner rail / file list / editor | `Codex` support screen 으로 이동 |
| current `Dungeon Map` pane | main `Dungeon Map` 으로 승격 |
| `Preview` pane | renderer/fixture 확인용 support screen 으로 유지 |
| `Diagnostics` pane | validation/snapshot gate surface 로 강화 |
| notification toggle pane | Mission Board 또는 Codex file-edit support 로 분리 |
| theme switcher | 2D operation board tone switch 로 유지하되 main IA 를 가리지 않게 축소 |

새 앱은 아직 만들지 않는다. 먼저 현재 app 의 route/pane vocabulary 를 `Guild Hall`, `Dungeon Map`, `Codex`, `Diagnostics` 중심으로 정리한다.

## 다음 구현 순서

1. `renderer-web` route vocabulary 를 `Guild Hall`, `Dungeon Map`, `Codex`, `Diagnostics` 로 재명명한다.
2. 첫 진입 route 를 editor 가 아니라 `Guild Hall` 로 바꾼다.
3. `Dungeon Map` 을 현재 snapshot pane 에서 main surface 로 올리고, freshness gate 를 상단 고정 요소로 만든다.
4. `Dungeon Detail` placeholder 를 stage/floor model 기반 read-only view 로 추가한다.
5. `Mission Board` 와 `Monster Gate` 를 snapshot projection cards 로 분리한다.
6. 기존 file editor 는 `Codex` route 아래로 이동하고, selected file editing 은 explicit action 으로 유지한다.
7. `Diagnostics` 에 `npm run validate`, `npm run validate:snapshot`, docs link check 결과를 같은 language 로 묶는다.

## Non-goals

- 이 문서는 새 schema 를 확정하지 않는다.
- 이 문서는 UI 코드 변경을 포함하지 않는다.
- 이 문서는 private runtime data 를 public fixture 로 승격하지 않는다.
