# Mission Governance Packet: Promotion Rules Lock

## Phase

- `mission governance / 승격 규칙 잠금`

## 목적

- 이 문서는 `.mission/` owner-local 운영 문서로서, mission 승격 규칙을 잠그기 전에 무엇을 먼저 판정해야 하는지 정리하는 작업 패킷이다.
- 구조 정본을 바로 확정하는 문서가 아니라, 이미 잠긴 anchor 와 아직 draft 인 판단 항목을 분리하고 하위 작업 범위를 고정하는 데 목적이 있다.

## 이번 패킷이 다루는 범위

- mission 상태 축과 governance 승격 축을 섞지 않도록 분리 기준을 정리한다.
- `completed` sample 과 `blocked` sample 이 각각 무엇을 증명하는지 정리한다.
- `mission_check`, runner, future nightly sweep 사이의 readiness owner 경계 후보를 정리한다.
- manual mission 을 승격 후보로 올릴 때 필요한 최소 증거선을 정리한다.

## 이번 패킷이 다루지 않는 범위

- UI phase 선행 추진
- 지금 당장 `summary` 또는 종합 기능 구현
- `_workspaces/<project_code>/.project_agent/runs/<run_id>/` raw run truth 구조 변경
- `.workflow`, `.party`, `.unit`, `.registry` 의 owner 의미 재정의
- sample mission 추가 작성이나 현재 sample 의 readiness 상태 변경

## 고정 anchor

- Soulforge의 상위 흐름은 `reusable canon -> held mission -> project-local run truth` 로 고정돼 있다.
- `.mission/` 은 held mission plan 과 readiness owner 이고, raw execution truth owner 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 다.
- 수동 절차도 mission 이고 자동 절차도 mission 이다.
- `mission_check` 는 guild master / administrator lane 의 공식 readiness review skill 이다.
- runner 는 실행 직전 preflight 재확인자이지 readiness owner 가 아니다.
- `author_skill_package + guild_master_cell + guild_master` 조합은 current default 이지만, universal standard 로 잠기지는 않았다.
- sample mission 은 completed 와 blocked 를 함께 유지한다.

## 핵심 검토 가설

### 1. 상태와 승격은 다른 축이다

- readiness/status 축은 `draft`, `blocked`, `ready`, `running`, `completed`, `failed` 같은 mission 현재 상태를 뜻한다.
- governance/promotion 축은 `sample`, `current default`, `universal standard` 같은 운영 권위 수준을 뜻한다.
- 따라서 `completed` 라고 해서 곧바로 universal standard 가 되지 않으며, `blocked` 라고 해서 sample 가치가 사라지지도 않는다.

### 1-1. 승격은 단계형 gate 로 본다

- 어떤 lane 이나 package 를 만들었다고 곧바로 승격하지 않는다.
- 먼저 사람이 수동으로 써 본다.
- 그다음 자동 운영층에서 같은 종류의 mission 으로 다시 돌려 본다.
- 그 결과를 바탕으로 promotion level 이 기준 이상일 때만 다음 승격을 검토한다.
- 자동 운영층은 승격을 직접 수행하지 않는다.
- 자동 운영층은 나중에 만들 종합 기능이 참고할 수 있는 메타만 남길 수 있다.
- 실제 승격 판정과 실행은 상위 planner/owner 가 수동으로 한다.

### 2. blocked sample 도 governance 근거가 된다

- `author_hwpx_document_001` 는 historical success 가 있었지만 current mission standard 기준에서는 blocked sample 이다.
- 이 사례는 “무엇이 빠지면 현재 기준에서 막히는지”를 보여주는 음성 예시로 유지할 가치가 있다.

### 3. current default 와 universal standard 는 분리해야 한다

- current default 는 현재 운영상 가장 자연스러운 lane 이라는 뜻이다.
- universal standard 는 future path 전반에 일반화해도 되는 규칙이라는 뜻이다.
- 현재 sample 2건만으로는 universal standard 를 잠그기에 근거가 부족하다.

### 4. automation 은 mission 위의 운영층이다

- autohunt, nightly sweep, runner 는 mission 을 생성·검사·실행하는 operating layer 다.
- 이들은 mission owner 를 대체하지 않으며, readiness 최종 owner 를 runner 쪽으로 이동시키는 근거로 쓰지 않는다.

## 제안된 승격 사다리 초안

