# 06. 실행, feedback, 생명수

| 항목 | 내용 |
| --- | --- |
| owner | dev-ERP task events; ENGINE-12 is read-only consumer |
| authority | closed-loop event/feedback handoff |
| CURRENT | start/done events와 life-tree projection 존재, 통합 Driver loop 없음 |
| TARGET | task 실행 결과가 지식·후속 Driver 후보로 안전하게 순환 |
| non-goals | life tree writer화, fruit 자동 close, completion 자동 task open |
| stop | completion evidence 없음, projection이 truth를 mutate, duplicate receipt conflict |

## closed loop

```text
TaskDriver applied -> task opened
  -> start/progress/wait/block events
  -> completion event + result/evidence refs
  -> knowledge candidate (optional)
  -> completion-followup TaskDriver candidate (optional)
  -> review/explicit authority
```

각 전이는 actor, `driver_ref`, from/to, occurred/recorded time, used exact refs,
idempotency key를 append-only로 남긴다. 현재 row는 화면 성능용 current state이며 과거
근거를 대체하지 않는다.

## feedback 종류

| output | 기본 상태 | 자동 영향 |
| --- | --- | --- |
| completion evidence | recorded | task done event 근거 |
| fruit/result | draft/accepted | task를 자동 close하지 않음 |
| knowledge candidate | candidate | canon/RAG/Wiki 승격 없음 |
| follow-up Driver | candidate | task auto-open 없음 |
| process improvement | candidate | workflow/skill 자동 변경 없음 |

후속 후보는 parent task/completion event/exact source or rule refs를 고정한다. 단지 제목이
비슷하거나 LLM이 필요하다고 판단했다는 이유로 새 할일을 열지 않는다.

## life tree

ENGINE-12는 source-local ledger와 task events를 읽어
`project -> day -> confirmed context -> event`로 투영한다.

### 사용자에게 보이는 나무와 내부 graph

```text
시간 줄기 ── 마디/관문(SRR·PDR·CDR 등) ── 시간 계속
              ├─ 가지 A: 시작 → 일/사건/근거 → 종결·열매
              └─ 가지 B: 시작 → 일/사건/근거 → 종결·열매
                    ··· A를 참조하는 점선 graph edge
```

- **줄기**는 과제의 2~5년 시간축이다.
- **마디/관문**은 SE gate나 큰 milestone이다. PDR/CDR을 기본 가지로 만들지 않는다.
- **가지**는 시작 이유·목표·종결 조건이 있는 bounded work context다. 끝나면 closed branch가 된다.
- **잎**은 메일·음성·일정·파일·작업 사건이고 **열매**는 완료 결과·결정·승인 산출물이다.
- 한 task/event는 primary 가지 하나에 두고 다른 가지와의 관계는 점선 cross-link로 보인다.
  cross-link 때문에 tree parent를 복수로 만들지 않으므로 화면이 엉키지 않는다.
- 내부 graph가 dependency/reference를 보존하고 tree UI는 한 primary 경로와 필요한 cross-link만
  펼친다. branch merge/move/close는 근거 사건을 남기며 과거를 지우지 않는다.

- 발생/관측/상태변경/예정을 분리
- `valid_at/known_at`, unknown date, gap/truncation 표시
- exact task/branch ref만 연결
- 일별 node는 response-local; graph owner에 쓰지 않음
- life-tree click/Neo4j edge/alert ack는 task completion authority가 아님

## failure and replay

- apply 전에 Driver와 approval이 durable해야 한다.
- mutation 성공/receipt 실패는 pending reconciliation으로 복구한다.
- replay는 source event + Driver + task event에서 current task와 life tree를 재생한다.
- missing/ref conflict/clock regression은 gap 또는 quarantine이지 빈 성공이 아니다.
- rollback은 새 compensating/superseding event로 하고 과거 event를 삭제하지 않는다.

## write ownership check

| record | writer | read-only consumers |
| --- | --- | --- |
| source event | source-local adapter | Driver builder, life tree |
| TaskDriver | authorized task-engine writer | ERP UI, audit, projections |
| task current state | dev-ERP task owner | life tree, notification |
| task transition event | task owner append path | replay, feedback |
| knowledge candidate | knowledge candidate owner | review queue |
| life tree | replaceable projection builder | ERP UI |

한 단계가 다른 owner의 row를 직접 고치지 않고 exact ref와 receipt로 handoff한다.

## validation

합성 시나리오: intake candidate, approval, work start, blocked/unblocked, completion,
knowledge candidate, follow-up Driver candidate, duplicate replay, reject/supersede. projection
호출 전후 owner row counts가 같아야 한다.

## refs

- [`ENGINE-12-CONTEXT-LIFE-TREE.md`](../slices/ENGINE-12-CONTEXT-LIFE-TREE.md)
- [`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`](../../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md)
- [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
- [`09_VALIDATION_AND_ACCEPTANCE.md`](09_VALIDATION_AND_ACCEPTANCE.md)
