# Soulforge Project Map v0

## 목적

- 이 문서는 Soulforge를 다시 열었을 때 처음 읽는 한 장짜리 지도다.
- 목표는 파일트리를 외우지 않아도 현재 저장소의 owner, 역할, 다음 확인 위치를 빠르게 잡는 것이다.
- 상세 계약은 각 owner README와 architecture 문서가 계속 소유하고, 이 문서는 탐색용 index로만 둔다.

## 한 줄 요약

Soulforge는 현실 업무를 게임식 운영 루프로 바꾸기 위한 저장소다. 요청은 `monster`, 실행 계획은 `mission`, 반복 절차는 `workflow`, 실행자는 `unit`, 조합은 `party`, 실제 현장 데이터는 `_workspaces`, 프로젝트별 private 기억은 `_workmeta`, 공용 관문과 알림은 `guild_hall` 이 맡는다.

## 현재 루트 지도

```text
Soulforge/
├── .registry/       reusable canon store: species, classes, skills, tools, knowledge
├── .unit/           active unit owner: guild_master, vanguard_01, scribe_01
├── .workflow/       reusable procedure canon
├── .party/          reusable party templates
├── .mission/        held mission plans and readiness surfaces
├── guild_hall/      cross-project operations: gateway, notify, doctor, night_watch
├── _workspaces/     local-only project/dungeon materialization site
├── _workmeta/       nested private repo for project metadata and run truth
├── private-state/   nested private repo for selected continuity mirrors
├── docs/            root-owned public architecture documents
├── ui-workspace/    derived UI consumer workspace and control center shell
└── scripts/         root helper scripts
```

## 읽는 순서

처음 다시 잡을 때는 아래 순서만 보면 된다.

1. 이 문서: 전체 지도와 현재 판단
2. `README.md`: 정본 7축과 상위 문서 링크
3. `docs/architecture/foundation/VISION_AND_GOALS.md`: 왜 만드는지
4. `docs/architecture/Agent_Fantasy_Vision_Phases_WorldBible.md`: 업무 RPG 제품 감각
5. `guild_hall/README.md`: gateway, notify, night_watch 운영 루트
6. `ui-workspace/README.md`: 현재 UI consumer workspace
7. `_workspaces/README.md`: local-only 프로젝트 작업장 경계
8. `_workmeta/README.md`: private project metadata 경계

## Owner별 역할

| Owner | 사람이 기억할 이름 | 맡는 것 | 직접 넣지 않는 것 |
| --- | --- | --- | --- |
| `.registry` | 도감 / 창고 | species, class, skill, tool, knowledge canon | active runtime truth |
| `.unit` | 캐릭터 / 실행자 | unit identity, class/species binding, unit owner surface | project raw data |
| `.workflow` | 공략법 | 반복 가능한 절차 graph, slots, handoff | 특정 실행 결과 |
| `.party` | 파티 편성 | unit 조합 template, 허용 class/species/workflow | 실제 성능 log |
| `.mission` | 퀘스트 시트 | held mission plan, readiness, dispatch, resolved plan | raw run truth |
| `guild_hall` | 길드홀 / 관문 | gateway, town_crier, doctor, night_watch, assignment | project-local source data |
| `_workspaces` | 던전 현장 | 실제 프로젝트 파일과 산출물 | public tracked data |
| `_workmeta` | 던전 노트 | private project rules, reports, bindings, runs | public-safe canon |
| `private-state` | 운반용 기억 | selected continuity mirror | secret 값 |
| `ui-workspace` | 작전판 후보 | fixture-first UI, control center, renderer contract | canonical owner 대체 |

## 게임 루프 관점

```text
gateway/mail/manual input
  -> monster candidate
  -> dungeon/project assignment
  -> mission plan
  -> party/unit/workflow selection
  -> battle/run log
  -> artifact/output
  -> review
  -> promotion candidate
  -> skill/workflow/party canon
```

현재 저장소는 앞의 구조와 일부 gateway/intake/notify는 있다. 아직 약한 부분은 `monster -> mission -> battle log -> promotion` 을 한 화면에서 돌리는 실제 플레이 루프다.