1. 만든다.
   - workflow, party, skill, mission surface 를 필요한 수준으로 만든다.
2. 수동으로 써 본다.
   - guild master lane 기준으로 실제 mission 을 손으로 수행해 본다.
3. 자동으로 다시 돌려 본다.
   - runner, autohunt, future nightly sweep 같은 운영층에서 같은 종류의 mission 을 재실행해 본다.
4. level 을 매긴다.
   - 성공 횟수만이 아니라 artifact split 충족, blocker 안정성, owner 경계 보존, 재실행 가능성을 함께 본다.
5. 기준 이상이면 승격 후보로 올린다.
   - 나중에 만들 종합 기능이 참고할 수 있는 상태/레벨 메타를 남긴다.
   - 실제 승격 여부는 사용자가 직접 판단한다.
6. 사용자가 수동으로 승격한다.
   - current default 로 올릴지
   - universal standard 로 잠글지
   - 혹은 아직 sample 로 둘지
   - 이 판정은 자동화하지 않는다.

## 이번 phase 초안 기준

### 1. mission level 초안

- `L0 / surface-recorded`
  - `mission.yaml`, `readiness.yaml`, `dispatch_request.yaml`, `resolved_plan.yaml` 이 있고, workflow / party / unit assignment 가 보인다.
- `L1 / artifact-backed`
  - `tracked_package_drafted`, `boundary_review_passed`, `install_sync_prepared` 가 pass 이고, blocker owner 가 mission surface 에서 드러난다.
- `L2 / current-lane-complete`
  - `resource_bundle_split_reviewed` 와 `smoke_recorded` 가 pass 이고, 현재 lane 이 요구하는 explicit artifact split 이 mission surface 에 기록돼 있다.
  - mission-surface blocker 가 없다.
- `L3 / promotion-review-ready`
  - `L2` 를 만족하고, 단일 historical success 를 넘는 반복 근거를 설명할 수 있다.
  - 수동 사용 기록, 자동 재실행 관찰, blocker 안정성 같은 메타가 나중에 owner review 에서 참조 가능해야 한다.

### 2. 승격 후보 최소 증거선 초안

- 아래는 승격 후보 검토에 올릴 수 있는 최소선이다.
  - mission surface 4종: `mission.yaml`, `readiness.yaml`, `dispatch_request.yaml`, `resolved_plan.yaml`
  - readiness 기본선: workflow / party / actor slot / unit assignment / tracked package draft 가 모두 pass
  - release 근거선: boundary review, install sync prep, smoke record 가 tracked surface 에서 확인 가능
  - current lane artifact split: lane 이 요구하는 explicit review artifacts 가 분리돼 기록됨
- historical success 가 있어도 current artifact split 이 없으면 승격 후보선 아래에 둔다.
- 따라서 현재 sample 기준으로 `author_pptx_autofill_conversion_001` 는 `L2` 근처, `author_hwpx_document_001` 는 `L1` 근처로 읽는 초안이 자연스럽다.

### 3. current default 와 universal standard 초안 분리

- `current default` 후보
  - active lane 에서 `L2` sample 이 최소 1건 있고 owner boundary 위반이 없다.
  - 다만 여전히 “현재 기본선”일 뿐 universal claim 은 하지 않는다.
- `universal standard` 후보
  - 단일 sample 이나 단일 historical success 로는 올리지 않는다.
  - 서로 다른 request shape 이나 lane variation 에서 반복 근거가 더 쌓여야 한다.
  - unresolved blocked-historical mismatch 를 가린 채로 잠그지 않는다.

### 4. future 종합 기능 계획 연결

- 무엇을 종합할지는 아직 잠그지 않는다.
- 다만 나중에 만들 종합 기능이 참고할 메타 아이디어는 owner-local note 로 미리 적어둘 수 있다.
- 현재 연결 문서는 [`FUTURE_AGGREGATION_PLAN.md`](/Users/seabotmoon-air/Workspace/Soulforge/.mission/FUTURE_AGGREGATION_PLAN.md) 이다.

## 이번 phase 에서 잠글 질문

