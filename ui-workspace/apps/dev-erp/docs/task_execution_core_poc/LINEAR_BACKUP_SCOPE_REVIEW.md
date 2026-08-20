# Linear 업무 백업 범위 검토

- 상태: `offline_contract_implemented / no_live_automation / start_order_confirmed / actual_lb1_gate_pending`
- 기준일: 2026-08-20
- 목적: Linear 원본 장애·이관·과거 조회 시 업무 정체성, 현재 상태, 상태 이력, Waiting,
  완료 결과와 Evidence를 어느 수준까지 복원할지 데이터 범위를 정한다.
- 경계: public-synthetic offline manifest/restore contract만 구현됐다. live Linear·Drive·Sheets 접근,
  webhook 설치, API 수집기, scheduler, storage writer는 구현하지 않는다.

## 1. 결론

CSV와 공식 Google Sheets 동기화는 **현재 Issue 스냅샷** 백업으로는 유용하지만,
Comment·상태변경 이력·삭제·실제 사건 시각을 복원하는 원장은 아니다.

목적을 충족하는 최소 구조는 다음 세 층이다.

```text
Linear current snapshot
  + API current/history/comment snapshot
  + Soulforge structured TaskEvent/WaitingInfo/CompletionRecord
```

권장 구조는 여기에 append-only raw webhook과 주기적 API reconciliation, 필요한 Evidence bytes/hash를
더한다. Snapshot, Event, Projection을 한 표로 합치지 않는다.

### 1.1 현재 상태와 시작 시점

현재 `guild_hall/backup_controller`에는 **public-synthetic feature-OFF offline LB1 contract**가
있다. 불변 revision, deterministic manifest·coverage, duplicate/conflict, partial/failure와
restore completeness를 합성 입력으로 검증하지만 실제 데이터를 수집·저장·복원하지 않는다.
Linear API collector, CSV 자동 export, Google Drive writer, webhook, scheduler와 actual restore
runner는 아직 없다. Task Execution Core의 POC SQLite도 Linear 백업 DB가 아니다.

백업은 Task 실행과 독립된 read-only support lane이므로 P5 accepted Context까지 기다릴 필요는 없다.
다만 정확한 시작 조건은 Task Engine 마스터플랜 §12의
`Linear backup and live-task split lanes` 표 `LB1` 행 하나가 소유한다. 저장 위치·쓰기 권한,
최소 read-only Linear 범위, 보존·부분실패·복원 정책의 세 영역이 모두 승인되기 전에는 시작하지 않는다.

첫 pilot은 one-shot으로만 수행한다. bounded snapshot/API read를 승인된 private target의 새 revision에
저장하고 manifest, hash, coverage, 실제·합성 restore 결과를 남긴다. Linear mutation, 기존 백업
덮어쓰기, webhook 등록, scheduler, 자동 삭제·미러링은 이 pilot 범위가 아니다. one-shot restore가
통과한 뒤에만 예약 백업을 별도 승인한다. 실제 `LinearTaskProvider.readTask()` 1건 시험은 `LB1`
결과와 Work Brief immutable revision·TaskRef scope·read-only binding이 고정된 `LT1`에서 별도로
할 수 있지만 dispatch·claim·Executor·AgentRun은 호출하지 않는다. 실제 Task dispatch/write는
백업선과 분리해 P5→P6→P7→P8→P9→P10 Gate를 따른다.

## 2. 공식 기능 확인

### CSV export

