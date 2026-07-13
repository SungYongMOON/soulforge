# ENGINE-13 — TaskDriver closed loop

- 상태: `canon_candidate`; cold-start execution packet, runtime 미구현
- package: [`../task_engine_redesign/README.md`](../task_engine_redesign/README.md)
- owner contract: [`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`](../../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md)
- execution target: high-performance PC Plan mode -> approved bounded implementation
- data boundary: public-safe/synthetic first; real evidence는 correct private owner

## scope

TaskDriver `why/why-now` causal record, 판단/적용과 작업 상태의 두 축, exact source/time refs,
approval/idempotency/replay, completion feedback/follow-up candidate, project-local RAG migration과
ENGINE-12 read model 연결을 한 vertical loop로 닫는다.

## current facts / no-claims

- dev-ERP current task enum은 `unclassified|open|doing|waiting|blocked|done|archived`다.
- ENGINE-12는 source-local ledgers의 read-only event/life-tree projection이다.
- current project RAG docs/runtime 일부는 legacy common root와 prefix 격리를 쓴다.
- 통합 TaskDriver, two-axis schema, live four-PC transport/alert는 구현 완료가 아니다.
- 실제 project files와 runtime binding은 고성능 PC에서만 VERIFY_HP한다.

## phases and write ownership

| phase | owner/write |
| --- | --- |
| A bootstrap/inventory | `soulforge-github-down`; public/read-only |
| B crosswalk/dry-run | private metadata evidence only; runtime no-write |
| C synthetic Driver engine | public code/tests only after plan approval |
| D one-project pilot | exact project owner, bounded approved writer |
| E projection/feedback | task owner writes; life tree/Neo4j read only |
| F activation | separately approved sole reconciler/writers/alerts |

현재 PC cut line은 docs/synthetic design뿐이다. high-performance PC에서도 inventory,
crosswalk, dry-run, one-project pilot 순서를 건너뛰지 않는다.

## required implementation slices

1. current task/ledger/event/auto-open contract inventory
2. TaskDriver schema/validator + exact relation refs
3. two-axis transition validator and legacy status crosswalk
4. authority-gated apply, idempotency receipts, deterministic replay
5. completion -> knowledge candidate + follow-up Driver candidate-only
6. project RAG target reader/writer migration guard and legacy dry-run
7. ENGINE-12 projection adapter with zero owner mutation
8. one-project pilot, rollback, independent review

## acceptance

[`09_VALIDATION_AND_ACCEPTANCE.md`](../task_engine_redesign/09_VALIDATION_AND_ACCEPTANCE.md)의
V-01~V-16이 해당 phase에서 모두 pass해야 한다. 특히 LLM direct apply 금지, follow-up
candidate-only, exact `valid_at/known_at`, replay parity, project/common isolation, sole reconciler,
rollback을 필수로 한다.

## validators

- schema/transition/idempotency/replay synthetic tests
- project RAG path and cross-project isolation validator
- raw/private/secret/absolute-path exclusion checks
- relevant dev-ERP serial tests and root validation
- post-development review Level은 실제 mutation/claim에 따라 선택

첫 public read-only anchors는 `src/store.mjs`의 `core_item`, `event_log`,
`Store.ITEM_STATUSES`, `appendEvent`, `setItemStatus`와 `tools/**`의 `--auto-open`,
`task_ledger.mjs`/`src/autosync.mjs`다. exact 명령·예상 exit는
[`10_HIGH_PERFORMANCE_PC_PLAN_MODE_RUNBOOK.md`](../task_engine_redesign/10_HIGH_PERFORMANCE_PC_PLAN_MODE_RUNBOOK.md)의
inspection matrix를 먼저 실행한다. 실제 신규 validator command는 구현 전 current package
scripts를 inventory해 확정하고, 존재하지 않는 validator를 실행했다고 주장하지 않는다.

## stop conditions

- dirty/divergent/overlapping edit 또는 exact HEAD/lock 불안정
- task truth writer가 둘이 됨
- exact Driver trigger/authority/idempotency/ref가 없음
- raw/private/secret을 public repo 또는 `_workmeta`에 복사해야 함
- legacy migration dry-run/collision/rollback이 불완전
- node role/sole primary/ACL/transport가 불명확한데 live writer를 켜야 함
- synthetic 또는 one-project acceptance failure

## deliverable closeout

changed files, encoded decisions, commands/exits, unresolved owner decisions, risks, rollback state,
next exact action을 보고한다. production-ready나 implementation complete를 주장하지 않고
claim ceiling `canon_candidate`를 유지한다.