## 현재 UI 상태

- `ui-workspace/` 는 이미 있다.
- 현재 UI는 fixture-first renderer와 control center에 가깝다.
- 실제 목표 UI는 파일 편집기보다 `Guild Master 작전판`이어야 한다.
- 가장 먼저 필요한 화면은 아래 4개다.
  - Today Board: 오늘 볼 monster, mission, blocker, next action
  - Dungeon Map: `_workspaces`, `_workmeta`, `.mission` 연결 지도
  - Gateway Status: intake inbox, notify, fetch health
  - Mission Sheet: mission readiness, party, workflow, output, next action

## 현재 gateway 상태

- 코드 owner: `guild_hall/gateway/`
- local runtime owner: `guild_hall/state/gateway/**`
- mail fetch capsule: `guild_hall/gateway/mail_fetch/`
- notify transport: `guild_hall/town_crier/`
- v0 의미: 메일/요청을 받아 monster 후보로 staging하는 관문이다.
- 아직 의미: OpenClaw bridge나 완성된 게임 UI gateway는 아니다.

## Local/private 경계

- `_workspaces/<project_code>/` 는 local-only 실제 프로젝트 현장이다.
- `_workmeta/<project_code>/` 는 nested private repo이며 project rules, bindings, reports, runs를 담는다.
- `private-state/` 는 selected continuity mirror다.
- public repo에 올리는 것은 구조, 코드, public-safe sample, architecture 문서만이다.
- secret 파일은 존재 여부만 확인하고 내용은 열지 않는다.

## 현재 샘플 던전 해석

- `P26-030` 은 처음 구조 검증에 쓴 예시 던전으로 본다.
- 이 예시는 meeting packet, post-record follow-up mission, project-local workflow 기록의 재료를 제공한다.
- 앞으로는 P26-030 자체를 계속 밀기보다, 여기서 배운 루프를 generic `monster -> mission -> battle log` vertical slice로 정리하는 편이 안전하다.

## 지금 부족한 것

| 부족한 것 | 왜 필요한가 | 낮은 위험의 첫 작업 |
| --- | --- | --- |
| snapshot processor | UI/OpenClaw가 원본을 직접 보지 않고 안전한 상태만 보게 하기 위해 | `soulforge_snapshot.json` schema 초안 |
| dungeon map | 폴더 구조를 사람이 외우지 않기 위해 | owner root와 project mount 요약 |
| monster board | 요청을 업무 RPG 단위로 보이게 하기 위해 | 수동 monster 1개 JSON |
| mission board | `.mission`과 `_workmeta` draft를 한눈에 보기 위해 | mission list projection |
| battle log | 작업 결과와 반복 근거를 남기기 위해 | 최소 event schema |
| promotion board | 반복 성공을 skill/workflow로 승격하기 위해 | candidate register projection |
| OpenClaw bridge | 별도 계정이 원본을 직접 만지지 않게 하기 위해 | read-only snapshot export |

## 하지 말 것

- OpenClaw 계정에 `_workspaces`, `_workmeta`, `private-state` 원본을 통째로 노출하지 않는다.
- UI가 canonical owner를 대체하게 만들지 않는다.
- P26-030의 업무 원문을 public 문서로 승격하지 않는다.
- class/species/world detail을 더 늘리기 전에 최소 플레이 루프를 먼저 만든다.

## 추천 다음 순서

1. 이 문서를 기준으로 현재 구조를 다시 익힌다.
2. `soulforge_snapshot.json`에 들어갈 필드만 정한다.
3. snapshot processor를 read-only로 만든다.
4. UI는 snapshot만 읽어 `Dungeon Map`과 `Mission Board`를 보여준다.
5. 수동 monster 1개를 만들어 `mission -> battle log` 까지 끝까지 돌려본다.

## 완료 기준

- 사용자가 파일트리를 외우지 않아도 현재 owner와 다음 action을 말할 수 있다.
- OpenClaw 같은 외부 host는 원본 repo 대신 sanitized snapshot을 읽는 방향으로 정해진다.
- 다음 개발이 gateway 확대가 아니라 `작전판 v0` 로 좁혀진다.