[Linear Exporting Data](https://linear.app/docs/exporting-data)에 따르면 workspace/issue CSV는 다음을
포함한다.

- ID, Team, Title, Description, Status, Estimate, Priority
- Project ID/Name, Creator, Assignee, Labels
- Cycle, Initiatives, Project Milestone, SLA Status
- Created, Updated, Started, Triaged, Completed, Canceled, Archived, Due Date
- Parent issue

CSV에는 Comment, 전체 상태변경 이력, relation type 전체, attachment file bytes가 없다. 첨부 링크가
Description 안에 있을 수는 있지만 attachment 백업 계약은 아니다.

### 공식 Google Sheets 동기화

[Linear Google Sheets](https://linear.app/docs/google-sheets)는 Issues·Projects·Initiatives의 현재값을
시간 단위로 갱신한다.

- public team만 동기화하며 private-team-only 자료는 제외한다.
- 원본 sheet의 셀 변경은 다음 sync에서 덮어쓸 수 있다.
- Started/Completed 등은 해당 status **category에 마지막으로 진입한 시각**이다.
- Done 뒤 In Progress로 되돌리면 completed timestamp가 지워질 수 있다.
- 따라서 Sheets version history와 현재 timestamp를 immutable Task Event로 간주하지 않는다.

### API와 Webhook

공개 Linear GraphQL schema와 공식 문서는 다음 조회면을 제공한다.

- Issue current: assignee, state, priority, project, team, labels, parent, relations, due date,
  created/updated/started/completed/canceled/archived 시각
- Comment current: body, author, parent thread, created/edited/updated/archived/resolved 시각
- Issue history와 state span: field before/after, actor, 변경시각, 상태별 started/ended 구간
- relation, attachment metadata, document current content/metadata

공식 참고:

- [Linear GraphQL/SDK data access](https://linear.app/developers/sdk-fetching-and-modifying-data)
- [Linear Webhooks](https://linear.app/developers/webhooks)
- [Linear SDK public schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)
- [Linear Attachments](https://linear.app/developers/attachments)
- [Linear file storage authentication](https://linear.app/developers/file-storage-authentication)

Webhook은 Issue, Comment, Attachment, Project, Document 등의 `create|update|remove`를 보낸다.
`Linear-Delivery`는 delivery identity이고 payload에는 사건 `createdAt`, `updatedFrom`, 전송시각이 있다.
하지만 실패 시 1분·1시간·6시간 뒤 제한적으로 재시도하고 계속 실패하면 꺼질 수 있으므로 webhook만으로
완전성을 주장하지 않는다. 정기 API reconciliation이 필요하다.

Linear API는 cursor pagination이며 기본 50개다. [Pagination](https://linear.app/developers/pagination)과
[Rate limiting](https://linear.app/developers/rate-limiting)에 따라 entity별 분할 조회와 runtime
rate-limit header 준수가 필요하다. 현재 rate-limit 설명문과 표의 수치가 서로 달라 숫자 자체는
contract fixture 전까지 `UNKNOWN`으로 둔다.

## 3. 백업 필드 분류

`불필요`는 원 export에서 버리라는 뜻이 아니라 복원 정본의 핵심축이 아니라는 뜻이다. CSV 제공 필드는
비용이 작으므로 raw baseline에는 그대로 보존한다.

### 반드시 백업

| 영역 | 필드 |
| --- | --- |
| identity | workspace/provider ID, GraphQL UUID, human identifier, previous identifiers |
| task | title, team ID/name, project ID/name, current status ID/name/type, priority |
| actor | creator, assignee ID/name |
| brief | current Description/Work Brief, exact revision ref 또는 capture hash |
| time | due, created, updated, started, completed, canceled, archived snapshot timestamp |
| relation | parent issue ID |
| restore evidence | backup scope, captured_at, row count, min/max updatedAt, file/payload hash, partial/error |

### 반드시 별도 구조로 백업

| 영역 | 이유 |
| --- | --- |
| Comments | CSV/Sheets에 없음. 현재 body, author, thread, edit/archive 시각 필요 |
| 상태·담당·Project·기한 이력 | 현재 snapshot만으로 과거 before/after를 복원할 수 없음 |
| relation type | parent 외 blocks/duplicate/related 등은 API 필요 |
| WaitingInfo | 자유문장만으로 reason/required input/Next Action Owner를 안정 복원하기 어려움 |
| CompletionRecord | Executor 성공, 실제 업무 완료, Official Done 시각과 Evidence를 구분해야 함 |
| 삭제 tombstone | Canceled/Archived/Deleted와 접근권한 상실을 구분해야 함 |
| semantic time | 회의 종료·실제 완료 시각과 Comment 작성시각을 분리해야 함 |
| catalog snapshot | team·project·user·workflow state ID/name/type을 보존해야 과거 상태 의미를 복원할 수 있음 |

### 권장

- labels, cycle, milestone, initiative
- attachment/document metadata와 source URL
- 승인된 Linear-hosted file bytes와 외부 attachment 원천별 보존 ref, SHA-256, MIME, size, capture time
- project update와 복구 coverage 결과

### 목적상 비핵심

- board/sort order, favorite, UI color/icon/avatar
- reaction과 화면 표시용 preference
- SLA/cycle 분석 수치

조직 운영규칙이 이 필드에 의미를 부여하면 권장 또는 필수로 승격한다.

## 4. CSV·Sheets·API 구분

| 데이터 | CSV | Sheets | 별도 API/Event |
| --- | --- | --- | --- |
| 현재 task/project/assignee/status/priority/due/description/labels | 가능 | 가능, public team만 | 안정 UUID/catalog 권장 |
| 현재 Created/Updated/Started/Completed/Canceled/Archived | 가능 | 가능 | 전체 전환에는 필요 |
| Parent issue | 가능 | 가능 | relation type 전체에는 필요 |
| Comment body/author/thread | 불가 | 불가 | 필수 |
| Comment edit/remove revision | 불가 | 불가 | raw webhook 필요, 과거 소급은 UNKNOWN |
| 모든 상태 전환·상태 구간 | 불가 | 불가 | IssueHistory/stateHistory 필요 |
| 당시 assignee/project/due/title/labels | 불가 | 불가 | history event 필요 |
| External URL-backed Attachment metadata | 불가 | 불가 | Linear API metadata + 원래 외부 source 별도 보존 |
| Document/Markdown가 참조한 Linear-hosted file bytes | 불가 | 불가 | `uploads.linear.app` 인증 fetch 후 별도 저장 |
| 삭제 tombstone | 불가 | 불가 | remove event + reconciliation |
| 실제 업무 완료·회의 종료시각 | 불가 | 불가 | 구조화 TaskEvent 필요 |
| WaitingInfo | Description current text로 부분 | 부분 | 구조화 record 필수 |

## 5. Waiting·실제 사건 시각 복원

Comment나 Description의 자유문장만 장기 정본으로 삼지 않는다. 문장은 편집·삭제될 수 있고 작성시각이
업무 사건시각과 다르기 때문이다.

```text
TaskEvent
  occurred_at       실제 Waiting 시작, 회의 종료, 업무 완료 시각
  received_at       provider event 수신 시각
  ingested_at       Soulforge ledger 반영 시각
  source_ref        Comment/Work Brief/회의기록 exact ref

WaitingInfo
  reason
  required_input
  next_action_owner_ref
  due_at?
  reply_due_at?
  manager_decision_required

CompletionRecord
  executor_succeeded_at?
  business_completed_at?
  official_task_done_at?
  completion_criteria_met
  result
  evidence_refs[]
```

회의가 14:30에 끝나고 Comment가 14:47에 작성됐다면 두 시각을 따로 저장한다. 본문에 실제 시각이
없으면 Comment 작성시각으로 바꾸지 않고 `UNKNOWN`으로 둔다.

Comment를 입력면으로 계속 사용할 경우 원문과 `[Soulforge Event v1]` 같은 검증 가능한 구조 블록을 함께
보존한다. 수정된 Comment는 기존 TaskEvent를 고치지 않고 correction/supersede event를 추가한다.

## 6. 최소 백업안

1. 정기 immutable baseline
   - workspace Issue CSV(private-team 포함 여부 명시)
   - Project CSV 또는 API snapshot
   - member/user catalog
   - scope·captured_at·row count·min/max updatedAt·hash·partial/error manifest
2. 같은 cutoff의 API JSONL
   - current Issue, Comments, IssueHistory, stateHistory
   - Relations, Attachment/Document metadata와 현재 content
3. Soulforge 구조화 record
   - WaitingInfo, 실제 업무시각 TaskEvent, CompletionRecord, EvidenceRef
4. Evidence 최소 포인터
   - URI, title, source entity, hash-if-known, availability

이 방식의 RPO는 snapshot 주기다. 주기 사이에 수정·삭제된 Comment revision은 잃을 수 있고 Evidence bytes를
보존하지 않으면 복원 coverage는 `PARTIAL`이다.

## 7. 권장 백업안

최소안에 다음을 추가한다.

- raw Linear webhook append-only 저장
- `(provider, organization_id, Linear-Delivery)` unique dedupe
- 사건 `createdAt`, provider sent time, local received/ingested time 분리
- `updatedFrom`, raw body hash, source pointer 보존
- periodic API reconciliation과 overlap window
- archived/private-team coverage 및 full inventory
- 승인된 Evidence bytes+SHA-256 보존
- 월/분기 restore drill과 dimension별 restoration coverage

Webhook listener, API poller, Drive upload, scheduler는 이 문서의 구현 범위가 아니다.

## 8. 권장 데이터 모델

```text
BackupRun
  run_id, provider, workspace_ref, captured_at, scope, schema_hash
  status, errors, manifest_hash

SourceSnapshot
  snapshot_id, backup_run_ref, entity_type, provider_entity_ref
  observed_at, source_created_at, source_updated_at
  raw_ref, payload_hash, deleted_observed

ProviderEvent
  event_id, provider, organization_ref, delivery_key
  entity_type, entity_ref, action, actor_ref
  occurred_at, provider_sent_at, received_at, ingested_at
  updated_from_ref, raw_ref, payload_hash

CommentRevision
  comment_ref, revision_ref, source_event_or_snapshot_ref
  author_ref, parent_comment_ref, body_ref, body_hash
  created_at, edited_at, observed_at, tombstone

DescriptionRevision
  task_ref, revision_ref, source_event_or_snapshot_ref
  description_ref, description_hash
  source_updated_at, observed_at, tombstone

TaskEvent
  event_id, task_ref, event_type, actor_ref
  occurred_at, received_at, ingested_at
  before_ref, after_ref, source_ref, confidence

WaitingInfo
  task_event_ref, reason, required_input, next_action_owner_ref
  due_at?, reply_due_at?, manager_decision_required

CompletionRecord
  task_event_ref, executor_succeeded_at?, business_completed_at?
  official_task_done_at?, completion_criteria_met, result, evidence_refs[]

EvidenceRef
  evidence_ref, task_ref, source_ref, uri, kind, title
  mime_type, size, content_sha256, bytes_ref, captured_at, availability

RestorationCoverage
  backup_run_ref, task_ref, dimension
  COMPLETE | PARTIAL | MISSING | UNKNOWN
  covered_through, reason, source_ref
```

`RestorationCoverage.dimension`은 최소 `core_snapshot`, `status_timeline`, `assignee_history`,
`project_history`, `comments`, `comment_revisions`, `description_revisions`, `evidence_links`,
`evidence_bytes`, `deletion_tombstone`, `semantic_business_times`로 나눈다.

## 9. 아직 확인할 것

1. 실제 CSV/Sheets의 `ID` 열이 GraphQL UUID인지 human identifier인지
2. `stateHistory`의 보존 범위와 retention 보장
3. Comment/Description 과거 revision의 별도 API 존재 여부
4. private team webhook과 deleted/trash Issue의 실제 read 범위
5. webhook `updatedFrom`이 큰 Description/Comment의 이전 값을 항상 담는지

위 항목은 live read-only contract fixture 전까지 `UNKNOWN`이다.

## 10. Task Execution Core POC와의 연결

이번 POC의 `TaskEvent`, `WaitingInfo`, `ExecutionReceipt`는 위 장기 모델의 작은 실행 부분이다.
그러나 POC EventStore를 Linear 백업 DB로 사용하거나 POC 통과를 백업 준비 완료로 해석하지 않는다.
백업의 Snapshot, raw webhook, reconciliation, CommentRevision, restoration coverage는 별도 후속 작업이다.
