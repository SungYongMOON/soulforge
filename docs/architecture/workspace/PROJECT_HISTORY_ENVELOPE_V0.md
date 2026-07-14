# Project History Envelope v0

## 상태와 목적

- 상태는 `canon_candidate`다. owner ratification 전에는 adapter, live collector,
  migration, writer, resolver, completeness 판정 또는 운영 기본 경로로 사용하지 않는다.
- 서로 다른 입력 lane의 project history occurrence를 같은 metadata-only event
  envelope로 검증하고, 별도 coverage receipt로 수집 범위와 0건을 증명한다.
- event envelope와 coverage receipt를 분리한다. `complete_no_events`, `failed`,
  `not_collected`, `not_applicable`를 표현하려고 가짜 event를 만들지 않는다.
- H00는 master plan §3.4.1의 개념적 nested coverage block을, zero-event window에는
  envelope가 없고 반복된 nested coverage가 event digest를 churn시키므로 owner
  ratification이 필요한 독립 coverage receipt로 정제한다.
- 이 문서와 `guild_hall/shared/project_history_envelope.mjs`는 public synthetic
  contract/helper다. raw payload, private identifier, runtime state, DB, filesystem,
  transport를 읽거나 쓰지 않는다.

## ASSUMPTIONS

1. timestamp는 `new Date(value).toISOString()`과 byte-for-byte 같은 UTC ISO 8601
   millisecond 문자열만 canonical이다. `event_at`과 `valid_at`만 literal
   `unknown`을 허용하고, `observed_at`만 `null`을 허용한다.
2. coverage window는 envelope의 `known_at`을 기준으로 한 half-open
   `[window_start, window_end)`다.
3. 모든 clock에 보편적인 인과 순서를 추정하지 않는다. 공통으로 강제하는 비교는
   `recorded_at <= known_at`뿐이다.
4. `failed`는 `event_count: null`이고 event가 없으며, `partial`은 정확한 0 이상
   count와 하나 이상의 gap code를 가진다.
5. owner가 ratify하기 전에는 adapter와 live use를 활성화하지 않는다. D25가 live
   completeness 의미와 gap vocabulary를 소유하며, 이 후보는 gap code의 안전한
   token shape만 검사한다.

## 1. 공통 typed ref와 canonical JSON

관계 endpoint는 bare string이 아닌 정확히 다음 세 key를 가진 typed ref다.

```json
{"entity_type":"event","owner_surface":"synthetic_mail","entity_id":"mail-event:001"}
```

- exact keys: `entity_type`, `owner_surface`, `entity_id`
- `entity_type`은 최대 64자의 lowercase `lower_snake` token이다. field별 expected
  type은 `source_owner`, `event`, `source_revision`, `content`, `project`,
  `rule_revision`이며, `native_occurrence_ref`만 owner가 발급한 native type을 그대로
  보존한다.
- `owner_surface`와 `entity_id`는 최대 256자이며, 모든 값은 이미 NFC인 non-empty
  opaque logical token이어야 한다.
- whitespace/control, `/` 또는 `\\` path separator, URI, wildcard/placeholder,
  fuzzy sentinel, extra key를 거부한다.
- `content`의 `entity_id`는 `sha256:<64 lowercase hex>`만 허용한다.
- H00은 supplied ref의 형태와 byte-exact 보존만 검사한다. 해당 source owner/native
  type이 실제로 그 lane에 속하는지, live record가 존재하는지는 추론하지 않는다.
  H01~H05 adapter가 owner-approved lane allowlist, binding, existence를 검증해야 하며
  그 전에는 HP-HISTORY-08 전체 합격을 주장하지 않는다.

canonical JSON은 plain object, array, string, boolean, null, safe integer만 받는다.
string과 object key는 unpaired UTF-16 surrogate가 없는 well-formed Unicode이며 이미
NFC여야 한다. `-0`, float, unsafe integer, `Date`, sparse array, accessor, symbol key,
`undefined`, function, symbol, bigint, cycle을 거부한다.
object key는 UTF-8 byte order로 재귀 정렬하고 구조 whitespace나 trailing newline 없이
직렬화한다. SHA-256 표면은 lowercase `sha256:<64 hex>`다.

`metadata_digest`는 해당 record에서 **top-level `metadata_digest` 하나만** 제외한
canonical JSON을 SHA-256으로 hash한다. 중첩된 같은 이름의 key는 제외하지 않는다.

## 2. Event envelope

exact fields:

| field | 계약 |
| --- | --- |
| `schema_version` | `soulforge.project_history_envelope.v1` |
| `occurrence_id` | 아래 결정식으로 만든 ID |
| `lane` | `mail | voice | structured_pc_work | file | run_log` |
| `source_owner_ref` | `source_owner` typed ref |
| `native_occurrence_ref` | owner-issued native `entity_type`을 보존한 source-local immutable occurrence typed ref; lane membership은 H01~H05에서 검증 |
| `event_ref` | 이 envelope가 나타내는 `event` typed ref |
| `source_revision_ref` | `source_revision` typed ref 또는 `null` |
| `content_ref` | `content` typed ref 또는 `null` |
| `project_ref` | 분류 결과 `project` typed ref 또는 `null` |
| `event_at`, `valid_at` | canonical UTC timestamp 또는 literal `unknown` |
| `observed_at` | canonical UTC timestamp 또는 `null` |
| `known_at`, `recorded_at` | canonical UTC timestamp |
| `classification_before`, `classification_after` | classification state 또는 `null` |
| `supersedes_event_ref` | 교체 대상 `event` typed ref 또는 `null` |
| `metadata_digest` | top-level self field만 제외한 metadata digest |
| `raw_payload_copied` | 항상 boolean `false` |

