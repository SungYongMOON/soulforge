# ENGINE-12 — 시간 사건축과 과제 생명수

- 상태: 읽기 전용 projection/UI, strict precomputed file-activity consumer, activation candidate 구현·검증,
  live 4-PC collector 연동·활성화 보류 (2026-07-12 owner 지시)
- 상위 정본: `ENGINE_EXPANSION_MASTER_PLAN_20260702.md`, `B9-STEM-RIVER-VIEW.md`
- 범위: dev-ERP 읽기 전용 사건 투영 + 기존 줄기 화면의 일일 렌즈
- 데이터 등급: metadata-only

## 1. 목표

메일, 음성, 체계공학 일정, 발신 메일, Codex 작업 지시, 사람의 작업 기록,
등록된 산출물 메타데이터를 원천별 이력으로 보존한 채 하나의 시간 사건축으로
읽는다. 그 사건축을 `과제 -> 날짜 -> 확정 맥락 -> 사건 잎`으로 투영해 기존
B9 줄기 화면에서 과제의 일별 생명수를 볼 수 있게 한다.

이 슬라이스는 새 할일 원장이나 새 source truth를 만들지 않는다. 원천 기록은
각 owner에 남고, 통합 사건축과 생명수는 다시 만들 수 있는 읽기 전용 파생값이다.

## 2. ASSUMPTIONS

- B9 지도는 과제의 장기 생애와 SE 게이트·가지 흐름에 답한다.
- 새 `일일 생명수` 렌즈는 특정 날짜에 무슨 사건이 있었는지에 답한다.
- 업무일 경계는 기존 B9c와 같은 `Asia/Seoul`을 사용한다.
- 실제 발생·상태 변경이 기본이고, 예정 일정은 별도 필터로 표시한다.
- exact ID 또는 사람이 확정한 연결이 없으면 프로젝트·할일·가지 귀속을
  자동 확정하지 않는다.
- 일반 폴더의 파일 생성과 팀원의 자발성은 현재 source owner가 없으므로
  추정하지 않고 coverage gap으로 표시한다.

## 3. 현행 엔진 판단

### 유지할 장점

- 메일과 할일 원장이 분리되어 있고 `mailtask:`/`voicetask:` 멱등키를 사용한다.
- 자동 판단은 후보를 만들고, 도메인 상태는 결정적 ledger/store 경로가 쓴다.
- `event_log`는 내부 상태 전이를 append-only 사건으로 남긴다.
- B9는 `branch_story`로 기원·경로·종결을 읽고, 실제 시각이 아닌 이관
  timestamp를 시간축에 쓰지 않는 보수적 원칙을 이미 가진다.
- 음성은 owner가 확정한 프로젝트 route만 검토 후보로 합류한다.

### 먼저 막을 결함

- `--auto-open`은 `review_status=needs_review|rejected`를 무시하면 안 된다.
- 후보 재생성은 사람이 수정한 기존 ledger 행을 조용히 교체하면 안 된다.
- task ledger writer/exporter 사이의 header contract drift를 단일 계약으로 닫아야 한다.
- 발신 메일, Codex 지시, 외부 사람 작업, 일반 파일 생성은 각각 독립된
  collector/identity/clock owner가 없으면 완전한 이력이라고 주장할 수 없다.
- daily ledger와 project context는 source truth가 아니라 파생 projection이다.

첫 구현은 가장 작은 안전 결함인 review gate를 닫고, 나머지 문제는 projection의
coverage/gap에 드러낸다. 원천 writer의 큰 변경은 이 슬라이스에 섞지 않는다.

## 4. 시간 계약

한 사건은 아래 네 시각을 구분한다.

| 필드 | 뜻 | 예 |
| --- | --- | --- |
| `occurred_at` | 현실에서 사건이 발생한 시각 | 메일 수신·발신, 작업 상태 전이 |
| `observed_at` | collector 또는 원천 adapter가 상태를 관찰한 시각 | 파일·등록 상태 관측 |
| `recorded_at` | 원천 시스템이 기록한 시각 | ERP event append, Codex message record |
| `ingested_at` | Soulforge가 원천을 받아들인 시각 | 수집·ledger ingest |
| `received_at` | operational-primary가 packet/event를 받은 시각 | clock-skew fallback, delete/restore transition |
| `planned_for` | 미래 계획 시각 | 할일 마감, 회의, SE 일정 |

표시 시각은 위 필드 중 하나를 고른 파생값이며 `time_basis`와 `time_state`를
함께 반환한다. 잘못되거나 없는 시각은 버리지 않고 `날짜 미상`에 남긴다.
날짜-only 값은 자정 사건으로 위장하지 않고 `date_only`로 표시한다.

