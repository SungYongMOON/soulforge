# Development Roadmap v0

## 목적

- 이 문서는 Soulforge의 큰 개발 방향과 현재 우선순위를 한곳에 모으는 단일 정본이다.
- 앞으로 "무엇을 먼저 개발할까" 를 판단할 때는 이 문서를 먼저 읽는다.
- 구체화된 작업만 각 owner 문서, mission, workflow, UI plan, private worklog 로 내려보낸다.

## 운영 규칙

- 큰 방향, phase, active slice, 우선순위 변경은 이 문서에서 먼저 바꾼다.
- `PROJECT_MAP_V0.md` 는 탐색 지도이며, 개발 우선순위 정본을 중복 소유하지 않는다.
- `VISION_AND_GOALS.md` 는 북극성 문서이며, backlog 로 쓰지 않는다.
- `Agent_Fantasy_Vision_Phases_WorldBible.md` 는 제품 감각과 세계관 phase 를 설명하되, active development queue 는 이 문서가 소유한다.
- `.mission/**` 은 실행 계획과 readiness 를 소유한다. 큰 방향이 실제 실행 단위로 잘렸을 때만 mission 으로 내려간다.
- `ui-workspace/docs/**` 는 UI 구현 세부 계획을 소유한다. UI 전체 우선순위는 이 문서에서 먼저 정한다.
- `_workmeta/**` 는 project-local evidence, worklog, promotion candidate 를 소유한다. 큰 제품 방향을 `_workmeta` 에만 남기지 않는다.

## 현재 큰 방향

Soulforge는 현실 업무를 게임식 운영 루프로 바꾸는 시스템이다. 지금 개발의 중심은 세계관 확장이 아니라, 실제 하루 업무를 끝까지 굴릴 수 있는 작은 playable loop 를 만드는 것이다.

현재 큰 방향은 아래 하나다.

```text
read-only snapshot
  -> Dungeon Map
  -> Mission Board
  -> manual monster
  -> mission draft
  -> battle log
  -> promotion candidate
```

## 현재 phase

- 단계: playable vertical slice 이전
- 상태 해석: 구조와 세계관은 충분하지만, 한 화면에서 `monster -> mission -> battle log -> promotion` 을 돌리는 루프가 아직 얇다.
- 판단: gateway 확대, 세계관 detail, 자동화 승급, OpenClaw bridge 보다 read-only snapshot 과 작전판 v0 가 먼저다.

## SE assistant program direction

이 program lane 은 `snapshot_to_operation_board_v0` 를 대체하지 않는다. 현재 active slice 는 read-only snapshot 과 작전판 v0 로 유지하고, SE assistant 는 그 snapshot 이 안정된 뒤 project work 를 더 잘 굴리기 위한 후속 방향으로 둔다.

핵심 owner 분리:

- `se_foldertree_generate` 는 supported input matrix, dry-run, manifest/progress/index 생성만 담당하는 scaffold skill 로 고정한다.
- project-specific context, schedule, missing inputs, owner backlog, daily digest 는 `_workmeta/<project_code>/` 와 `.mission/<mission_id>/` 가 소유한다.
- reusable stage-aware procedure 는 `.workflow/` 로 올리고, cross-project advisory 와 야간 감시는 `guild_hall/night_watch` 로 붙인다.

추천 build order:

1. `se_foldertree_generate` 를 단순 scaffold skill 로 고정하고, business type / contractor / quality grade 별 supported input matrix 만 유지한다.
2. 폴더 생성 이후 owner 가 제공한 project brief, 설계 목적, 제약, source 위치를 `.mission` 후보와 `_workmeta/<project_code>/reports/**` evidence 로 묶는다.
3. official source intake, standards extraction, sufficiency review 를 묶어 stage 별 source/규격 packet 흐름을 먼저 안정화한다.
4. stage/gate 기준으로 필요한 설계지원 산출물, 필수 입력, owner 질문, blocker 를 정리하는 `se_stage_artifact_preparation` 계열 workflow 를 만든다.
5. draft packet, checklist seed, diagram handoff, traceability seed, review readiness digest 를 연결해 산출물 초안 준비와 누락 항목 경고를 분리된 workflow 로 만든다.
6. `guild_hall/night_watch` 는 active/blocked mission, owner 질문, source gap, promotion candidate 를 밤 사이 요약하는 advisory 로 붙이고, final readiness/승격 판정은 owner lane 에 남긴다.

SE assistant 불변 조건:

- 요구사항, 설계 수치, 검토 결론이 비어 있으면 추론으로 채우지 않고 owner question 또는 blocker 로 남긴다.
- 팀 템플릿 기반 draft 는 만들 수 있어도, source-backed required content 와 owner decision 이 없는 항목은 미완으로 표시한다.
- 산출물 본문 작성과 readiness 판정은 foldertree generator 안에 넣지 않고, 상위 workflow/mission orchestration 으로 분리한다.

`artifact` 의미:

- 문서 파일만 뜻하지 않는다.
- formal documents, diagrams, traceability matrices, analysis packets, review evidence, owner decision records, open question registers, verification planning artifacts 를 모두 포함한다.

first workflow posture:

