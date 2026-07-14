# 고성능 PC 할일 엔진·AX Workspace 실제 구축 마스터플랜 작성 프롬프트 V0

| 항목 | 내용 |
| --- | --- |
| 목적 | 비교 보고서가 아니라 Soulforge 할일 엔진과 AX Workspace를 실제로 완성하기 위한 구축 마스터플랜 작성 |
| 실행 위치 | 실제 구현 branch·코드·DB schema·저장 배치·PC 역할을 확인할 수 있는 고성능 PC |
| 출력 문서 | `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md` |
| 상태 | `owner_requested_execution_prompt` |
| 이번 실행 authority | 안전한 Git 동기화, 읽기 전용 현황 조사, public-safe 마스터플랜 1개 작성, 검증·독립 리뷰·scoped commit/push |
| 이번 실행 비권한 | 코드 구현, branch merge, DB·업무 데이터 변경, migration apply, 폴더 이동, writer/scanner/scheduler/network/alert 활성화 |
| 최종 중단선 | 마스터플랜을 `READY_FOR_OWNER_REVIEW` 또는 exact `BLOCKED`로 저장·업로드한 뒤 owner 승인 대기 |

이 문서는 기존 계획을 대체하거나 수정하지 않는다. 기존 계획과 비교 문서는 **입력·검증
oracle**이고, 새 출력 문서가 실제 구축을 지휘할 후보 마스터플랜이다. 고성능 PC는 하드웨어
작업 위치를 뜻할 뿐, 확인되지 않은 모델·reasoning effort·실행 profile 또는 `Ultra`를 뜻하지
않는다.

## 고성능 PC에서 입력할 짧은 지시

```text
$soulforge-github-down 을 사용해 Soulforge를 안전하게 최신화하고 이 PC의 실제 role/profile을
진단한 뒤, ui-workspace/apps/dev-erp/docs/
HIGH_PERFORMANCE_PC_TASK_ENGINE_BUILD_MASTER_PLAN_PROMPT_V0.md 를 처음부터 끝까지 읽고
그 지시를 수행해줘. 목표는 비교가 아니라 실제 구축 마스터플랜 작성이다. 이번 단계에서는
코드·DB·데이터·migration·운영을 변경하지 말고, 새 마스터플랜을 검증·업로드한 뒤 내 승인을
기다려줘. 확인할 수 없는 모델이나 실행 profile은 꾸며 말하지 마.
```

## 1. 최종 목표

최신 `main`, 고성능 PC의 구현 branch, 실제 public code, 허용된 범위의 DB schema·API·저장
owner·PC 역할을 먼저 읽기 전용으로 조사한다. 그 증거를 바탕으로 다음 시스템을 실제로
구축할 수 있는 master plan을 만든다.

> 메일·음성·SE 일정·파일·사람/Codex 지시에서 생긴 사건을 exact revision과 관계로 보존하고,
> 근거·권한·중단조건이 붙은 TaskDriver 후보로 만든다. 승인된 한 writer만 ERP task를 적용하고,
> 사람·각자의 Codex·workflow가 수행한 결과를 검증해 지식 후보와 다음 일 후보로 돌려보낸다.
> B9 장기 생명수와 ENGINE-12 일일 생명수는 같은 원장을 읽는 read-only projection으로 제공한다.

완료 조건은 비교표가 아니다. 출력 문서가 다음 질문에 답해야 한다.

1. 최종적으로 무엇을 만들 것인가?
2. 현재 구현 중 무엇을 그대로 쓰고, 고치고, 새로 만들고, 이관하고, 미룰 것인가?
3. 어떤 파일·module·table·API·event·folder를 어떤 순서로 변경할 것인가?
4. 각 slice는 무엇을 입력받아 무엇을 출력하고, 어떻게 검증·rollback할 것인가?
5. owner가 무엇을 결정하면 첫 구현 slice를 안전하게 시작할 수 있는가?

## 2. 이번 실행의 허용 범위와 금지선

### 허용