## 5. source lane

| lane | 현재 owner | MVP 해석 | 완전성 한계 |
| --- | --- | --- | --- |
| mail | `core_mail`, project mail history | 수신·발신 metadata event | provider/ingest clock이 모든 legacy row에 없음 |
| ERP work | `event_log` | 할일·상태·담당·사람/시스템 전이 | 외부 작업을 모두 대표하지 않음 |
| SE schedule | schedule events, due, meetings | 실제 전이와 planned event 분리 | 외부 SE master schedule 변경 이력은 별도 |
| voice | accepted voice task lineage | 승인 route의 intake metadata | 녹음 발생 시각이 projection에 유실된 legacy가 있음 |
| Codex instruction | task-bound Codex message metadata | user-role record, 본문 제외 | dev-ERP 밖 Codex 지시는 미수집 |
| artifact metadata | artifact/attachment/deliverable metadata | 등록·변경 metadata | 실제 파일 생성 source truth가 아님 |
| activity | future source adapter | gap | cross-PC activity를 과제에 exact 귀속할 계약 필요 |
| file activity | ERP upload + file observation helper | ERP upload는 partial, 일반 파일은 별도 packet | 네 PC collector의 live transport/activation 전에는 전체 이력을 주장하지 않음 |

메일 본문, HTML, 첨부 내용, 음성 transcript/audio, Codex message text, file
payload, 절대경로는 API 응답에 포함하지 않는다.

### 5.1 네 PC와 ERP 파일 이력 계약

이 과제의 파일 표면은 `work_pc`, `tool_pc`, `portable_dev_pc`,
`always_on_node` 네 역할과 ERP 업로드로 구성된다. 고성능 PC가 도구 실행과
24시간 운영을 함께 하더라도 `tool_pc`와 `always_on_node` identity는 분리한다.
Mac mini와 다른 always-on 후보 가운데 정확히 하나만 reconciler primary가 된다.

파일명·경로·mtime·birthtime·inode는 identity가 아니다. 아래 다섯 개체를 분리한다.

```text
workspace_binding_id   공유 논리 worksite
logical_file_id        이름과 경로가 바뀌어도 유지되는 파일 계보
content_id             sha256:<full digest>
revision_id            논리 파일 안의 내용 변경 사건(parent 포함)
observation_id         특정 node가 특정 scan에서 본 불변 관측
```

- 같은 논리 파일에서 hash가 바뀌면 새 revision이다.
- 같은 hash에서 mtime/stat만 바뀌면 revision이 아니라 touch 관측이다.
- 기존 path가 사라지고 새 path에 같은 verified revision이 1:1로 나타나면 rename이다.
- 기존 path가 남은 채 같은 content가 새 path에 나타나면 새 logical file인 copy다.
- `A -> B -> A`는 내용 hash가 A와 같아도 parent가 달라 세 번째 revision 사건이다.
- 같은 parent A에서 두 node가 B/C를 만들면 두 head를 모두 보존하고 conflict로 남긴다.
- 삭제는 `work_pc` authority의 complete scan에서 두 번 이상, operational-primary가
  받은 첫 부재 packet 뒤 기본 24시간 grace가 지난 경우만 확정한다. producer PC의
  시계는 grace를 앞당길 수 없고 partial/failed/budget-limited scan은 삭제 근거가 아니다.

관측 packet은 `observed_at`, `ingested_at`, 낮은 신뢰의 `fs_modified_at`을 구분한다.
5분 초과 clock skew는 receipt/scan sequence 순서를 우선하고, 15분 초과는 정확한
시간 순서를 주장하지 않는다. 일반 스캐너가 활성화되기 전에도 ERP가 commit한
`event_log.input_upload -> deliverable_input` exact join은 즉시 파일 사건으로
보이되 lane 상태는 `partial`이고 일반 파일 미관측 gap을 계속 표시한다.

collector는 node별 immutable packet만 쓴다. 여러 PC가 하나의 JSONL/latest 파일을
같이 수정하지 않는다. sole reconciler가 packet을 검증한 뒤 logical file/revision/event
projection을 쓴다. 실제 파일은 `_workspaces` 또는 승인된 shared worksite에 남고,
`_workmeta`에는 metadata, hash, 상대 ref, coverage만 둔다.

안전 기본 주기는 다음과 같다. 실제 scheduler와 node transport는 identity/binding을
확인한 뒤 별도 활성화한다.