1. mission 문서군에서 어떤 표현을 `sample`, `current default`, `universal standard` 로 구분할 것인가.
2. `수동 사용 완료 -> 자동 재실행 완료 -> level 기준 충족` 을 `승격 후보 등록` 기본선으로 잠글 것인가.
3. completed sample 이 current default 또는 universal standard 승격 후보가 되려면 level 을 어떤 항목으로 계산할 것인가.
4. blocked sample 중 어떤 것은 historical mismatch 로 유지하고, 어떤 것은 즉시 수정 대상으로 돌릴 것인가.
5. future nightly sweep 는 readiness 를 제안만 할 수 있는가, 아니면 특정 상태 전이까지 허용할 것인가.
6. 나중에 만들 종합 기능에서 mission level 표시 같은 아이디어를 어떤 메타로 남길 것인가.
7. manual mission 이 승격 후보가 되려면 어떤 public-safe artifact split 과 반복 증거를 최소 조건으로 볼 것인가.

## 하위 서브에이전트 작업 패킷

1. anchor 문서에서 `sample`, `current default`, `universal standard`, `blocked historical mismatch`, `readiness owner` 관련 문장을 근거표로 추출한다.
2. 두 축 모델 초안을 만든다.
   - 축 A: mission 현재 상태
   - 축 B: governance 권위 수준
3. `만듦 -> 수동 사용 -> 자동 재실행 -> level 판정 -> 승격 후보 등록 -> 수동 승격` 사다리 초안을 표로 정리한다.
4. sample mission 2건을 비교해 공통 필수 artifact 와 사례 특화 artifact 를 분리한다.
5. nightly sweep / runner / mission_check 의 allowed action 후보를 표로 정리한다.
6. 나중에 만들 종합 기능 계획 메모를 만든다.
   - 예: mission level 표시
   - 예: 승격 후보 여부 표시
7. 위 결과를 바탕으로 `DECISION_LOG` 에 올릴 수 있는 항목과 아직 `MISSION_MANUAL_DRAFT` 에만 둘 항목을 나눈다.

## 기대 산출물

- `승격 규칙 비교표`
- `수동 검증 -> 자동 검증 -> level 판정 -> 승격 후보 등록 -> 수동 승격 사다리표`
- `sample/current default/universal standard 표현 규칙 초안`
- `mission_check / runner / nightly sweep 경계표`
- `future 종합 기능 계획 메모`
- `sample mission 2건 비교 메모`

## 승인 기준

- owner 경계를 흐리지 않는다.
- `.mission` 안으로 raw run truth 나 local binding dump 를 끌어오지 않는다.
- current default 를 universal standard 로 과승격하지 않는다.
- completed 와 universal, blocked 와 invalid 를 같은 뜻으로 쓰지 않는다.
- 자동 운영층이 승격 authority 를 가진 것처럼 쓰지 않는다.
- 새 규칙이 `VISION_AND_GOALS.md` 의 비목표와 충돌하지 않는다.

## 우선 참고 문서

- [`docs/architecture/foundation/VISION_AND_GOALS.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/foundation/VISION_AND_GOALS.md)
- [`docs/architecture/foundation/REPOSITORY_PURPOSE.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/foundation/REPOSITORY_PURPOSE.md)
- [`docs/architecture/foundation/TARGET_TREE.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/foundation/TARGET_TREE.md)
- [`docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/foundation/DOCUMENT_OWNERSHIP.md)
- [`docs/architecture/workspace/MISSION_MODEL.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/MISSION_MODEL.md)
- [`docs/architecture/workspace/MISSION_MANUAL_DRAFT.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/MISSION_MANUAL_DRAFT.md)
- [`/Users/seabotmoon-air/Workspace/Soulforge/.mission/README.md`](/Users/seabotmoon-air/Workspace/Soulforge/.mission/README.md)
- [`/Users/seabotmoon-air/Workspace/Soulforge/.mission/DECISION_LOG.md`](/Users/seabotmoon-air/Workspace/Soulforge/.mission/DECISION_LOG.md)
- [`/Users/seabotmoon-air/Workspace/Soulforge/.mission/OPS_NOTES.md`](/Users/seabotmoon-air/Workspace/Soulforge/.mission/OPS_NOTES.md)

## ASSUMPTIONS

- 이번 packet 은 새 판단을 잠그는 최종 문서가 아니라, 잠글 판단 항목과 검토 범위를 먼저 고정하는 owner-local draft 로 둔다.
- 현재 sample mission 2건은 비교 기준으로 충분하지만 universal standard 확정 근거로는 충분하지 않다고 본다.
- 승격 최종 authority 는 자동 운영층이 아니라 이 상위 planner/user 쪽에 있다고 본다.