`occurrence_id`는 project 분류와 무관하게 다음처럼 결정한다.

```text
ph-occ: + lowercase_sha256_hex(canonical_json({lane, native_occurrence_ref}))
```

따라서 같은 lane/native occurrence를 다른 project로 분류해도 occurrence identity는
바뀌지 않는다. 하나의 occurrence에는 서로 다른 `event_ref`/digest를 가진 append-only
classification/reclassification event가 여러 개 존재할 수 있다. `source_revision_ref`와
`content_ref`는 함께 존재하거나 함께 `null`이어야 한다. source-bearing event의 exact
revision/content 결합을 한쪽만 주장하지 않는다.

classification state의 exact shape는 다음과 같다.

```json
{"state":"classified","project_ref":{"entity_type":"project","owner_surface":"synthetic_project_registry","entity_id":"project:p01"}}
```

- `state`는 `classified | unclassified`다.
- `classified`는 non-null project ref, `unclassified`는 `project_ref: null`이다.
- before/after는 다섯 lane 모두에서 사용할 수 있다.
- `classification_after`가 있으면 그 `project_ref`는 top-level `project_ref`와 정확히
  같아야 한다.
- event가 자기 `event_ref`를 supersede할 수 없다. collection 안에 target이 있으면 같은
  `occurrence_id`여야 하며 project 변경은 허용한다. target의
  `classification_after`와 successor의 `classification_before`는 둘 다 `null`이거나
  byte-exact하게 같아야 한다. collection 검증은 보이는 cycle과 duplicate event
  ref/digest를 거부하지만 같은 occurrence의 여러 event는 허용한다. collection 밖
  target을 억지로 존재한다고 추정하지 않는다.

## 3. Coverage receipt

exact fields:

| field | 계약 |
| --- | --- |
| `schema_version` | `soulforge.project_history_coverage_receipt.v1` |
| `lane`, `source_owner_ref`, `project_ref` | 묶인 envelope와 exact-match하는 scope |
| `window_start`, `window_end` | canonical UTC, `window_start < window_end` |
| `state` | 아래 state matrix |
| `event_count` | exact nonnegative integer 또는 matrix가 정한 `null` |
| `gap_codes` | D25-owned lowercase safe code(최대 128자)의 중복 없는 canonical UTF-8 byte order array |
| `applicability_ref` | `rule_revision` typed ref 또는 `null` |
| `ordered_event_digest` | 정렬된 envelope metadata digest array의 hash |
| `metadata_digest` | top-level self field만 제외한 metadata digest |
| `raw_payload_copied` | 항상 boolean `false` |

| state | `event_count` | `gap_codes` | `applicability_ref` | bound events |
| --- | ---: | --- | --- | --- |
| `complete_with_events` | `>= 1` | empty | `null` | exact count |
| `complete_no_events` | `0` | empty | `null` | none |
| `partial` | `>= 0` | non-empty | `null` | exact count |
| `failed` | `null` | non-empty | `null` | none |
| `not_collected` | `null` | non-empty | `null` | none |
| `not_applicable` | `null` | empty | required `rule_revision` | none |

bound envelope는 receipt와 lane/source owner/project가 같고 `known_at`이
`[window_start, window_end)` 안에 있어야 한다. count가 정확히 같아야 하며 event ref와
metadata digest가 모두 unique해야 한다. 0건/null count state에는 envelope를 bind하지
않는다.

event 정렬 key는 다음 순서다. 모든 문자열 비교는 UTF-8 byte order이며 project는
`null`이 non-null canonical ref보다 먼저 온다.

1. `known_at`
2. `recorded_at`
3. lane rank: `mail`, `voice`, `structured_pc_work`, `file`, `run_log`
4. canonical `project_ref` (`null` first)
5. `occurrence_id`
6. canonical `event_ref`
7. `metadata_digest`

`ordered_event_digest`는 위 순서로 정렬한 `metadata_digest` 문자열 array의 canonical
JSON을 SHA-256으로 hash한다. 0건/null count receipt는 빈 array의 digest를 사용하되,
그 digest는 event 존재 주장이 아니다.

## 4. Pure helper surface

`guild_hall/shared/project_history_envelope.mjs`는 named export만 제공한다.

- schema/lane/state/entity-type constants와 `ProjectHistoryEnvelopeError`
- `validateTypedRef`, `canonicalJson`, `sha256Canonical`, `computeMetadataDigest`
- `deriveOccurrenceId`
- `createProjectHistoryEnvelope`, `validateProjectHistoryEnvelope`
- `validateProjectHistoryEnvelopeCollection`, `sortProjectHistoryEnvelopes`
- `createProjectHistoryCoverageReceipt`, `validateProjectHistoryCoverageReceipt`

모든 함수는 in-memory value만 받고 새 envelope/receipt/array를 반환하거나 deterministic
validation error를 던진다. filesystem, CLI, writer, adapter, resolver, DB, network,
clock read, random source가 없다.

## 5. Ratification 전 중단선

- 이 후보를 기존 mail/voice/file/run-log record에 소급 적용하거나 live collector에
  연결하지 않는다.
- completeness/gap code를 이 helper에서 발명하지 않는다. D25 owner surface의 ratified
  vocabulary/revision을 적용할 때만 `gap_codes`와 `applicability_ref`를 공급한다.
- raw mail subject/body, audio/transcript, file/log/conversation/screen/keystroke, secret,
  provider payload를 envelope/receipt에 추가하지 않는다. exact-key validation이 이를
  거부하며 `raw_payload_copied`는 항상 `false`다.