| 역할 | 빠른 관측 | complete/즉시 계기 |
| --- | --- | --- |
| `work_pc` | 활성·mount 중 5분 | 시작·resume·remount, 매일 full |
| `tool_pc` | 도구 작업 중 10분 | export 직후, run close, 매일 full |
| `portable_dev_pc` | 과제 활성 중 15분, battery-aware | 시작·resume·mount, 오래된 baseline 갱신 |
| `always_on_node` | 유효 binding+primary일 때 5분 | packet inbox 1분 reconcile, 매일 full |
| ERP | polling 없음 | commit 직후 exact upload event + targeted reconcile |

hash는 stat tuple이 변하지 않은 파일만 이전 verified 값을 재사용한다. 새 파일과
변경 후보는 기본 64 MiB까지 즉시 streaming SHA-256, 그 이상은 byte/time budget
queue로 보낸다. hash pending은 revision을 만들지 않는다. secret/env/token/credential,
temp/partial/Office lock, nested symlink/junction은 기본 제외하고 절대경로·hostname·
username·payload를 packet에 쓰지 않는다. NFC/casefold/trailing-dot-space 충돌은
덮어쓰지 않고 conflict로 격리한다.

### 5.2 precomputed projection intake와 ERP exact dedupe

dev-ERP API는 workspace, `revision_state.json`, observation partition을 직접 scan하지
않는다. 아래 reconciler-owned 단일 파일만 exact read하며, 파일이 없거나 invalid면
ERP upload 사건은 유지하고 scanner coverage를 `missing|rejected`로 표시한다.

```text
_workmeta/<project>/reports/file_activity/projections/life_tree_events.json
schema_version = soulforge.file_activity_life_tree_projection.v1
```

- top-level/source-checkpoint/coverage/boundary/event/access는 exact key allowlist다.
- 최대 8 MiB, 최대 5,000 events이며 symlink, oversize, foreign project, traversal,
  unknown field/token, raw/path field, conflicting duplicate source ID는 source 단위로
  fail closed한다. 동일 source ID의 identical duplicate만 idempotent하게 한 번 읽는다.
- scanner event 기본 access는 `admins`; 명시적 `accounts` allowlist가 있을 때만 해당
  account에 보인다. scope filtering은 lane cap보다 먼저 적용하고 inaccessible 총량은
  일반 사용자에게 노출하지 않는다. hidden row만으로 생긴 global truncation 여부도
  scoped 응답에서는 숨기고 `scope_withheld=true`만 남긴다.
- API에는 node alias, packet/content hash, byte size, partition/correlation ref를 내보내지
  않고 stable source-event ID와 generic event label만 남긴다.
- `file_first_observed`는 생성 시각 주장이 아니라 최초 관측 사건으로 표시한다.
- `erp_upload_event_ref`가 null이면 scanner 사건은 별도 잎이다. non-null이어도 같은
  project의 existing `event_log.input_upload -> deliverable_input` exact join, exact SHA-256,
  그리고 양쪽 size가 모두 있을 때 동일함을 모두 통과해야만 기존 ERP 잎에 scanner
  evidence ref를 합친다. 파일명·시각·hash-only 유사성으로 dedupe하지 않는다.
- exact candidate가 둘 이상이거나 ref/hash/size가 불일치하면 ERP와 scanner 사건을
  모두 별도 잎으로 보존하고 uncertainty를 표시한다.
- 5분 초과 producer skew는 primary `received_at`, `time_state=fallback`을 표시 기준으로 사용하고,
  15분 초과는 exact temporal ordering 차단을 명시한다. 삭제·복구 interval basis는
  각각 `confirmed_absence_receipt_threshold`,
  `bounded_by_delete_receipt_and_primary_receipt`를 그대로 보존한다.

## 6. 파생 사건 envelope

```text
event_id                 stable namespaced projection id
lane_id                  source lane
source_record_ref        opaque metadata ref
kind / summary_label     allowlist display metadata
temporal_role            occurred | observed | state_change | planned
occurred_at              nullable
observed_at              nullable
recorded_at              nullable
ingested_at              nullable
received_at              nullable
planned_for              nullable
change_interval          nullable {after,before,basis}
display_at / day_key     derived, Asia/Seoul
time_basis / time_state  exact | date_only | fallback | unknown
project_binding          confirmed | inbox | suggested | conflict
task_links               exact links only
context_links            exact branch links only
uncertainty              confirmed | partial | review_needed | conflict
evidence_refs            exact source refs; exact ERP merge일 때 복수
```