- `$soulforge-github-down`을 통한 safe fetch/pull, tracked skill sync, profile-scoped doctor
- public 문서·코드·테스트·remote branch의 읽기 전용 inspection
- 이미 유효하게 설정된 profile이 허용하는 metadata-only private inventory
- migration을 일으키지 않는 검증된 query-only DB schema·count·enum inspection
- 기존 문서의 exact commit/blob ref, command, exit, aggregate count, opaque ID/digest 기록
- 출력 마스터플랜 한 파일 작성
- post-development review, 문서 validator, `$soulforge-github-up` scoped commit/push
- metadata-only private review packet·upload receipt·5필드 기록

### 금지

- 기존 계획서, comparison oracle, ENGINE-12/13, roadmap, `SLICES_INDEX.md`를 함께 정리하거나 수정
- branch checkout·merge·rebase·cherry-pick, schema install, backfill, copy/rebuild, legacy 삭제
- 일반 app/server 또는 `openStore()`를 실행해 DB를 암묵적으로 열거나 migration하는 행위
- task/Driver/source/file/knowledge owner row 변경
- `_workspaces` materialization, junction/symlink/NAS/Drive 변경
- writer, reconciler, collector, scanner, scheduler, watchdog, alert, Tailscale, Telegram 활성화
- software 설치, credential 입력, secret·cookie·session·`.env` 내용 열람
- 실제 project name, mail title/body, transcript, filename, absolute/UNC path, hostname, account ID 출력
- public 문서나 `_workmeta`에 raw body·chunk·artifact·question·answer를 복사

이번 prompt는 고성능 PC를 `tool_pc`, `owner-with-state`, `always_on_node`, operational-primary로
새로 지정하는 bootstrap 권한이 아니다. 기존 local identity와 `$soulforge-github-down` 진단에서
확인된 role/profile만 사용한다. 확인되지 않으면 `public-only`로 계속하고 private evidence가
필요한 행만 `BLOCKED`로 남긴다. `public-only`에서는 companion 폴더가 보여도 `_workmeta`와
`private-state`를 열거나 Git inventory하지 않는다. 해당 결과는 `not_authorized` 또는
`not_applicable`로 닫는다.

## 3. 시작 절차: sync·role·worktree 안전성

1. root `AGENTS.md`와 실행 계약을 먼저 읽는다.
2. `$soulforge-github-down`을 실행한다.
3. **계획 문서 작성 worktree**가 `main`이고 clean인지 확인한다. 구현 branch를 checkout한
   worktree나 detached worktree에서는 출력 문서를 쓰지 않는다.
4. fetch 뒤 branch, HEAD, `origin/main`, ahead/behind, dirty state, detached 여부, conflict,
   `index.lock`, 다른 worktree와 allowed-file overlap을 확인한다.
5. 시작 상태가 clean·main인 `behind-only`이고 fast-forward 가능할 때만 skill 절차대로 갱신한다.
   갱신 뒤 `HEAD == origin/main`을 확인한 다음 문서 작성을 시작한다.
6. 시작 상태가 dirty/divergent/ahead/detached/conflict/overlap/non-main이거나, behind-only를 안전하게
   fast-forward한 뒤에도 `HEAD != origin/main`이면 `BLOCKED`로 중단한다. 이 prompt가 임의로
   checkout하거나 새 worktree를 만들거나 merge하지 않는다.
7. 유효한 local identity가 확인되면 observed role/profile을 기록한다. 폴더·hostname·성능으로
   role이나 authority를 추정하지 않는다.
8. 같은 물리 PC가 tool 작업과 24시간 운영을 겸해도 clone/worktree와 local identity가 분리돼
   있는지 확인한다. 없으면 운영 통합을 계획의 owner gate로 남긴다.
9. Windows PowerShell이면 canonical npm script는 유지하고 실행형만 `npm.cmd run ...`으로 쓴다.

최소 Git evidence:

```text
public HEAD / origin/main / branch / dirty count
관찰된 구현 branch ref와 merge-base
main...branch left/right count
immutable-oracle file blob IDs
commands actually run + exit status
```

구현 branch는 `git show`, `git diff`, `git grep` 등 ref-only 읽기 전용 방식으로 조사한다. 이
계획을 쓰기 위해 checkout이나 merge를 하지 않는다. 저장 단계의 Git 검증은 둘로 나눈다.

