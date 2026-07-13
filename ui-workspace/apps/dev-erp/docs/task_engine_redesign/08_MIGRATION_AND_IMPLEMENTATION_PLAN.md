# 08. migration과 구현 계획

| 항목 | 내용 |
| --- | --- |
| owner | ENGINE-13 execution packet |
| authority | phases, cut line, activation/rollback gates |
| CURRENT | 이 PC에서 public docs와 synthetic design만 수행 |
| TARGET | 고성능 PC one-project pilot 뒤 bounded live activation |
| non-goals | 여기서 실제 inventory/raw read/migration/live writer 실행 |
| stop | target file external edit, private/raw need, dry-run/rollback 불완전 |

## exact cut line

**public 개발 checkout:** public contract/docs와 synthetic implementation/validator만.

**승인된 `tool_pc`:** safe sync 후 read-only metadata inventory -> crosswalk -> dry-run ->
project-local RAG 한 project pilot. project owner decision과 rollback gate를 요구한다.

**`operational-primary` runtime checkout:** dev-ERP live DB의 TaskDriver vertical pilot. live
writer/scanner/scheduler/network alert 확대는 모든 activation gate 뒤 별도 승인이다.

## phases

| phase | action | output | mutation |
| --- | --- | --- | --- |
| 0 | public package/contract | 이 문서군 + ENGINE-13 | public docs only |
| 1 | safe bootstrap | role/capability/status report | safe sync only |
| 2 | read-only inventory | source/task/RAG/path/status/consumer crosswalk | none |
| 3 | migration dry-run | old->target map, collision/gap/rollback manifest | none |
| 4 | synthetic engine | Driver/two-axis/replay validators | synthetic only |
| 5A | one-project RAG pilot | source revision->project-local index/lineage/answer | bounded project worksite writes |
| 5B | one-project TaskDriver pilot | Driver->task->completion->follow-up candidate | operational-primary DB only |
| 6 | independent acceptance | matrix verdict + rollback drill | no expansion |
| 7 | activation | explicit writers/scanners/schedulers/alerts | separate approval |

## crosswalks required

- current `core_item`, task ledger/exporter, event log, review/auto-open gates
- source event/native IDs and `source_revision_id` coverage
- legacy `_workspaces/knowledge/rag/**`의 project-bound index, traceability sidecar, answer run,
  source-text quality review, work card와 모든 payload consumer를 project-local target으로
- project context/life-tree consumers and exact ref joins
- node roles, workspace bindings, packet/reconciler identity
- alert probe/dedupe/cooldown receipts

## RAG path migration

Follow [02](02_OWNER_BOUNDARIES_AND_STORAGE.md): 모든 RAG asset과 consumer를
project/common/unresolved로 classify하고 dry-run map, collision, inbound/outbound ref, metadata
receipt owner를 기록한다. 한 project를 rebuild/copy하되 legacy를 삭제하지 않고 index/sidecar/
answer/review/work-card의 hash·lineage·query/ref parity와 rollback을 검증한다. Activation gate
이후 project legacy-path 신규 writes는 fail closed다.

## vertical pilot

한 owner-approved project에서 exact source revision 1개, Driver kinds 소수, task 1~3개만 쓴다.
candidate/approval/apply/work/done/follow-up-candidate와 RAG/Wiki/ontology refs를 왕복한다.
실제 source/body는 private runtime에서만 읽고 public output은 counts/opaque refs/verdict만 남긴다.

## rollback and stop

- legacy state를 pilot 중 삭제하지 않는다.
- target writer flag OFF + projection rebuild + old reader restore가 가능해야 한다.
- digest/collision/replay mismatch, cross-project leak, unknown authority, raw leak, two primaries,
  alert storm이면 즉시 중단하고 rollback한다.
- pilot 통과가 전체 corpus/node production-ready를 뜻하지 않는다.

## phase promotion evidence

각 phase를 올릴 때 다음을 한 packet에 묶는다.

- input refs와 exact baseline commit/schema revision
- 판단 결과와 unresolved/unknown 목록
- 생성된 output refs와 content/digest summary
- 실행한 validator, exit, coverage와 skipped reason
- rollback point와 stop-condition 결과

`phase complete`는 문서 작성이나 happy-path 화면만으로 선언하지 않는다. 다음 phase가
요구하는 owner, source, permission, validator가 하나라도 unknown이면 hold한다.

project pilot 결과를 common corpus나 다른 node에 자동 일반화하지 않는다.

## refs

- [`ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md`](../slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md)
- [`02_OWNER_BOUNDARIES_AND_STORAGE.md`](02_OWNER_BOUNDARIES_AND_STORAGE.md)
- [`09_VALIDATION_AND_ACCEPTANCE.md`](09_VALIDATION_AND_ACCEPTANCE.md)
