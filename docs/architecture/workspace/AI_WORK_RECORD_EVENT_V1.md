# AI 작업 기록 공통 이벤트 v1

## 목적과 상태

`soulforge.ai_work_record_event.v1`은 controlled wrapper, MCP, CLI 또는 hook가
직접 관찰한 bounded AI 업무를 공통 metadata-only 사건으로 표현하는 additive
계약이다.

- owner: `[AX] 할일엔진·MCP 책임자`
- 구현 상태와 claim ceiling: `canon_candidate`
- schema: `guild_hall/shared/ai_work_record_event.v1.schema.json`
- pure validator/digest:
  `guild_hall/shared/ai_work_record_event.mjs`

이 계약은 collector, writer, DB, MCP server, scheduler, hook, default route 또는
공식 완료 authority를 활성화하지 않는다. 계약 instance는 machine-local/private
metadata이며 public repo에는 schema, 문서와 synthetic test만 둔다.

## 필수 검증 계층

JSON Schema는 필드 shape, enum, bounded length, 단일 행 pattern, false sentinel,
event-kind별 조건과 static ref gate를 검사한다. Schema-only 검사는 다음을 결정할
수 없으므로 충분하지 않다.

- 실제 달력에 존재하는 시각인지와 세 시각의 순서
- canonical digest 일치
- replay, conflict와 idempotency
- sequence/previous digest 및 lifecycle 전체 순서
- recursive raw/secret/chat policy
- correction target이 앞선 사건과 exact-match하는지

따라서 controlled adapter는 strict schema 검사와 함께
`validateAiWorkRecordEvent` 및 `reduceAiWorkRecordEvents`를 반드시 사용해야
한다. Schema 통과를 저장 승인이나 완료로 해석하지 않는다.

## 사건 identity와 시각

필수 identity는 `event_id`, `work_id`, `idempotency_key`, `project_ref`,
`task_ref`다. A1-native ID는 공통 wire 교집합
`^[A-Za-z0-9][A-Za-z0-9_.-]{1,119}$`, 즉 2..120자로 제한한다.
`task_ref: pending`은 아직 task binding이 확정되지 않았음을 뜻하며 문맥으로
binding을 추정하지 않는다.

기존 WorkSession 또는 `codex_work_context`의 colon-bearing ID 등 교집합 밖
source ID를 rename, truncate 또는 normalize하지 않는다. Adapter는 결정적인
safe A1 alias를 만들고 `source_refs`에 다음 exact mapping ref를 함께 넣는다.

```json
{
  "ref_kind": "mapping",
  "ref_id": "source-native-id-preserved-exactly",
  "mapping_field": "event_id",
  "mapping_alias": "safe.a1.alias"
}
```

`mapping.ref_id`는 source-local adapter/caller가 제공한 원본 ID 그 자체이며
digest 대체값이 아니다. Source-local adapter/caller가 exact-source fidelity의
authority이고, static schema와 JS validator는 선언된 equality·bijection 및
알려진 digest-only sentinel만 검사한다. 따라서 이 계약 검사가 임의의 자연어
source ID의 외부 provenance를 보증하지는 않는다.

`validateAiWorkRecordIdAliasMapping`으로 source ID, field, alias와 mapping ref를
대조한다. 같은 field에서 source ID 하나는 alias 하나에만, alias 하나는 source
ID 하나에만 대응해야 한다. 이 일대일 exact reversible mapping을 만들 수 없으면
adapter는 `HOLD`한다. `sha256:<64 hex>` 또는 bare 64-hex처럼 원본 ID 대신
digest만 담은 것으로 식별되는 mapping은 schema와 JS 모두 `HOLD`한다. 실제 원본
ID 자체가 이 sentinel과 구별되지 않는 경우도 v1에서는 지원하지 않으며, 값을
변환하거나 묵인하지 않고 이후 explicit source-pointer 계약을 사용한다.

actor는 `node_id`, `agent_id`, `tool`, `tool_version`을 함께 남긴다.

- `started_at`: bounded work가 시작된 시각
- `occurred_at`: 해당 사건이 발생한 시각
- `recorded_at`: controlled path가 사건을 기록한 audit 시각

