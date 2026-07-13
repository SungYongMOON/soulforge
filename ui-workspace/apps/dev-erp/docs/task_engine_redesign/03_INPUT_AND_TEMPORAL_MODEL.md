# 03. 입력과 시간 모델

| 항목 | 내용 |
| --- | --- |
| owner | each source owner; unified projection is a read-only consumer |
| authority | identity/clock preservation and query semantics |
| CURRENT | ENGINE-12가 source-local 이력과 여러 clock/gap을 보수적으로 투영 |
| TARGET | TaskDriver가 exact trigger/source refs와 bitemporal cutoffs를 함께 고정 |
| non-goals | 단일 giant timeline truth, fuzzy binding, filename/mtime identity |
| stop | exact occurrence/clock owner 없음, clock regression, source conflict 은폐 |

## source-local first

메일, 음성, SE 일정, ERP work event, Codex instruction metadata, artifact/file observation은
각 source owner에 남는다. CURRENT에는 `core_mail`, `core_item`, `core_artifact` 같은 mutable
current row도 있고 append-only event/observation ledger도 있다. 통합 사건축은 둘을 구분해
읽으며 current row를 과거 immutable 사실처럼 사용하지 않는다. TARGET replay 근거는 exact
occurrence/revision과 append-only event여야 하고, 원본 row를 옮기거나 최신 한 줄로 덮어써서
과거를 만들지 않는다.

| 층 | 저장 내용 | 시간 역할 |
| --- | --- | --- |
| RAW/source payload | 메일 원문, 음성, 일정 원본, 실제 파일·첨부 | source가 가진 실제 내용 |
| current row | 현재 메일/할일/산출물 상태 | 빠른 현재 조회; 과거 truth 아님 |
| event/observation ledger | 수신·변경·승인·관측·상태전이 | append-only 이력/replay 근거 |
| derived projection | 일별 사건축·생명수·Neo4j | 다시 만들 수 있는 조회 결과 |

## identity chain

```text
native occurrence -> event_id -> source_revision_id (source-bearing일 때)
workspace_binding_id -> logical_file_id -> revision_id -> content_id
node packet -> observation_id -> observed revision candidate
event/decision -> TaskDriver -> task candidate/transition
```

source-bearing 입력만 exact `source_revision_id`를 가진다. 순수 상태 전이에 가짜 source
revision을 만들지 않는다. 파일 path/name/mtime은 evidence이며 identity가 아니다.

## 한 기록에 붙는 ID

모든 ID를 한 row에 다 넣지 않는다. 각 record는 자기 ID와 실제로 연결하는 typed ref만 가진다.

| ID/ref | 붙는 대상 | 답하는 질문 |
| --- | --- | --- |
| `project_ref` | 모든 project-local record | 어느 과제인가 |
| native provider/source ref | 메일·음성·일정 등 | 원 시스템의 어느 occurrence인가 |
| `event_id` | 수신·관측·전이 1건 | 무슨 사건이 있었나 |
| `source_id` | 논리 문서/대화/일정 | 같은 source는 무엇인가 |
| `source_revision_id` + `content_id` | source-bearing 정확한 판 | 당시 어떤 내용이었나 |
| `logical_file_id` + `revision_id` | 여러 PC의 동일 논리 파일과 개정 | rename/touch/copy와 실제 변경을 어떻게 구분하나 |
| `driver_id` | task 후보/전이의 causal record | 왜, 왜 지금인가 |
| `task_id` (`core_item.id` CURRENT) | 적용된 할일 | 실제 어떤 일을 추적하나 |
| branch/gate typed ref | context/view 연결 | 어느 맥락·관문에 보이나 |

예: 메일 한 판은 `event_id + source_revision_id`를 갖고, 그 메일에서 서로 다른 할일 두 개를
제안하면 같은 source ref를 재사용하되 서로 다른 `driver_id`와 target intent를 만든다.

## 2~5년 과제의 물리 분할

논리적으로는 source별 한 이력이지만 물리적으로 하나의 거대 파일로 만들지 않는다.

- 사건은 owner-native 형식 또는 `events/<YYYY-MM>.jsonl` 같은 월별 append-only partition.
- exact source/file revision record는 revision별 immutable record.
- current projection과 checkpoint는 bounded·replaceable이며 원 사건을 대체하지 않음.
- 늦게 들어온 사건은 `recorded_at/ingested_at` 월 partition에 append하고 원래 `valid_at`을
  보존한다. 과거 월 파일을 조용히 다시 쓰지 않는다.
- 월별 파일 교체, 보관, compaction은 tail/full replay parity와 rollback 검증 뒤에만 한다.

## clocks

정의는
[`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../../../../../docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)와
[`PROJECT_FILE_ACTIVITY_REVISION_V0.md`](../../../../../docs/architecture/workspace/PROJECT_FILE_ACTIVITY_REVISION_V0.md)를
그대로 사용한다: `published/effective`, `occurred`, `observed`, `recorded`, `ingested`,
`received`, `planned_for`, `project_applied_at`. 한 `created_at`으로 합치지 않는다.

- `valid_at`: 현실/업무상 그때 발생·유효했던 것
- `known_at`: 그 시점까지 시스템이 알고 기록한 것

두 cutoff를 모두 만족하지 않으면 과거 판단에 현재 최신 source/rule/task state를 끼워 넣지
않는다. clock skew, date-only, unknown, partial coverage는 표시 상태로 보존한다.

## projection rule

- exact source/event/task ref만 join한다. 제목·시간 근접·LLM 유사도는 후보까지만.
- source별 caps/gaps/truncation/undated를 출력한다.
- API/read model 호출은 source ledger, task truth, project context를 쓰지 않는다.
- 일별 branch는 응답에서만 생성하며 canonical tree node가 아니다.
- replay 입력과 query cutoffs가 같으면 ordering과 IDs가 결정적이어야 한다.

## canonical refs

- [`ENGINE-12-CONTEXT-LIFE-TREE.md`](../slices/ENGINE-12-CONTEXT-LIFE-TREE.md)
- [`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../../../../../docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)
- [`PROJECT_FILE_ACTIVITY_REVISION_V0.md`](../../../../../docs/architecture/workspace/PROJECT_FILE_ACTIVITY_REVISION_V0.md)
- [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