- 첫 workflow 는 문서 작성기가 아니라 `design-support gap scan` 이다.
- 현재 stage 에서 필요한 문서, 도식, 분석, trace, review evidence 중 무엇이 있는지, 없는지, AI가 초안 가능한지, owner input이 필요한지 판정하는 데 집중한다.

## Active Slice 001

### 이름

`snapshot_to_operation_board_v0`

### 목표

- 파일트리와 private owner 경계를 사람이 외우지 않아도 현재 상태를 볼 수 있게 한다.
- UI 또는 외부 host 가 `_workspaces`, `_workmeta`, `private-state` 원본을 직접 훑지 않게 한다.
- `Guild Master 작전판` 의 첫 데이터 입력을 sanitized snapshot 으로 고정한다.

### 범위

1. `soulforge_snapshot.json` 필드 초안 작성
2. read-only snapshot processor 구현
3. snapshot fixture 또는 sample 추가
4. UI가 snapshot 만 읽는 `Dungeon Map` 초안 표시
5. `.mission` 과 `_workmeta` 요약을 연결하는 `Mission Board` 초안 표시

### 현재 구현 surface

- contract: `docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md`
- producer: `guild_hall/snapshot/`
- local output: `guild_hall/state/snapshot/soulforge_snapshot.json`
- validation: `npm run validate:snapshot`

### 범위 밖

- OpenClaw 직접 연결
- 완전 자동 전투
- 복수 프로젝트 동시 운영
- 정교한 종족, 직업, 경제, 레벨 시스템
- `_workspaces` 실제 파일 내용 indexing
- 메일 원문, attachment, token, credential 을 snapshot 에 포함

### 성공 기준

- 현재 repo owner root, private repo 존재, project code, mission summary, gateway status 를 한 JSON 에서 볼 수 있다.
- UI는 private 원본을 직접 읽지 않고 snapshot 만 읽는다.
- 사용자는 `Dungeon Map` 에서 어느 owner root 와 project surface 를 봐야 하는지 알 수 있다.
- 사용자는 `Mission Board` 에서 다음에 처리할 mission 후보와 blocker 를 볼 수 있다.

## 다음 후보

| 순서 | 후보 | 시작 조건 | 내려갈 owner |
| --- | --- | --- | --- |
| 1 | battle log 최소 event schema | snapshot board 에서 mission 후보가 보임 | `_workmeta`, `.mission`, `docs/architecture/workspace` |
| 2 | manual monster one-shot flow | mission board 에서 수동 candidate 를 만들 수 있음 | `guild_hall/gateway`, `.mission` |
| 3 | promotion candidate projection | battle log 가 최소 1건 남음 | `_workmeta`, `.registry`, `.workflow` |
| 4 | workflow evolution harness | B skill 같은 one-off reconstruction 에서 반복 절차와 fixture 후보가 보임 | `_workmeta/system`, `.workflow/authoring`, `.registry`, `.workflow` |
| 5 | OpenClaw snapshot bridge | snapshot 출력 경계가 안정됨 | `guild_hall`, external host setup |
| 6 | nightly sweep advisory | mission/battle log 상태가 안정됨 | `.mission`, `guild_hall/night_watch` |

## 구체화 규칙

큰 방향이 아래 조건을 만족하면 각 개발 항목으로 내려간다.

1. owner 가 분명하다.
2. 입력과 출력이 분명하다.
3. private/raw/secret 경계가 분명하다.
4. 완료 기준이 한 문장으로 적힌다.
5. 검증 방법이 있다.

내려가는 위치는 아래를 따른다.

| 구체화 대상 | 저장 위치 |
| --- | --- |
| 실제 실행 계획 | `.mission/<mission_id>/` |
| UI 구현 세부 | `ui-workspace/docs/` 또는 UI package 내부 |
| gateway 기능 세부 | `docs/architecture/guild_hall/`, `guild_hall/gateway/` |
| workspace/private data contract | `docs/architecture/workspace/` |
| project-local evidence | `_workmeta/<project_code>/reports/**` |
| reusable skill/workflow 후보 | `_workmeta/<project_code>/reports/procedure_capture/**` 에 먼저 기록 후 `.registry` 또는 `.workflow` 로 승격 |
| project 가 불명확한 workflow evolution 실험 | `_workmeta/system/reports/procedure_capture/workflow_evolution/**` 에 먼저 기록 후 public-safe 요약만 `.workflow/authoring` 으로 승격 |

## 현재 보류

- repo 3개 구조를 single private monorepo 로 통합하지 않는다.
- 팀원 공유를 고려해 public-safe core, owner private metadata, continuity state 분리 구조를 유지한다.
- OpenClaw 는 원본 repo 접근이 아니라 snapshot bridge 이후에 다시 판단한다.
- UI polish 보다 read-only data contract 를 먼저 잠근다.

## 갱신 규칙

- 큰 우선순위가 바뀌면 이 문서를 먼저 갱신한다.
- 이 문서가 바뀌면 관련 README 또는 project map 링크가 깨지지 않는지 확인한다.
- 구현 세부가 owner 문서로 내려간 뒤에는 이 문서에 세부 checklist 를 계속 복제하지 않는다.
- 완료된 slice 는 결과와 다음 후보만 남기고, 상세 기록은 해당 owner 문서나 `_workmeta` evidence 로 보낸다.