같은 입력과 `as_of`에서는 정렬과 ID가 결정적이어야 한다. dedupe는 exact source
identity만 사용하고 제목 유사도나 LLM 의미 유사도를 사용하지 않는다.

## 7. API와 생명수 모양

```text
GET /api/context/life_tree
  ?project=<project_code>
  &days=30
  &lanes=<allowlist>
  &temporal_roles=<occurred,observed,state_change,planned>
```

- 로그인과 기존 과제 접근 경계를 적용한다.
- `days` 기본 30, 최대 90.
- 기본 역할은 `occurred,observed,state_change`이고 `planned`는 UI에서 명시적으로 켠다.
- lane당 최대 500, 전체 최대 2,000 events.
- lane별 scanned/accepted/shown/skipped/undated/truncated와 전체 coverage를 반환한다.
- 읽기 호출은 DB, ledger, `event_log`, `project_context`를 변경하지 않는다.

파생 트리는 다음 순서다.

```text
project trunk
  -> day branch (latest first)
     -> confirmed context branch
        -> event leaves
     -> 확인 필요 branch
  -> 날짜 미상 branch
```

일일 node는 API 응답 안에서만 존재한다. `branches.csv`/`nodes.csv`에 쓰지 않는다.

## 8. UI

기존 과제 허브 `줄기`에 다섯 번째 `일일 생명수` 렌즈를 추가한다.
새 top-level route나 default route는 만들지 않는다.

- 렌즈를 선택할 때만 lazy API를 호출한다.
- 실제 사건이 기본이며 예정 일정은 토글로 켠다.
- 날짜, context, 사건은 native `details`/`summary`/`button`/`time`으로 읽는다.
- lane은 색뿐 아니라 항상 텍스트 badge로 표시한다.
- exact task/branch만 기존 상세·가지 이야기로 이동한다.
- suggested/review-needed는 근거와 누락만 보여주고 쓰기 CTA를 두지 않는다.
- `truncated`, `undated`, source gap을 빈 성공처럼 숨기지 않는다.
- 1024px 이하 1열, 640px 이하 접이식 필터, 390px 화면에서 가로 스크롤 0을
  검증한다.

## 9. 구현 단계

1. **안전 gate**: explicit review 후보의 auto-open 차단.
2. **순수 projection**: allowlist adapters, clock semantics, exact binding,
   cap/gap/undated를 가진 `context_life_tree` builder.
3. **lazy API**: 인증·입력 검증·read-only invariant.
4. **일일 렌즈**: 기존 B9 안의 다섯 번째 렌즈와 responsive/a11y 상태.
5. **파일 이력 helper**: multi-node observation/revision 순수 엔진과 합성 fixture.
   실제 scheduler/transport는 기본 OFF이며 node binding 뒤 별도 활성화.
6. **source 강화**: voice clock 보존, outbound continuity, dev-ERP 밖 Codex/activity
   collectors는 각각 owner와 validator가 닫힌 뒤 별도 slice로 연결.

## 10. 완료 기준

- needs-review/rejected 후보가 auto-open되지 않는다.
- 합성 fixture에서 mail in/out, ERP work, SE planned, accepted voice, Codex
  instruction metadata, artifact metadata, undated, gap lane이 재현된다.
- planned와 observed/state-change를 분리할 수 있다.
- exact item/mail branch binding만 context에 붙고 나머지는 확인 필요로 간다.
- raw/body/transcript/audio/Codex text/pointer 계열 필드가 응답에 없다.
- API 호출 전후 source/event row 수가 같다.
- 파일 helper fixture에서 create/seen/modify/rename/copy/touch/A-B-A/concurrent
  conflict/NFC 충돌/delete grace/partial scan/hash pending/duplicate packet이 결정적으로 재현된다.
- 출력에 절대경로, hostname, username, secret 경로·값, payload가 없다.
- 기존 B9 map/story/diagnostics와 dev-ERP 회귀 테스트가 통과한다.
- desktop/tablet/mobile과 keyboard-only에서 일일 렌즈를 읽을 수 있다.
- 독립 reviewer가 public/private 경계, clock 정직성, claim ceiling을 승인한다.

## 11. 비목표

- 외부 메일·캘린더·파일 시스템·팀 도구에 쓰기
- LLM 기반 fuzzy project/task/branch 확정
- scheduler/watcher/network transport를 node binding 없이 활성화
- 파일 이력 helper를 byte-version backup으로 주장
- daily ledger를 source truth로 승격
- B9 지도 또는 project context ontology 교체
- workflow 등록이나 default route 변경