1. **commit 직전**: fetch하고 `branch=main`, `HEAD == origin/main`, 변경 파일이 허용된 계획 범위뿐인지
   확인한 뒤 그 `origin/main`을 `publish_base`로 기록한다.
2. **commit 뒤 push 직전**: 다시 fetch하고 `origin/main == publish_base`, clean index/worktree,
   `origin/main`이 `HEAD`의 조상인지 확인한다. `origin/main...HEAD`의 local-ahead가 이번 scoped
   commit뿐이고 remote-ahead는 0일 때만 일반 fast-forward push를 한다. 하나라도 다르면
   merge·rebase·force-push하지 말고 `BLOCKED`로 중단한다.

## 4. 불변 read order

다음 순서로 읽는다. 링크된 기존 파일은 이 실행에서 수정하지 않는다.

1. [`AGENTS.md`](../../../../AGENTS.md)
2. [`AGENT_EXECUTION_CONTRACT_V0.md`](../../../../docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md)
3. [`DEVELOPMENT_ROADMAP_V0.md`](../../../../docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md)
4. [`MULTI_PC_DEVELOPMENT_V0.md`](../../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
5. [`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`](../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md)
6. [`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../../../../docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)
7. [`ONTOLOGY_MODEL_V0.md`](../../../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md)
8. [`ONTOLOGY_RELATION_MATRIX_V1.md`](../../../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md)
9. [`PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md`](../../../../docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md)
10. [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
11. [`SE_ASSISTANT_OPERATING_MODEL_V0.md`](../../../../docs/architecture/workspace/SE_ASSISTANT_OPERATING_MODEL_V0.md)
12. [`TASK_ENGINE_CONTEXT_FOUNDATION_CROSS_VALIDATION_V0.md`](TASK_ENGINE_CONTEXT_FOUNDATION_CROSS_VALIDATION_V0.md)
13. [`AX_WORKSPACE_TASK_ENGINE_INTEGRATED_VALIDATION_PLAN_V0.md`](AX_WORKSPACE_TASK_ENGINE_INTEGRATED_VALIDATION_PLAN_V0.md)
14. [`task_engine_redesign/README.md`](task_engine_redesign/README.md)와 불변 `01`~`10`
15. [`ENGINE-12-CONTEXT-LIFE-TREE.md`](slices/ENGINE-12-CONTEXT-LIFE-TREE.md)
16. [`ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md`](slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md)
17. [`MASTER_PLAN_20260613.md`](MASTER_PLAN_20260613.md),
    [`MASTER_BUILD_PLAN_20260614.md`](MASTER_BUILD_PLAN_20260614.md),
    [`ENGINE_EXPANSION_MASTER_PLAN_20260702.md`](slices/ENGINE_EXPANSION_MASTER_PLAN_20260702.md)
18. 위 문서가 직접 가리키는 current code, schema, API, test, RAG, life-tree surface

comparison 문서는 누락 감사와 검증 기준으로만 사용한다. 새 master plan의 최상위 목적을
`대조`, `비교`, `검토`로 쓰지 않는다.

`TASK_ENGINE_CONTEXT_FOUNDATION_CROSS_VALIDATION_V0.md`의 CV-01~CV-09는 맥미니 검토
판정이며 자동 정답이 아니다. 고성능 PC는 각 행을 public 계약과 허용된 metadata-only evidence로
독립 대조하고 `CONFIRMED`, `REJECTED_WITH_EVIDENCE`, `UNKNOWN_BLOCKED`를 기록한다. 특히
`history -> identity/time -> revision -> RAG/Wiki -> validated context -> task discovery ->
TaskDriver -> ERP writer` dependency 방향이 증명되지 않으면 master plan을
`READY_FOR_OWNER_REVIEW`로 올리지 않는다.

## 5. 고성능 PC 현황을 먼저 읽기 전용으로 증명

### 5.1 Git·service·runtime identity

- 현재 public `main`, 구현 branch, merge-base, branch drift
- 실제 실행 중 service가 있다면 code revision·launch surface·DB binding 존재 여부만 확인
- process를 시작·재시작·종료하지 않는다.
- service·DB·branch revision이 다르면 섞지 말고 각각 별도 baseline으로 기록한다.

### 5.2 code·schema·API·UI·test

- `core_item`, task event/completion, status transition, reanchor/reopen
- TaskIntent, TaskDriver, Driver event, authority, idempotency, replay adapter
- mail·voice·SE schedule·file·Codex instruction intake
- RAG/Wiki/ontology/source-revision readers와 writers
- B9 context graph, ENGINE-12 daily life-tree, file-activity projection
- personal Codex/ERP MCP/WorkSession, workflow job, AgentRun 후보
- API route, CLI, UI consumer, validator와 caller graph
- 모든 task/Driver/file/knowledge writer 후보와 실제 caller 수

각 CURRENT 주장은 `file:symbol`, table, route, test, commit 또는 실행 command로 뒷받침한다.
검색 결과가 없거나 validator가 존재하지 않으면 `UNKNOWN/not_run`으로 남기고 만들어 말하지 않는다.

### 5.3 DB read-only guard

실제 DB는 유효한 profile과 이번 inventory 권한이 확인될 때만 본다.

- app/server/openStore/migration path로 열지 않는다.
- 검증된 immutable/query-only 방식과 `query_only` guard를 사용한다.
- schema, table/index/trigger, aggregate count, enum coverage, opaque digest만 본다.
- title, body, filename, path, actor/account, project name, raw value를 출력하지 않는다.
- 안전한 read-only 도구가 없으면 설치하지 말고 `BLOCKED`로 남긴다.
- query 전후 file hash/mtime 또는 동등한 zero-mutation evidence를 기록한다.

### 5.4 저장 owner와 실제 materialization

- source-local authoritative owner: 메일·음성·SE 일정·파일의 current record와 append-only
  event/revision. Soulforge가 원천을 대체하지 않으며 owner-approved body만 materialize한다.
- public canon/orchestration roots: `.registry`, `.unit`, `.workflow`, `.party`, `.mission`,
  `docs/architecture`, `guild_hall`, `ui-workspace`
- project payload: `_workspaces/<project_code>/**`
- project metadata: `_workmeta/<project_code>/**`
- common payload: `_workspaces/knowledge/**`
- common metadata: `_workmeta/system/**`
- metadata-only system RAG: `_workspaces/system/rag/**`
- public canon/code, dev-ERP DB, `guild_hall/state/**`, `private-state/**`

허용된 private profile에서는 asset kind별 aggregate count·schema·pointer coverage만 조사한다.
실제 이름·path·body는 public plan에 쓰지 않는다. HWP는 HWPX 파생본 선행 여부만 receipt/status로
확인하고 원문을 직접 파싱하지 않는다.

### 5.5 PC 역할·writer·failover

- `work_pc`, `portable_dev_pc`, `tool_pc`, `dev_worker_pc`, `always_on_node`
- immutable node packet producer
- sole file-activity reconciler
- 별도 ERP task authoritative writer/TaskDriver applier
- operational-primary, failover, checkpoint/tail replay

물리 PC와 logical identity를 분리한다. 한 장비가 여러 역할을 맡는다는 이유로 권한을 합치지 않는다.

## 6. 선택적 fresh read-only 조사 lane

필요하면 최대 3개 lane으로 나눈다. 모든 lane은 읽기 전용이며 파일을 수정하지 않는다.

1. **code/schema/API/test lane**: actual modules, callers, DB/API delta, regression surface
2. **storage/ID/RAG/life-tree lane**: project/common owner, revision, typed ref, RAG/Wiki/ontology,
   B9/ENGINE-12 projection
3. **PC/runtime/migration lane**: roles, writers, packet/reconciler, deployment, backup/rollback,
   operational gates

메인 agent가 evidence ref를 대조하고 중복·충돌을 제거한 뒤 출력 문서 한 개만 작성한다.

## 7. 모든 surface의 구축 분류 계약

모든 code, schema, API, folder, process, view 행을 아래 다섯 분류 중 하나로 지정한다.

| 분류 | 의미 |
| --- | --- |
| `REUSE` | 의미 변경 없이 사용하고 필요한 회귀 검증만 추가 |
| `MODIFY` | 현 owner surface를 호환성·migration·rollback과 함께 변경 |
| `BUILD` | TARGET에 필요하지만 실제 구현이 없어 새로 구축 |
| `DEFER` | owner 결정, 권한, source 또는 선행 slice가 없어 이번 구축선에서 보류 |
| `REMOVE` | 즉시 삭제가 아닌 폐기 후보; consumer 0·대체 reader·rollback·owner 승인이 모두 필요 |

구축 분류와 증거 상태를 분리한다. `evidence_status=UNKNOWN`인 surface는 반드시
`classification=DEFER`로 두고 exact blocker와 `next_proof`를 적는다. 증거 없는 `REUSE`,
`MODIFY`, `BUILD`, `REMOVE` 판정은 금지한다. 모든 행은 다음 필드를 가진다.

```text
surface_id
domain
current_ref
evidence_status: OBSERVED | UNKNOWN
observed_evidence
target_contract_ref
classification: REUSE | MODIFY | BUILD | DEFER | REMOVE
rationale
dependencies
owner / sole_writer
reader_consumers
migration_delta
rollback_point
tests
owner_gate
implementation_slice
unknowns
next_proof
```

## 8. 빠짐없이 포함할 구축 범위

### Core 구축선

- project/common/system 저장 owner와 public/private/local 경계
- 메일·음성·SE 일정·ERP·파일·사람/Codex 지시 intake
- logical file·immutable revision·node observation·source revision
- typed ID/ref, `valid_at/known_at`, occurrence clock, relation/event ledger
- gate·skeleton/work/history branch와 project context
- project/common RAG, Wiki, ontology, source-bound knowledge candidate
- TaskIntent·TaskDriver·authority·idempotency·application receipt·두 상태축
- 단일 ERP task ID allocator와 authoritative task writer
- completion·artifact revision·decision·verification·outcome
- non-writing feedback handoff와 분리된 knowledge candidate/TaskDriver writer
- B9 장기 생명수와 ENGINE-12 일일 read-only projection
- multi-PC packet, sole reconciler, alert, checkpoint, replay, recovery
- migration, rollback, security, public/private 검증

### 후속 구축선

- personal Codex seat·WorkSession·project scope의 AX Workspace
- `.mission`·`.workflow`·`.party`와 분리된 AgentRun/capability/receipt
- requirement→function→interface→risk→decision→verification→outcome→correction의
  Engineering IQ trace
- 충분한 verified label 이후의 ML/ranking 후보

AX Workspace, AgentRun, Engineering IQ, ML은 core TaskDriver 안전성의 선행조건으로 만들지 않는다.
각각 후속 phase와 owner gate를 갖는다.

## 9. 최종 TARGET과 exact delta를 설계

마스터플랜은 최소 다음을 exact하게 정한다.

### 코드

- existing/new file과 module owner
- 수정할 symbol·caller·consumer
- 새 abstraction이 필요한 이유와 더 단순한 대안
- compatibility adapter와 제거 시점

### 문서·계약·CHANGELOG

- 변경 module의 owner-local `README.md`와 상위 architecture contract 영향
- 구조·기능·설치·운영 규칙 변경 시 같은 slice의 root 또는 owner-local `CHANGELOG` delta
- schema/API/path/owner 경계가 바뀔 때 동기화할 design·README·example·validator
- 문서 동기화가 불필요하면 단순 누락이 아니라 근거 있는 `not_applicable` 판정

### DB·ledger

- table, column, type, constraint, index, trigger 여부
- current row와 append-only event의 분리
- ID allocator, transaction boundary, sole writer
- schema version, up/down migration, backfill, readback, rollback
- replay input/output와 deterministic digest

### API·CLI

- route/method 또는 command
- request/response와 typed ref
- auth/authority, read/write owner
- idempotency, error, retry, conflict/quarantine
- read-only projection의 zero-mutation 조건

### 파일·폴더

- source-local authoritative owners와 owner-approved materialization 경계
- `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `docs/architecture`, `guild_hall`,
  `ui-workspace`, `_workspaces`, `_workmeta`, dev-ERP DB, `guild_hall/state`, `private-state`
- public/project/common/system의 전체 physical tree
- 각 node의 payload/metadata, reader, writer, tracking, migration source/target

### UI·업무면

- ERP official task state
- AX/personal Codex working surface
- RAG/Wiki/graph/life-tree/dashboard projection
- approval, rejection, blocker, evidence, verification, recovery 화면

## 10. 구축 slice/WBS 계약

최종 문서의 WBS는 개발자가 승인 후 바로 한 slice씩 실행할 수 있을 정도로 bounded해야 한다.
각 slice에 다음 필드를 빠짐없이 둔다.

```yaml
slice_id:
title:
goal:
classification_mix: []
depends_on: []
current_evidence_refs: []
allowed_write_paths: []
forbidden_paths: []
inputs: []
outputs: []
code_delta: []
db_delta: []
api_delta: []
folder_delta: []
docs_contract_changelog_delta: []
owner_and_writers: []
acceptance_checks: []
regression_checks: []
migration_or_backfill:
rollback:
stop_conditions: []
owner_gate:
risk_and_effort:
next_slice:
```

- dependency DAG와 critical path를 그린다.
- 날짜를 근거 없이 약속하지 말고 상대 effort·risk·blocking decision을 표시한다.
- schema와 writer를 바꾸는 slice는 read-only inventory, synthetic test, backup/restore 설계보다
  앞설 수 없다.
- 구조·기능·설치·운영 규칙을 바꾸는 slice는 관련 owner-local README, architecture contract,
  CHANGELOG, validator 동기화를 같은 slice의 acceptance로 포함한다.
- 구현 slice는 master plan 승인 뒤 `.mission/**` 또는 적합한 approved task packet으로 내려간다.
  이 prompt 실행 중 mission/queue를 만들거나 승인 상태로 올리지 않는다.

## 11. migration·배포·rollback

다음을 각각 `inventory → dry-run → copy/rebuild/backfill → readback → rollback drill → activation`
순서로 설계한다.

- `main`과 고성능 PC 구현 branch 통합
- legacy project/common RAG와 모든 consumer
- task status/two-axis state crosswalk
- TaskIntent/TaskDriver/ApplicationReceipt schema
- task ID reservation과 duplicate retry
- source/file/artifact revision과 event namespace
- B9/ENGINE-12 adapter
- multi-PC packet·reconciler·writer·alert
- personal Codex/AX Workspace rollout

기존 project/task/source ID를 hash ID로 rekey하지 않는다. typed ref와 verified alias를 추가한다.
source original, legacy index, old reader/event는 pilot 중 삭제하지 않는다. rollback은 target writer
OFF, old reader restore, projection rebuild, event history 보존을 증명해야 한다.

## 12. 반드시 포함할 도식

쉬운 한국어와 상태 글자를 함께 쓰고, 색만으로 상태를 전달하지 않는다.

1. 전체 TARGET architecture와 owner/write boundary
2. source-local owner와 public/project/common/system 전체 physical folder tree
3. ID·relation·revision graph
4. source→Driver→approval→ERP→work→verification→feedback sequence
5. DB current row와 append-only event 구조
6. 판단/적용 상태와 work-status 두 축
7. B9 장기 생명수와 ENGINE-12 일일 projection 관계
8. PC role·packet·sole reconciler·ERP writer topology
9. WBS slice dependency DAG와 critical path
10. migration·rollback state machine
11. owner decision·activation gate map

## 13. 구축 마스터플랜 acceptance

| ID | 합격 조건 |
| --- | --- |
| AC-01 | 최상위 목적이 실제 구축 마스터플랜이며 비교 문서는 입력 oracle로만 사용 |
| AC-02 | 기존 원안·ENGINE-12/13·comparison 문서의 working-tree diff 0 |
| AC-03 | exact Git/code/DB/API/storage/PC role read-only inventory와 command exit 기록 |
| AC-04 | 증거 상태와 구축 분류를 분리하고, 모든 UNKNOWN은 blocker·next proof가 있는 DEFER로 분류 |
| AC-05 | 입력부터 ID·지식·Driver·ERP·feedback·생명수·PC 운영까지 전 범위 포함 |
| AC-06 | code delta에 exact file/module/symbol/caller/consumer 포함 |
| AC-07 | DB delta에 table/column/index/event/writer/transaction/up/down/rollback 포함 |
| AC-08 | API/CLI delta에 auth·owner·idempotency·error·zero-mutation 포함 |
| AC-09 | source-local/public/project/common/system 전체 tree와 materialization·payload/metadata 경계 표현 |
| AC-10 | end-to-end sequence와 owner ID·typed ref·revision 관계 표현 |
| AC-11 | bounded WBS, dependency DAG, critical path, first slice 제시 |
| AC-12 | 모든 slice에 allowed paths·입출력·validator·rollback·stop·owner gate·README/contract/CHANGELOG delta 포함 |
| AC-13 | branch/RAG/schema/status/ID migration마다 dry-run·no-delete·rollback 존재 |
| AC-14 | owner ID 유지, `valid_at/known_at`, idempotency, replay 설계 |
| AC-15 | B9/ENGINE-12와 모든 view가 owner row를 쓰지 않음 |
| AC-16 | PC logical role, immutable packet, sole reconciler, 별도 ERP writer, failover 분리 |
| AC-17 | V-01~V-16, HP-STORAGE/HP-ID/HP-TREE, replay 2회, adversarial, regression, pilot, rollback drill 배치 |
| AC-18 | owner 결정·activation gate와 승인 전 mutation 중단선 명시 |
| AC-19 | core, AX Workspace, Engineering IQ/ML을 서로 다른 phase로 분리 |
| AC-20 | 최종 상태가 `READY_FOR_OWNER_REVIEW` 또는 exact blocker가 있는 `BLOCKED` |
| AC-21 | CV-01~CV-09를 exact evidence로 독립 판정하고, `context_acceptance_gate` 전 task discovery가 시작되지 않으며 이후 TaskDriver·ERP writer도 phase acceptance 순서를 지키는 dependency DAG를 제시 |

## 14. 출력 문서 필수 목차

출력 파일은
`ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md` 하나다.

```text
0. 목적·authority·이번 단계 중단선
1. 주인이 먼저 읽는 쉬운 전체 구축 그림
2. exact Git/runtime 기준선과 증거 강도
3. 고성능 PC CURRENT read-only inventory
4. REUSE/MODIFY/BUILD/DEFER/REMOVE 총괄표
5. 최종 TARGET architecture와 owner/write 경계
6. code·DB·API·ID·event 상세 설계
7. 전체 file/folder/repository/knowledge 저장 구조
8. 입력→TaskDriver→ERP closed loop
9. verification·feedback·RAG·Wiki·ontology·생명수
10. AX Workspace·personal Codex·AgentRun 후속 구축
11. PC 역할·배포·alert·장애 복구
12. 구현 slice/WBS·dependency DAG·critical path
13. branch/schema/RAG/data migration·backfill·rollback
14. V-01~V-16·regression·security·replay 검증 계획
15. one-project pilot와 단계별 activation
16. Engineering IQ·ML 장기 확장선
17. owner 결정표·UNKNOWN·VERIFY_HP
18. 승인 뒤 첫 실행 slice와 exact task packet 초안
19. 승인 전 중단조건·publish·handoff
```

첫 절은 비개발자도 큰 그림을 이해할 수 있는 쉬운 한국어로 쓴다. 이후 절은 구현자가 파일과
schema를 바로 찾을 수 있을 정도로 exact하게 쓴다. private evidence를 public 문서에 복사하지
않고 opaque ref·aggregate·verdict만 사용한다.

## 15. 검증과 독립 리뷰

문서 작성 후 최소 다음을 수행한다.

1. `git diff --check`
2. `npm run ui:docs:check`
3. `npm run validate:path-policy`
4. `npm run ui:done:check`
5. 기존 불변 계획 경로 working-tree diff와 before/after blob 비교
6. AC-01~AC-21 completeness check
7. Mermaid block·상태 label·relative link 구조 검사
8. 실제 변경 범위와 public/private/secret 경계 검사
9. fresh-context post-development review Level 2 이상

validator를 실행하지 못하면 `not_run`과 이유를 남긴다. screenshot이나 LLM의 “좋아 보임”을
deterministic evidence로 쓰지 않는다. review는 다음을 별도로 판정한다.

- 이 문서가 다시 comparison plan에 머물지 않았는가?
- 실제 코드·DB·API·folder delta와 WBS가 실행 가능한가?
- 더 단순한 구축 경로가 있는데 불필요한 AX/Engineering IQ 범위를 선행시켰는가?
- writer·source truth·projection·private boundary가 섞이지 않았는가?
- owner가 승인할 선택과 agent가 증명한 사실이 분리됐는가?

## 16. 저장·업로드·종료

1. public Git에는 새 master plan 한 파일과 꼭 필요한 public-safe link 변경만 포함한다.
2. established profile이 companion access를 허용할 때만 실제 inventory/review evidence를 올바른
   `_workmeta/system/reports/**`에 metadata-only로 남긴다. 특정 pilot evidence는 owner가 지정한
   `_workmeta/<project_code>/**`를 사용하고 project code를 임의로 만들지 않는다.
3. `public-only`에서는 `_workmeta`와 `private-state`를 열거나 쓰거나 push하지 않고
   `not_authorized`/`not_applicable`로 보고한다. established profile에서만 각 companion repo를
   별도 Git root로 inventory한다.
4. `$soulforge-github-up`으로 profile에 허용된 repo만 scoped publish한다. public commit 직전에는
   fetch 뒤 `HEAD == origin/main`인 base를 기록하고, commit 뒤 push 직전에는 remote가 그 base에서
   움직이지 않았고 local-ahead가 이번 scoped commit뿐인지 위 절차대로 다시 확인한다.
5. 다른 작업의 dirty change를 stage/commit/push하지 않는다.
6. scoped commit·push·self-verify 후 owner에게 문서 경로, commit, validator, review verdict,
   blockers, 첫 승인 선택을 보고한다.
7. clean commit+push와 review evidence로 forward state가 닫히면 `NIGHT_WORK_HANDOFF`를 만들지
   않는다. PC/controller 전환 뒤에도 남아야 할 미해결 시도·기각·blocker·exact next action이
   별도로 있을 때만 compact handoff를 만든다.
8. 구현·DB·migration·writer·운영 활성화는 하지 않고 owner 승인에서 멈춘다.

최종 보고는 다음 형식으로 닫는다.

```text
결과: READY_FOR_OWNER_REVIEW | BLOCKED
master_plan_path:
public_commit:
workmeta_evidence_commit: <commit | not_authorized | not_applicable>
observed_role/profile:
baseline_refs:
validators_run:
independent_review:
immutable_oracle_result:
remaining_UNKNOWN_or_VERIFY_HP:
owner_decisions_required:
recommended_first_slice_after_approval:
implementation_or_data_mutation: false
operational_activation: false
```

## 근거 문서

- [`AX_WORKSPACE_TASK_ENGINE_INTEGRATED_VALIDATION_PLAN_V0.md`](AX_WORKSPACE_TASK_ENGINE_INTEGRATED_VALIDATION_PLAN_V0.md)
- [`task_engine_redesign/08_MIGRATION_AND_IMPLEMENTATION_PLAN.md`](task_engine_redesign/08_MIGRATION_AND_IMPLEMENTATION_PLAN.md)
- [`task_engine_redesign/09_VALIDATION_AND_ACCEPTANCE.md`](task_engine_redesign/09_VALIDATION_AND_ACCEPTANCE.md)
- [`task_engine_redesign/10_HIGH_PERFORMANCE_PC_PLAN_MODE_RUNBOOK.md`](task_engine_redesign/10_HIGH_PERFORMANCE_PC_PLAN_MODE_RUNBOOK.md)
- [`TASK_ENGINE_CONTEXT_FOUNDATION_CROSS_VALIDATION_V0.md`](TASK_ENGINE_CONTEXT_FOUNDATION_CROSS_VALIDATION_V0.md)
- [`ENGINE-12`](slices/ENGINE-12-CONTEXT-LIFE-TREE.md)
- [`ENGINE-13`](slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](../../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`DEVELOPMENT_ROADMAP_V0.md`](../../../../docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md)