세 값은 canonical UTC millisecond 형식 `YYYY-MM-DDTHH:mm:ss.sssZ`를 사용한다.
Validator는 달력 유효성과 `started_at <= occurred_at <= recorded_at`을
확인한다.

## lifecycle, digest와 correction

유일한 unique-event lifecycle은 다음과 같다.

```text
start(sequence=0, previous=null)
  -> checkpoint*
  -> closeout_pending
  -> closeout
  -> correction*
```

- `start`는 정확히 한 번이다.
- `closeout_pending`은 정확히 한 번이며 `closeout` 전에 필수다.
- `closeout_pending` 뒤에는 checkpoint를 추가할 수 없다.
- `closeout`은 terminal이다. 이후에는 correction만 추가할 수 있다.
- replay는 어느 지점에서도 올 수 있지만 lifecycle state를 바꾸지 않는다.
- unique 사건은 직전 unique sequence + 1과 직전 digest를 exact-reference한다.

`event_digest`는 최상위 `event_digest`만 제외한 payload의 canonical JSON
SHA-256이다. Object key는 UTF-8 순서로 정렬하고 array 순서를 보존하며,
string은 well-formed NFC, number는 safe integer만 허용한다.

같은 `event_id`와 같은 digest는 replay/no-op이고, 같은 `event_id`의 다른
digest 또는 같은 `idempotency_key`의 다른 사건은 `HOLD`다.

correction은 closeout 뒤에만 허용되는 audit annotation이다.
`correction_ref`는 앞선 사건의 `{event_id, event_digest}`와 bounded single-line
`reason`을 담고 target을 exact-match한다. correction은 result/evidence,
stop condition 또는 uncertainty를 운반하지 않으며 patch/replacement payload도
없다. Correction의 `source_refs`도 audit `source`와 ID `mapping` ref만 허용한다.
Terminal lifecycle, `closeout_kind`, result/evidence projection과 과거 사건은
전혀 바꾸거나 다시 열지 않는다. 상태 변경은 별도 lifecycle 또는 향후
superseding-work 계약이 필요하다.

## terminal outcome

모든 `closeout`은 `closeout_kind`를 하나 가져야 한다.

| `closeout_kind` | 공통 gate 외 추가 조건 | 의미 |
| --- | --- | --- |
| `completed_candidate` | 없음 | 결과·증거가 있는 완료 후보이며 공식 완료가 아님 |
| `blocked` | `stop_conditions` 1개 이상 | 중단 조건으로 닫힌 기록 |
| `handoff` | result에 `packet` 1개 이상 | 다음 owner/controller로 넘긴 기록 |
| `abandoned` | stop condition 또는 uncertainty 1개 이상 | 성공이 아닌 중단 기록 |

네 종류 모두 다음 공통 gate를 충족해야 한다.

- `result_refs`에 `ref_kind: result|packet`이 1개 이상
- `evidence_refs`에
  `evidence|tool_receipt|command_receipt|file|git|test|build|packet`이 1개 이상

`source`는 어느 gate도 충족하지 않는다. Gate 또는 kind별 조건이 아직 없으면
`closeout`을 만들지 않고 `closeout_pending`으로 남긴다. Pending 사건에 ref가
이미 있어도 closeout 사건이 별도로 수락되기 전에는 pending이다.

모든 사건의 `official_completion`은 `false`다. 특히 `blocked`, `handoff`,
`abandoned`는 성공, ERP 완료, WorkSession acceptance 또는 owner acceptance로
표현하지 않는다. `completed_candidate`도 공식 완료가 아니다.

## metadata ref와 path policy

`source_refs`, `result_refs`, `evidence_refs`는 bounded metadata ref 목록이다.
이 shape는 LLM 없이 다음 controlled-path metadata를 표현한다.

- start/end time과 node/agent/tool/version
- work/task/project identity
- tool/command receipt
- file pointer와 hash
- Git ref
- test/build exit
- outbox enqueue/retry/ack
- packet state

