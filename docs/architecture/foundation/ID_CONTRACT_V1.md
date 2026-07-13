# ID Contract v1

- 상태: `canon_candidate`
- authority: [`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)의 하위 실행 프로필
- 구현 기준: `guild_hall/shared/temporal_identity.mjs`
- 범위: source, source revision, extraction, evidence locator, RAG index/chunk의 새 ID 발급과 충돌 판정
- 비범위: 기존 ERP ID 재발급, 실제 자료 이동, 실데이터 재색인, writer 활성화

## 1. 한 줄 원칙

사람이 읽는 이름과 바뀌지 않는 ID를 분리한다.

제목, 파일명, 경로, 메일 제목, 표시용 날짜, 파일 `mtime`은 ID가 아니다. 이런 값은
`display_label`, observation, storage binding 같은 설명 필드에 둔다. ID에는 owner가 발급한
불변 키와 정확한 revision·occurrence·profile만 넣는다.

이 문서는 상위 온톨로지의 entity·relation·시간 의미를 바꾸지 않는다. 상위 문서가 정한
`source_revision_id`, `content_id`, `valid_at`, `known_at`, typed ref를 실제 코드에서 같은
방식으로 만들기 위한 하위 실행 계약이다.

## 2. 공통 생성 프로필

```yaml
id_generation_profile_id: soulforge.identity_basis.cjson_nfc_utf8.v1
digest: sha256:<64 lowercase hex>
generated_id: <kind-prefix><digest 앞 32 hex>
```

32자리 접미사는 짧게 표시하고 조인하기 위한 값이다. 충돌 판정과 재현에는 항상 다음 세
값을 함께 보존한다.

- `identity_basis`: 정규화된 전체 ID 근거
- `identity_canonical`: UTF-8 canonical JSON
- `identity_digest`: 전체 `sha256:<64hex>`

32자리 접미사가 같더라도 전체 digest나 전체 basis가 다르면 같은 ID로 받아들이지 않는다.

### canonical typed ref

전역 관계 endpoint는 bare 문자열이 아니라 정확히 세 필드를 사용한다.

```yaml
entity_type: source_revision
owner_surface: source_metadata
entity_id: sr_<32hex>
```

전역 조인 키는 `{entity_type, owner_surface, entity_id}` 전체다. 세 필드 외의 값은 typed
ref 안에 넣지 않는다.

## 3. ID 종류와 정확한 basis

모든 basis에는 공통으로 `id_generation_profile_id`와 `id_kind`가 들어간다. 선택 필드는
누락시키지 않고 계약에 따라 `null` 또는 `[]`로 정규화한다.

| 개체 | 새 ID | identity basis | identity에서 제외 |
| --- | --- | --- | --- |
| 논리 source | `src_<32hex>` | `source_kind`, `owner_ref`, owner-issued `source_key`, `issuer_namespace` 또는 `null` | 제목, 파일명, 경로, 메일 subject |
| source revision | `sr_<32hex>` | `source_id`, `occurrence_key`, `content_id`, `canonicalization_profile_id`, `published_at`, `effective_from/to`, 정렬된 `applicability_refs[]` | revision label, 관측 경로, `mtime`, 수집 시각 |
| extraction run | `exr_<32hex>` | `source_revision_id`, `extractor_profile_id`, owner-issued `run_key`, `started_at`, 정렬된 `input_refs[]` | 실행 PC 이름, 임시 경로, 로그 본문 |
| evidence locator | `loc_<32hex>` | `source_revision_id`, `locator_kind`, canonical `locator`, `coordinate_profile_id` 또는 `null` | 표시용 page label, UI 위치 |
| RAG index | `ridx_<32hex>` | `scope_ref`, 정렬·중복 제거된 `source_revision_ids[]`, `parser_profile_id`, `chunk_profile_id`, `acl_profile_id`, `embedding_profile_id` 또는 `null` | 생성 폴더명, 현재 PC, index 표시명 |
| RAG chunk | `rch_<32hex>` | `source_revision_id`, `chunk_profile_id`, `evidence_locator_id`, `chunk_content_id`, 정렬된 `context_refs[]` | chunk 순번, `rag_index_id`, 출력 경로 |

`source_key`, `occurrence_key`, `run_key`는 사람이 붙인 이름이 아니다.

- `source_key`: owner가 한 논리 자료에 처음 부여한 불변 키
- `occurrence_key`: 공식 발행이나 별도 occurrence를 가리키는 불변 키
- `run_key`: parser 실행 1회를 가리키는 불변 키

파일명 속 날짜나 현재 시각을 이 키 대신 사용하면 안 된다. `published_at`,
`effective_from/to`, `started_at`처럼 표에 명시된 시간만 그 의미가 실제 identity를 바꿀 때
basis에 들어간다.

### chunk와 index의 분리

`rag_chunk_id`에는 index ID와 chunk 순번을 넣지 않는다. 같은 source revision, locator,
chunk profile, chunk bytes라면 index를 다시 만들더라도 chunk identity가 유지되어야 하기
때문이다. 반대로 index ID는 정렬된 revision 집합과 parser·chunk·ACL profile이 달라지면
새로 발급한다.

## 4. 자료 종류별 source 단위

| 자료 | source 단위 | revision·관계 규칙 |
| --- | --- | --- |
| 파일 | `logical_file_id` 하나가 source 하나에 대응 | 실제 bytes나 공식 occurrence가 바뀌면 새 source revision |
| 메일 | 메시지 1건이 source | 대화 묶음은 `source_collection_id`; subject는 ID가 아님 |
| 메일 첨부 | 메일과 별도 source | 메일 source와 `attached_to` 관계로 연결 |
| 음성 | 녹음 하나가 source | transcript는 별도 source/revision이며 녹음 revision과 `derived_from`으로 연결 |
| Excel | workbook이 논리 source | workbook bytes가 revision; sheet/cell/range는 locator |
| 동일 파일 복사본 | 새 source revision이 아님 | observation 또는 storage binding만 추가 |
| 같은 bytes의 별도 공식 재발행 | 별도 source revision | `occurrence_key`가 다르므로 새 revision; `content_id`는 같을 수 있음 |

같은 bytes라는 사실과 같은 공식 발행이라는 판단은 다르다. `content_id`가 같아도
occurrence가 다르면 source revision은 다를 수 있다.

## 5. content와 canonicalization

### raw byte content ID

`content_id`와 `chunk_content_id`는 문자열을 임의로 다듬은 결과가 아니라 실제 byte 전체의
SHA-256이다.

```text
sha256:<64 lowercase hex>
```

줄바꿈 변경, Unicode 정규화, trim, case folding을 raw bytes에 적용하지 않는다. 구조화
record를 별도 방식으로 canonicalize해야 한다면 승인된 별도 profile과 원본
`content_id`를 함께 보존해야 하며 raw hash를 덮어쓰지 않는다.

### canonical JSON allowlist

ID basis에서 허용하는 값은 다음뿐이다.

- `null`, boolean, string
- JavaScript safe integer
- array
- plain object

float, `NaN`, `Infinity`, unsafe integer, `undefined`, 함수, class instance, cycle은 거부한다.
각 ID builder는 위 표에 적힌 필드만 허용하며 알 수 없는 identity 필드는 거부한다.

정규화 규칙:

1. string은 NFC로 정규화하고 UTF-8로 직렬화한다.
2. object key는 printable ASCII만 허용하고 ASCII 순으로 정렬한다.
3. semantic set은 각 항목의 canonical bytes로 중복 제거 후 정렬한다.
4. 임의의 trim, 소문자화, 대문자화는 하지 않는다.
5. `-0`은 `0`으로 정규화한다.

### 시간

identity timestamp는 uppercase `Z`를 쓰는 strict UTC RFC3339만 허용한다. 잘못된 달력 날짜,
offset timezone, leap second는 거부한다. 소수 초의 뒤쪽 0은 제거해 같은 시각이 같은
canonical 값이 되게 한다.

표시용 날짜와 파일 `mtime`은 여전히 identity가 아니다. 시간 필드는 표에서 정한 실제
발행·효력·실행 의미가 있을 때만 사용한다.

### repo-relative path

경로는 source identity가 아니라 observation/storage 위치다. 경로를 다루어야 할 때는
POSIX식 repo-relative ref로 정규화하고 다음을 거부한다.

- absolute, UNC, drive-qualified path
- `.`·`..`·빈 segment
- control character
- Windows에서 충돌하는 NFC·casefold·trailing dot/space 이름

실제 write 전에는 lexical 검사만으로 끝내지 않고 repo realpath, junction/symlink,
실제 sibling 충돌까지 별도 path guard로 확인한다.

## 6. idempotency, 충돌, quarantine

같은 scope에서 같은 생성 ID를 다시 관측했을 때:

| 비교 | 판정 | 동작 |
| --- | --- | --- |
| ID, 전체 canonical basis, 전체 digest가 모두 같음 | `idempotent_noop` | 기존 immutable record 재사용, 새 write 없음 |
| ID는 같고 전체 basis 또는 digest가 다름 | `IDENTITY_COLLISION` | write 중단, quarantine, owner 검토 |
| alias 하나가 여러 primary ref로 해석됨 | alias conflict | 자동 병합 금지, quarantine |
| immutable output의 기존 bytes digest와 후보 digest가 다름 | output conflict | 덮어쓰기 금지, 새 revision 또는 owner 결정 |

충돌을 해결하려고 제목, 날짜, 임의 숫자를 ID 뒤에 붙이지 않는다. 전체 basis와 owner
occurrence 규칙을 먼저 고친 뒤 새 ID를 발급한다.

## 7. 기존 ID와 alias

기존 owner-issued ID는 바꾸지 않는다.

- 과제 번호와 기존 ERP `core_item.id`는 그대로 유지한다.
- 이미 owner가 발급한 source/task/event ID는 새 hash ID로 일괄 재작성하지 않는다.
- legacy 값은 typed primary ref 또는 typed alias로 등록한다.
- verified same entity일 때만 alias를 연결한다.
- alias가 모호하면 자동 선택하지 않고 conflict로 둔다.

이 문서에서 extraction 접두사는 `exr_`로 확정한다. 이전 draft나 외부 owner surface에서
관측된 `xr_` 또는 다른 run ID가 있다면 bulk rename하지 않는다. 기존 owner ID로 보존하고
검증된 alias/crosswalk로만 연결한다. 새 발급부터 `exr_`를 사용한다.

## 8. TaskDriver와 task ID

TaskDriver는 기존 task identity를 대체하지 않는다.

```yaml
task_ref:
  entity_type: task
  owner_surface: dev_erp
  entity_id: <existing-core-item-id>
```

- task는 기존 `core_item.id`를 유지한다.
- task intent와 TaskDriver는 `dev_erp_task_engine` owner에서 별도 immutable ID를 가진다.
- Driver와 intent는 typed `task_ref`, `project_ref`, exact source/rule/knowledge revision ref로
  기존 entity를 연결한다.
- TaskDriver의 canonicalization과 authority gate는 task lifecycle 계약이 소유한다. 이
  source/RAG ID 프로필이 기존 Driver ID를 재발급하지 않는다.
- LLM 후보가 task ID나 source ID를 임의로 확정하거나 적용하지 않는다.

## 9. project와 common ownership

RAG asset은 owner scope를 먼저 고른다.

| owner scope | 규칙 |
| --- | --- |
| `project` | canonical typed `project_ref`가 필수이며 해당 project RAG root만 사용 |
| `common` | `project_ref`를 받지 않으며 common RAG root만 사용 |

공개 계약의 경로 모양은 다음과 같다.

```text
project: _workspaces/<PROJECT_CODE>/reference_payloads/rag/<allowed-asset-kind>/...
common:  _workspaces/knowledge/rag/<allowed-asset-kind>/...
```

실제 project code, local absolute path, 계정, hostname은 public ID record나 예시에 넣지 않는다.
legacy common-root project asset은 읽기 전용 dry-run/migration 입력으로만 분류하고 project
writer가 직접 덮어쓰지 않는다.

## 10. 합성 예시

아래 값은 형식 설명용이며 실제 자료나 실제 과제를 가리키지 않는다.

```yaml
source:
  id: src_<32hex>
  identity_digest: sha256:<64hex>
  identity_basis:
    id_generation_profile_id: soulforge.identity_basis.cjson_nfc_utf8.v1
    id_kind: source
    issuer_namespace: null
    owner_ref:
      entity_type: project
      owner_surface: dev_erp
      entity_id: P-SYN-001
    source_key: lf_SYNTHETIC_001
    source_kind: file

source_revision:
  id: sr_<32hex>
  source_id: src_<32hex>
  occurrence_key: synthetic_issue_001
  content_id: sha256:<64hex>

extraction_run:
  id: exr_<32hex>
  source_revision_id: sr_<32hex>
  extractor_profile_id: synthetic_text.v1

rag_chunk:
  id: rch_<32hex>
  source_revision_id: sr_<32hex>
  evidence_locator_id: loc_<32hex>
```

실제 record에는 표에서 정한 전체 basis, 전체 digest, `null`·`[]` 필드를 모두 기록한다.

## 11. validation mapping

[`09_VALIDATION_AND_ACCEPTANCE.md`](../../../ui-workspace/apps/dev-erp/docs/task_engine_redesign/09_VALIDATION_AND_ACCEPTANCE.md)의 관련 행을 다음처럼 닫는다.

| validator | 이 계약의 확인점 |
| --- | --- |
| V-01 | exact schema, typed ref, self-reference를 뺀 basis, 전체 digest와 ID 접미사 일치 |
| V-06 | 같은 cause/basis는 no-op, 같은 ID의 다른 digest는 conflict·quarantine |
| V-08 | 의미가 있는 revision/run 시간만 canonical UTC로 고정하고 point-in-time ref를 보존 |
| V-09 | exact `source_revision_id`, locator, content ID로만 join; 이름·경로 fuzzy binding 금지 |
| V-11 | owner root 격리, traversal·absolute·UNC·drive·junction·symlink·Windows 충돌 차단 |
| V-12 | identity record에 raw body, chunk body, private absolute path, hostname, secret 없음 |

이 단위 테스트가 통과해도 real pilot이나 production-ready를 뜻하지 않는다.

## 12. writer integration 전 중단 조건

다음 중 하나라도 불명확하면 실제 재색인·이동·rename·task apply를 시작하지 않는다.

- legacy ID와 새 ID의 alias/crosswalk가 dry-run으로 검증되지 않음
- exact project/common owner와 ACL이 확인되지 않음
- source revision occurrence와 raw byte `content_id`가 확인되지 않음
- consumer가 이름·경로·mtime을 `source_key`로 넣을 가능성이 남아 있음
- lexical·realpath·junction·sibling collision guard가 통과하지 않음
- 같은 ID/다른 전체 digest 충돌이 quarantine되지 않음
- rollback manifest와 기존 reader 복구 방법이 없음
- sole writer, writer identity, idempotency receipt가 불명확함
- V-01, V-06, V-08, V-09, V-11, V-12 중 하나라도 실패 또는 미실행
- raw/private/secret을 public record에 복사해야만 진행할 수 있음

중단 상태에서는 metadata-only inventory, 합성 테스트, dry-run 보고서까지만 허용한다. 실제
writer 연결과 운영 활성화는 별도 승인·pilot·rollback·독립 검토 뒤에 진행한다.