`path_ref`는 forward slash를 쓰는 normalized relative metadata pointer만
허용한다. `%` encoding, backslash, drive/UNC absolute path, URL/scheme,
NUL/control 문자, 빈 segment와 `.`/`..` segment는 금지한다. External logical
identifier는 `ref_id`에 두며 `path_ref`로 위장하지 않는다.

Private instance에서는 owner-approved pointer로 `_workspaces/`, `_workmeta/`,
`guild_hall/state/`와 tracked repo root 아래 상대경로를 사용할 수 있다.
Pointer 허용은 target을 읽거나 복사하거나 public repo에 공개할 권한을 주지
않는다. Public 문서와 테스트에는 synthetic pointer만 둔다.

## metadata-only와 sentinel 한계

`purpose`는 단일 행 160자, `scope`는 단일 행 240자까지다.
`stop_conditions`, `uncertainties`의 각 항목도 단일 행 160자까지다.
Validator는 다음 policy sentinel을 fail-closed로 검사한다.

- chat-like `{role, content}` object와 행 선두 `User:`/`Assistant:`
- `body_text`, `body_html`, `provider_payload`와 raw body/transcript field
- password, cookie, secret, token, credential, API key, authorization,
  bearer, access/refresh/auth token, client secret, private key와
  session-token/cookie field/value family
- 알려진 `ghp_`, `xoxb-`, `AKIA`, PEM private-key marker와 대소문자 구분 없이
  공백·underscore·hyphen으로 구분된 `private key` marker
- whole-chat, screen, keyboard와 broad OS capture marker

`whole_chat_capture`, `screen_capture`, `keyboard_capture`,
`os_activity_capture`는 항상 `false`다.

이 검사는 알려진 sentinel과 구조 policy enforcement이며 universal DLP가 아니다.
Controlled caller/writer가 애초에 metadata-only input만 제공할 책임이 있다.
실제 원문, 대화 본문, credential, secret, 화면·키 입력·광범위한 OS 활동은
계약에 넣지 않는다.

## atomic reducer와 관찰 한계

Reducer는 batch를 atomic/fail-closed로 판정한다. Conflict, gap, policy 또는
lifecycle 실패가 하나라도 있으면 `decision: HOLD`, `accepted_count: 0`,
`persistence: forbidden`, `acknowledgement: hold`이며 어떤 사건도 저장하도록
승인하지 않는다.

HOLD가 없고 새 사건이 하나 이상이면 trailing replay가 있어도 aggregate
decision은 `accept`다. `decision: no_op`은 supplied prior history와 비교해
입력 전체가 identical replay이고 `accepted_count: 0`일 때만 가능하다.

Controlled path를 우회하거나 해당 path가 관찰하지 않은 실행은 `unobserved`다.
다른 metadata로 존재, 성공 또는 완료를 추정하지 않는다. “100% 수집” 표현은
exact controlled adapter와 관찰 window를 명시한 bounded claim으로만 허용한다.
LLM 목적·결과 요약과 evidence-quality 판단은 선택 enrichment이며 digest,
lifecycle, gate 또는 authority의 필수 입력이 아니다.

## 기존 surface와의 호환성

| 기존 surface | v1 관계 |
| --- | --- |
| 5필드 업무 결과 요약 / `bounded_work` | 별도 proxy를 rename하거나 대체하지 않는다. |
| HPP `codex_work_context` | lifecycle/replay 의미를 재사용하지만 기존 module, operation, path와 ID를 바꾸지 않는다. |
| personal WorkSession | sequence/digest/gap/HOLD와 completion ceiling 의미를 재사용하지만 accepted WorkSession이 아니다. |
| H03/H05, `run_log`, workflow receipt | metadata ref로 가리킬 수 있으나 기존 ID/schema와 acceptance authority를 바꾸지 않는다. |
| project timeline / `scope_timeline_binding.v1` | 승인된 adapter의 source가 될 수 있으나 이 계약은 projection이나 binding을 만들지 않는다. |

Pure module은 canonical JSON/digest, event sealing/validation, ID mapping 검사와
atomic chain reduction만 제공한다. Filesystem, network, LLM 또는 runtime service
side effect가 없다.
