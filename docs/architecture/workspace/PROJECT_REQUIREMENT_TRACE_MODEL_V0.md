# Project Requirement Trace Model v0

- 상태: `DRAFT` / `canon_candidate` / `claim_ceiling: observed`
- 작성: Claude Opus 5(초안, 2026-08-17) · 검토: Claude Fable 5(구조 검토, 정본 대조) · Owner 승인 전
- 관계: `PROJECT_CONTEXT_GRAPH_MODEL_V0.md`의 SE 확장이다. 기존 계층·owner·경계를 바꾸지 않고 그 위에 요구사항 추적 축만 추가한다. 모순이 생기면 기존 정본이 이긴다.
- 비고: 이 초안의 규모 수치는 한 과제의 private inventory 요약(카운트만)을 인용한다. public 승격 시 그 블록은 자릿수 범위 표기로 치환한다.
- Owner 질문(2026-08-17): "과제별 맥락을 어떻게 관리할까 — 메모리 구조를 둘지, 메모리 없이 그래프로 할지, 그래프 엔지니어링 기법을 넣을지, 체계공학(요구사항 추적)에 어울리게. 목적은 요구사항을 놓치지 않고 품질 좋게 만드는 것." 이 문서는 그 질문에 대한 책임 있는 설계 답변이다.

---

## 1. 한 줄 결정과 그 근거

### 1.1 결정

> **메모리냐 그래프냐는 잘못 놓인 이분법이다.** 실제 축은 `사실 / 파생 / 제안` 세 가지이고, 과제 맥락은 다음 4층으로 간다.
>
> **(1) 출처-지역 소유를 유지한 append-only 양시간축 사실 원장 → (2) 결정론적으로 재생 가능한 타입 그래프·RTM 투영 → (3) 별도의 수락 게이트(accepted generation) → (4) 얇은 sourcebound 카드**
>
> LLM·벡터·자유서술 메모리는 (1)(2)(3) 어디에도 truth로 들어가지 않고 `judgment` / `memory_candidate` 제안층에만 존재한다. Graph DB는 지금 도입하지 않는다.

### 1.2 제시된 가설의 자체 검증 결과

| 가설 요소 | 판정 | 근거 |
| --- | --- | --- |
| append-only 사실 원장 | **채택, 단 "하나의 새 원장" 금지** | 마스터플랜 §1 ASSUMPTIONS: "통합 시간축·context·생명수는 하나의 거대 원장이 아니라 source-local append-only 이력들을 project-qualified exact typed ref로 함께 읽는 rebuildable projection". 새 top-level root 생성도 AGENTS.md 제외 조항 |
| 결정론적 재생 가능한 타입 그래프 투영 | **채택, 단 "재생 가능 ≠ 권한"** | `ONTOLOGY_CANON_OPERATING_POLICY_V0`은 `.registry/knowledge` 자동 덮어쓰기를 금지하고 dry-run+검토를 요구한다. `SE_DUNGEON_STAGE_MODEL_V0`의 Boss Clear Claim Ceiling은 `cleared`를 원장 사실만으로 추론하는 것을 금지한다. 따라서 투영과 **수락**을 분리한 층이 하나 더 필요하다 |
| 얇은 위키 카드 | **채택, 단 `_workmeta` 배치 금지** | 카드는 body다. `WORKSPACE_PROJECT_MODEL`/`KNOWLEDGE_WIKI_WORLDVIEW_V0`: body는 `_workspaces/**`, `_workmeta`에는 ref·hash·claim ceiling만. 또한 카드는 source revision마다 **불변 새 revision**이며 제자리 재생성이 아니다 |
| 벡터/LLM 메모리는 후보 제안층 | **그대로 채택** | 세 guild_hall 정본이 이미 동일하게 고정. 다만 "메모리"라는 단어를 truth 층 이름으로 쓰지 않는다 |

### 1.3 왜 순수 메모리도, 순수 그래프도 아닌가

- **순수 메모리 파일(과제별 장문 요약·LLM이 편집)을 정본으로 두면** 요구 개정 pin, 양시간축 재생, 커버리지 계산, 정정 계보가 전부 불가능하다. Owner의 목적은 "요구사항을 놓치지 않는 것"이고 그것은 **계산 가능한 커버리지 함수**를 요구한다. 자유 서술은 그 함수를 만들 수 없다. 따라서 메모리는 **표시층**으로만 남는다.
- **순수 그래프(그래프 DB가 정본)로 두면** 두 번째 truth writer가 생기고, 정정이 노드 수정으로 흘러 append-only 계보가 깨진다. 정본은 이미 "Neo4j는 조회 전용 projection"으로 고정되어 있다(`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0` §4·§11).
- 남는 유일한 형태가 **사실은 원장, 관계는 투영, 승인은 별도 사건**이다. 이는 새 발명이 아니라 기존 정본을 SE 축으로 완성하는 것이다.

### 1.4 이 설계가 닫는 실제 구멍

repo 전체에 요구사항 추적을 소유하는 문서가 없다. `.workflow/se_stage_artifact_gap_scan_v0`가 stage 단위 산출물 gap을, 엔진이 stage 단위 requirement 관측을 다루지만, **계약 요구 ID → 파생 요구 → 산출물 → 시험**을 개정 단위로 잇는 계층이 비어 있다. 엔진의 `snapshot.observations[]`는 지금 사람이 채워야 한다(2026-08-17 KVDS 첫 pilot에서 사람이 관측 5건을 손으로 넣었다). 이 문서는 그 입력을 **원장에서 결정론적으로 생성**하는 계약을 고정한다.

---

## 2. 개념 모델 (SE 친화)

### 2.1 노드 타입

모든 endpoint는 3-tuple `{entity_type, owner_surface, entity_id}`를 쓰고, 개정을 가리키는 ref는 4-field tuple `{entity_id, revision_id, content_id, content_hash_alg}`를 쓴다. 이는 엔진 kernel의 `REF_FIELDS`와 byte-for-byte 같다.

| 노드 | 자기 ID | 필수 필드 | 비고 |
| --- | --- | --- | --- |
| `Requirement` | `requirement_id` | `requirement_ref{4}`, `requirement_kind`, `normative_force`(`must\|should\|may\|informational`), `authority_family`, `applicability`, `source_locator_ref`(절/쪽), `valid_at`, `known_at` | `requirement_kind`는 엔진의 통제값을 확장 없이 재사용 |
| `RequirementNeed` | `need_id` | `requirement_ref{4}`, `needed_artifact_type_id`, `needed_relation`(`covers\|verifies`), `policy_ref{4}` | OpenFastTrace의 `Needs:` 선언에 대응. 정본은 `stage_expected_artifact_policy` |
| `ArtifactRevision` | `artifact_revision_id` | `artifact_id`, `artifact_type_id`, `content_id`, `materialized_as file_revision` | 기존 `TEMPORAL_KNOWLEDGE_ONTOLOGY` §5.6 그대로 |
| `CoverageObservation` | `observation_id` | `requirement_key`, `artifact_type_id`, `presence_state`, `observation_attempt_ref`, `artifact_revision_ref{4}`, `covered_requirement_revision_id`, `evidence_refs[]`, `valid_at`, `known_at` | **있음/없음/불명 3값 + 인용 span**. `presence_state`는 kernel `PRESENCE` = `present\|unknown\|absence_confirmed` |
| `Decision` | `decision_id` | `decision_kind`(`approval\|change_request\|baseline_set\|waiver\|deviation`), `owner_decision_ref`, 영향 requirement/artifact refs, `valid_at`, `known_at` | 자유 텍스트 근거는 저장하지 않는다 |
| `Risk` | `risk_id` | `risk_ref{4}`, `stage_code`, `state`, `severity`, `required_capability`, `evidence_refs[]` | 엔진 `RISK_FIELDS`와 동일 |
| `Stage`/`Gate` | `stage_code` / `gate_id` | `stage_label`, `sequence`, 진입기준 set, 성공기준 set | 진입과 성공을 **분리**해 저장한다(§2.4) |
| `Role`/`Capability` | `role_id` | `availability_state`, `capabilities[]` | `ax_se_project_role_roster.v0` 소유. 사람 신원 0 |
| `Source` | `source_id` / `source_revision_id` | 기존 `sources.csv` + `knowledge/source_revision_records` | 메일·회의·문서 공통 |

### 2.2 엣지 타입

기존 관계를 최대한 재사용하고 **신규는 3개만** 추가한다.

| 관계 | 기존/신규 | 의미 |
| --- | --- | --- |
| `requirement derived_from requirement` | 기존 `derived_from` | 계약 → SSRS → HRS/SRS 파생 계보 |
| `requirement supported_by_span source_span` | 기존 | 요구가 원문 어느 절/쪽에서 왔는지 |
| `requirement_revision needs artifact_type` | **신규** | Needs 선언 |
| `artifact_revision covers requirement_revision` | **신규** | 설계·구현 산출물의 충족 주장 |
| `artifact_revision verifies requirement_revision` | **신규** | 시험 산출물의 검증 주장 |
| `newer supersedes older` | 기존 | 개정 대체 |
| `claim conflicts_with claim` | 기존 | 상충. 자동 해소 금지 |
| `requirement at_gate gate` / `on_branch branch` | 기존 | 관문·가지 귀속 |
| `rule_revision applies_to gate_or_artifact_type` | 기존 | Needs 정책의 적용 범위 |
| `decision requires_owner_decision` / `justified_by` | 기존 | 승인 경로 |

신규 3개는 `ONTOLOGY_RELATION_MATRIX_V1.md`에 같은 변경으로 동기화해야 한다(§8 R1 완료 조건).

### 2.3 시간축·정정·claim ceiling

- 모든 record는 사실 시계(`occurred_at` / `effective_from|to` / `project_applied_at`)와 인지 시계(`recorded_at` / `ingested_at`)를 **원본 그대로** 보존한다. `valid_at` / `known_at`은 질의 cutoff이며 원본 시계를 덮어쓰지 않는다.
- 정정은 절대 덮어쓰지 않는다. 새 immutable record + `supersedes_ref`를 append한다. 재생은 supersession 체인의 말단만 살린다.
- 상태는 다섯 축을 합치지 않는다: `entity_lifecycle`, `relation_state`, `relation_lifecycle`, `claim_ceiling`, `application_state`.
- claim ceiling은 **입력 중 가장 약한 값**을 결과가 상속한다. 추출만으로 `source_supported`가 되지 않는다. exact locator가 있을 때만 `source_supported`다.

### 2.4 진입기준과 성공기준의 분리

NASA 방식대로 게이트는 두 집합을 따로 가진다.

- **진입기준(entry)**: 그 관문 심사를 *시작*할 자격. 예 — 대상 산출물 초안 존재, 이전 관문 조치 종결.
- **성공기준(success/exit)**: 그 관문을 *통과*했다는 판정. 예 — 요구 커버리지 상태, 승인 결정 존재.

한 필드로 합치면 "산출물은 있는데 승인은 없음" 상태가 표현되지 않고, 이는 실제 방산 과제에서 가장 흔한 상태다. `floor_status`는 표시축이고 판정축이 아니다. 엔진은 `blocked | active`만 낸다. `boss_clear_candidate`와 `cleared`는 owner 결정·terminal provenance·freshness가 있어야 하며 이 투영이 만들지 않는다.

### 2.5 기존 `PROJECT_CONTEXT_GRAPH_MODEL_V0` 계층과의 대응표

| 이 문서의 SE 개념 | 기존 계층 | 기존 owner (변경 없음) |
| --- | --- | --- |
| 요구 원문 위치 | `SourceSpan` | `source_spans/<YYYY-MM>.jsonl` |
| 요구 추출·변경·승인 사건 | `ContextEvent` | `events/<YYYY-MM>.jsonl` |
| 하나의 요구 처리 에피소드(요청→CR→반영→시험) | `ContextUnit` | `units/<YYYY-MM>.jsonl` |
| `requirements` / `test` / `quality` 업무 흐름 | `ContextBranch` | 기존 branch seeds 그대로 |
| 과제 전체 요구 이력 | `ProjectContext` | `summaries/revisions/project/` |
| 재사용 후보(예: 이 요구 유형은 항상 이 시험이 필요) | `memory candidate` | `memory_candidates/<YYYY-MM>.jsonl` |
| **Requirement / Need / CoverageObservation / Decision** | **신규 sibling 원장** | `project_context/` 아래 같은 writer |
| **RTM 커버리지 표** | **projection** | `project_context/projections/rtm/` |

즉 기존 6계층은 그대로 두고, 그 옆에 SE 전용 append-only 원장 4종과 투영 1종을 붙인다. 새 owner도, 새 writer도, 새 top-level root도 만들지 않는다.

---

## 3. "메모리"의 정의

### 3.1 기억할 것 / 기억하지 않을 것

| 기억한다 | 기억하지 않는다 |
| --- | --- |
| 사실: 관측(있음/없음/불명) + exact ref + hash + locator | 원문 본문, 추출 본문, chunk, 답변 본문 |
| 판단: 누가·어떤 모델·어떤 정책 개정으로 제안했는가 + confidence band | LLM reasoning 원문, 프롬프트, 대화 transcript |
| 질문: 아직 사람이 답해야 하는 owner question | 사람·조직 실명이 든 자유 텍스트 |
| 미결: gap, `UNKNOWN`, `held_conflict`, HOLD 사유 코드 | 로컬 절대 경로, provider 원 ID, secret/token/session |
| 정정: supersession ref와 그 사유 코드 | 과거 record의 수정본(정정은 append이지 수정이 아님) |

`_workmeta`의 금지 목록(원문 body, 첨부 payload, 음성, transcript, HWP/PDF/Office 본문, provider raw payload, 사설 절대경로, secret)은 그대로 적용된다.

### 3.2 3계층 (핫 / 웜 / 콜드)

| 계층 | 내용 | 물리 위치 | 재생 방식 |
| --- | --- | --- | --- |
| **핫** — 현재 단계 요약 카드 | 현재 `stage_code`, `requirement_counts{satisfied,missing,unknown,conflict,not_applicable}`, open risk, 상위 gap 3~5건, 열린 owner question, 다음 mission candidate ≤3 | 수락된 generation의 얇은 카드 (body는 `_workspaces/<project_code>/reference_payloads/knowledge_extract/<batch_id>/wiki/`, ref·hash는 `_workmeta`) | generation마다 **새 `wiki_revision_id`**. 제자리 수정 없음 |
| **웜** — 타입 그래프 | 노드·엣지·커버리지 셀, 요약 revision, branch/unit membership | `project_context/projections/**` JSONL + dev-ERP SQLite read model | 원장 재생으로 전량 재구축 가능. 손실 시 폐기 후 재생 |
| **콜드** — 원장·원본 포인터 | source-local 원본, `source_revision_records`, 월별 append-only JSONL, `_workspaces` body | 각 source owner + `_workmeta/<project_code>/**` + `_workspaces/<project_code>/**` | 절대 삭제·재작성하지 않음 |

핫 카드는 **자유 서술이 아니라 구조화 필드**다. 사람이 읽는 문장은 카드 렌더링 시점에 만들고, 그 문장 자체를 사실로 저장하지 않는다.

### 3.3 갱신 규칙

1. 모든 쓰기는 append. 정정은 `supersedes_ref`를 가진 새 record.
2. 한 과제의 `project_context/**` 정상 writer는 하나다(D36의 `project_context_writer`). RTM 원장은 그 writer를 공유하고 두 번째 writer를 만들지 않는다.
3. 자동 적용이 가능한 것은 결정론적 중복 판정을 통과한 고신뢰 branch merge뿐이다. 요구 상태 확정, 커버리지 수락, 담당·기한 변경, 게이트 판정은 전부 review/proposal이다.
4. 별칭이 두 개의 canonical `source_id`로 resolve되면 **병합하지 않고 conflict로 남긴다**. 이는 관계 매트릭스 규칙 12–13이고 자동 dedupe 금지의 근거다.

### 3.4 만료·압축 (수년 과제 대비)

수년짜리 과제에서 파일 하나를 계속 키우지 않는다.

- **파티션**: 월별 `<YYYY-MM>.jsonl`. 이미 timeline projection이 같은 형태로 동작 중이며 그 선례를 그대로 따른다.
- **generation 스냅샷**: `projections/rtm/generations/<generation_id>/{generation.json, materialization_receipt.json, by_stage/*.jsonl}`. `generation.json`은 입력 원장 digest 집합, cutoff, coverage/gap 선언, writer epoch를 고정한다.
- **compaction**: 원장은 삭제하지 않는다. 압축은 "오래된 월을 cold로 내리고 generation 스냅샷 + delta만 상시 재생"이라는 뜻이다.
- **압축 안전 게이트**: `replay(full ledger) == replay(snapshot + delta)`의 digest가 같아야 압축을 켠다. 다르면 압축을 끄고 blocker로 남긴다.
- **집계 임계**: 원장이 5만 행을 넘거나 스냅샷 집계가 반복해서 500ms를 넘으면 월별 rollup을 만든다. 그 전에 별도 집계 DB를 선행 도입하지 않는다.

---

## 4. 그래프 엔지니어링 기법 채택 판정

### 4.1 지금 채택

| 기법 | 판정 | 이유 |
| --- | --- | --- |
| typed property graph | **채택** | endpoint 3-tuple이 이미 정본. `owner_surface` 없는 bare ID 금지 |
| provenance edges | **채택** | 모든 엣지가 `evidence_source_ids`, `judgment_id`, `confidence`, `relation_state`를 가진다 |
| bitemporal | **채택** | 관계 매트릭스 규칙 14가 `valid_at + known_at` 동시 수용을 요구 |
| deterministic ID | **채택** | `exactRefIdentityKey(ref)` = 4-field join. `classifyRef`가 `ref_resolvable`이 아니면 **ID를 만들지 않는다**. `invalid_floating_ref`(개정 미지정)는 식별자가 아니라 결함이다 |
| replayable projection | **채택** | 투영은 언제든 폐기·재생. 투영 수정이 원장을 바꾸지 않는다 |
| projection receipt | **채택** | 입력 generation/digest ↔ 출력 generation/digest ↔ writer epoch ↔ row count 결속 |

### 4.2 지금 도입하지 않음

| 기법 | 판정 | 트리거 조건 |
| --- | --- | --- |
| Graph DB (Neo4j 등) | **보류** | §4.4 |
| GraphRAG / 커뮤니티 탐지 / PageRank 유사 점수 | **보류** | 고정 평가셋에서 현재 lexical retrieval의 부족이 확인된 뒤 |
| 임베딩 기반 개체 해소(entity resolution) | **금지에 가까운 보류** | 별칭 다중 resolve는 conflict로 남겨야 하므로 자동 병합 도구는 정본과 충돌 |
| 벡터 검색 | **보류** | Stage 1 검색 가능 RAG가 닫힌 뒤, 별도 평가셋으로 |

### 4.3 규모 추정 (한 과제 private inventory, 2026-08-15 기준)

관측된 한 과제 한 벌의 실측(카운트만):

- 열거 파일 **5,527**건, 이 중 분류 후보 1,534건 / 미분류 3,993건(그중 3,481건이 한 stage 폴더)
- 후보 분포: `requirement_spec` 1,149 / `decision_evidence` 320 / `baseline_change` 199 / `rtm` 25 / `contract_sow` 18 / `test_plan_result` 16 / `schedule` 13
- 후보 0건 범주: `semp`, `risk_register`, `role_roster`
- 중복 exact 884건 / 중복군 231개 / 상위판 불확실군 15개
- lane: `original_candidate` 645 / `derived_or_converted` 5

여기서 그래프 규모를 추정하면(추론):

| 노드/엣지 | 한 과제 추정 | 근거 |
| --- | --- | --- |
| ArtifactRevision | 10^3~10^4 | 파일 5.5k + 개정 |
| Requirement(+revision) | 10^3~10^5 | 요구사양서 1,149건에서 문서당 10~10^2 요구 ID 추출 시 |
| CoverageObservation | Requirement × Need(2~4) = 10^4~10^5 | Needs 선언 수에 선형 |
| 메일·회의 유래 ContextEvent | 10^4/년 · 수년 = 10^4~10^5 | 메일 lane 실측 없음(미확인) |
| 총 엣지 | **10^5~10^6** | 위 합 |

**판정**: 10^5~10^6 엣지는 SQLite 재귀 CTE와 JSONL 재생으로 충분하다. Neo4j의 실익은 10^7 이상, 가변 길이 다중 홉이 핵심 질의일 때 나타난다. 반면 도입 비용은 즉시 발생한다 — 두 번째 truth writer 위험, 새 HPP 최상위 data surface(=`guild_hall/backup_controller`의 backup/restore 분류와 synthetic restore gate 필요), 백업·복구·ACL 표면 증가. 지금은 **JSONL 원장 + SQLite 투영**으로 시작한다.

### 4.4 Graph DB 도입 트리거 (하나라도 충족 시 재검토)

1. 한 과제의 투영 전량 재구축 p95가 **60초**를 넘음
2. 한 과제 view의 엣지가 **5×10^6**을 넘음
3. **4홉 이상 가변 길이 탐색**을 요구하는 질의 유형이 3종 이상 생기고, SQLite 재귀 CTE가 2초 안에 답하지 못함
4. owner-safe catalog 범위 안에서 **5개 이상 과제**의 동시 교차 탐색이 상시 요구됨

도입해도 **조회 전용 projection**이며, projection receipt와 rollback 경로가 먼저 닫혀야 한다.

---

## 5. 요구사항 추적(RTM) 필수 흐름

### 5.1 흐름

```text
계약 요구사양서 (source_revision_id + content_id)
  -> 요구 ID 추출 (requirement_id + revision_id + 절/쪽 locator)
  -> 파생 (SSRS -> HRS/SRS/ICD, derived_from 체인)
  -> Needs 선언 (requirement_kind x needed_artifact_type, stage_expected_artifact_policy)
  -> 설계·시험 산출물 (artifact_revision covers|verifies requirement_revision)
  -> 커버리지 상태 (satisfied|gap_missing|gap_unknown|gap_conflict|unexpected_observed)
  -> 게이트 준비도 (진입기준 / 성공기준 분리 판정)
  -> 엔진 packet 자동 생성 (policy.stages[].requirements[] + snapshot.observations[])
  -> [별도 게이트] accepted generation -> [별도 게이트] owner 결정
```

### 5.2 커버리지 상태값 — 엔진 vocabulary 재사용

| RTM 개념(외부 관행) | 이 설계의 상태 | 엔진 `GAP_TYPE` |
| --- | --- | --- |
| covered | 충족 | `satisfied` |
| uncovered (부재 확인됨) | 결손 | `gap_missing` |
| uncovered (관측 안 함/불가) | 미확인 | `gap_unknown` |
| **outdated** (덮는 산출물이 구 개정을 참조) | 미확인 + 사유코드 `coverage_revision_stale` | `gap_unknown` |
| 상충 (두 출처 불일치) | 상충 | `gap_conflict` |
| orphaned (기준선에 없는 요구를 덮는다고 주장) | 고아 | `unexpected_observed` |

**`outdated`를 `gap_unknown`으로 접는 이유**: 구 개정을 덮는 산출물은 현 개정의 부재를 *확인*해 주지 않는다. 부재로 접으면 거짓 결손, 충족으로 접으면 거짓 안심이다. fail-closed가 유일하게 안전하다. 엔진에 `gap_outdated` enum을 추가할지는 owner 결정 항목으로 분리한다(D39). 이 설계는 그 추가에 **의존하지 않는다**.

### 5.3 계산 규칙 (의사코드)

```text
# ---------- 0. 원장 재생 ----------
function replay(ledger, valid_at, known_at):
    rows = [r for r in ledger
              if r.known_at  <= known_at
             and r.valid_from <= valid_at
             and (r.valid_to is null or valid_at < r.valid_to)]
    live = {}
    for r in sort_canonical(rows):          # (logical_id, known_at, record_id) 결정적 정렬
        if r.supersedes_ref: live.pop(r.supersedes_ref, None)
        live[r.self_ref] = r
    return values(live)
    # 원장은 읽기만 한다. 어떤 경로에서도 수정하지 않는다.


# ---------- 1. 요구 식별 ----------
function requirementKey(rr):
    if classifyRef(rr.requirement_ref) != 'ref_resolvable':
        return HOLD('AX_SE_REFERENCE_INVALID')     # 개정 없는 ref는 ID가 아니다. 추정 금지
    return exactRefIdentityKey(rr.requirement_ref) # entity_id|revision_id|content_id|alg


# ---------- 2. 커버리지 셀 생성 ----------
function coverageCells(R, N, P):
    for rr in R:
        if rr.applicability == false: continue          # not_applicable은 셀을 만들지 않는다
        needs = resolveNeeds(rr, N, P)                  # requirement_kind x stage x artifact_type
        if isEmpty(needs):
            emit cell(rr, needed=null, forced='gap_unknown', reason='needs_undeclared')
            continue
        for t in needs:
            emit cell(
              cell_id = digest(requirementKey(rr), t.needed_artifact_type_id,
                               t.needed_relation, P.policy_ref.content_id,
                               canonicalization_version),
              requirement = rr, needed = t)
    # cell_id에는 시계, 파일 경로, 물리 ledger ref를 넣지 않는다 (idempotency_key와 같은 규칙)


# ---------- 3. 셀 상태 판정 ----------
function cellState(cell, O):
    obs = [o for o in O if o.requirement_key == cell.requirement_key
                       and o.artifact_type_id == cell.needed.needed_artifact_type_id
                       and o.relation        == cell.needed.needed_relation]

    if isEmpty(obs):
        return ('gap_unknown', 'coverage_not_attempted')

    # (a) 상충을 먼저 본다. 상충을 부재나 충족으로 접지 않는다.
    if any(o.presence_state=='present') and any(o.presence_state=='absence_confirmed'):
        return ('gap_conflict', 'observation_disagreement')

    present = [o for o in obs if o.presence_state=='present']
    for o in present:
        if o.covered_requirement_revision_id != cell.requirement.revision_id:
            mark(o, 'coverage_revision_stale')                 # = outdated
        res = classifyRef(o.artifact_revision_ref)
        if res == 'invalid_floating_ref': mark(o, 'artifact_ref_floating')
        if res == 'unknown':              mark(o, 'artifact_bytes_unresolvable')

    fresh = [o for o in present if not marked(o)]
    if notEmpty(fresh):   return ('satisfied', null)
    if notEmpty(present): return ('gap_unknown', firstMark(present))   # outdated는 fail-closed
    if all(o.presence_state=='absence_confirmed' for o in obs):
        return ('gap_missing', 'absence_confirmed')
    return ('gap_unknown', 'observation_inconclusive')


# ---------- 4. 고아 근거 ----------
function orphans(O, R):
    for o in O:
        if o.requirement_key not in keys(R):
            emit ('unexpected_observed', o)   # 삭제하지 않는다. 검토 후보로 남긴다


# ---------- 5. 요구 단위 롤업 (최악 우선) ----------
RANK = { 'gap_conflict':0, 'gap_unknown':1, 'gap_missing':2, 'satisfied':3 }
function requirementState(rr, cells):
    if rr.applicability == false: return 'not_applicable'
    return argmin(cells_of(rr), key = RANK[state])


# ---------- 6. 게이트 준비도 (진입 / 성공 분리) ----------
function gateReadiness(stage, reqs, risks, decisions):
    c = tally(reqs in stage)      # satisfied/missing/unknown/conflict/not_applicable
    entry_ok   = all(entry_criteria(stage) satisfied by artifact presence)
    if c.unknown > 0:
        return { assessment:'UNKNOWN', floor:'blocked', entry:entry_ok }
    if c.conflict > 0 or c.missing > 0 or openRisk(risks, stage) > 0:
        return { assessment:'HOLD',    floor:'blocked', entry:entry_ok }
    return { assessment:'READY_FOR_OWNER_REVIEW', floor:'active', entry:entry_ok }
    # 'cleared'와 'boss_clear_candidate'는 여기서 생성하지 않는다.
    # owner decision packet + terminal provenance + fresh snapshot이 있어야 한다.


# ---------- 7. 엔진 packet 생성 ----------
function emitEnginePacket(gen):
    policy.stages[].requirements[] <- {
        requirement_id, requirement_kind, required_capability,
        requirement_ref{4}, authority_family, applicability, valid_at, known_at }

    snapshot.observations[] <- for each requirement:
        presence_state =
            'satisfied'    -> 'present'
            'gap_missing'  -> 'absence_confirmed'
            'gap_unknown'  -> 'unknown'
            'gap_conflict' -> 'unknown' + conflict_claims[]   # 양측 주장을 모두 운반
        + observation_attempt_ref, artifact_revision_ref{4},
          valid_at, known_at, evidence_refs[]

    assert: FORBIDDEN_KEYS 없음 (raw/payload/body/source_path/token/...)
    assert: '_workspaces' / '_workmeta' / 'private-state' / 드라이브문자 / UNC 문자열 없음
    assert: stage 하나당 applicable requirement >= 1  (0이면 fail-closed 거부)
    assert: stage_code 유일, sequence 엄격 증가
    packet_sha256 = sha256(raw bytes)     # UTF-8 해석 전 raw byte 위에서
```

### 5.4 권위 순위는 해소가 아니라 우선순위

두 출처가 상충하면 `AUTHORITY_FAMILIES` 순위(1 계약·기준선 → 2 법령 → 3 사내 승인 절차 → 4 획득기관 매뉴얼 → 5 일반 SE guidance → 6 사례·템플릿 → 7 Reviewed Wiki → 8 LLM proposal)로 **검토 순서**를 정한다. 순위가 높다고 자동으로 이기지 않는다. 엔진은 상충을 보존하고 `resolve_source_conflict` mission을 낸다. 자동 해소는 금지다.

---

## 6. 저장 위치·소유자·쓰기 규칙

### 6.1 위치

```text
_workspaces/<project_code>/                          # body / payload
├─ ... 계약서·요구사양서·설계·시험 원본, HWPX 파생본
├─ reference_payloads/knowledge_extract/<batch_id>/
│  ├─ derived_text/                                  # 추출 본문
│  └─ wiki/                                          # 얇은 RTM 카드 body
├─ reference_payloads/rag/                           # project RAG target
└─ reference_payloads/engine_packets/<generation_id>/ # 엔진 입력 packet 1파일

_workmeta/<project_code>/project_context/            # metadata only, 단일 writer
├─ (기존) source_spans/ events/ units/ memberships/ summaries/ memory_candidates/
├─ requirements/<YYYY-MM>.jsonl                      # 신규
├─ requirement_needs/<YYYY-MM>.jsonl                 # 신규
├─ coverage_observations/<YYYY-MM>.jsonl             # 신규
├─ decisions/<YYYY-MM>.jsonl                         # 신규
└─ projections/
   ├─ (기존) timeline/
   ├─ rtm/generations/<generation_id>/{generation.json, materialization_receipt.json, by_stage/*.jsonl}
   ├─ rtm/current.csv                                # 사람/read-model 호환, 재생 가능
   └─ erp_receipts/<YYYY-MM>.jsonl

_workmeta/<project_code>/knowledge/source_revision_records/<source_revision_id>.yaml
_workmeta/<project_code>/runs/<run_id>/receipts/     # 엔진 실행 영수증

public repo                                          # 스키마·순수 함수·public-safe fixture
├─ docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md
├─ docs/architecture/workspace/examples/project_requirement_trace/
└─ guild_hall/engineering_engine/ (또는 guild_hall/requirement_trace/)
```

### 6.2 규칙

1. **새 top-level root 없음.** RTM 원장은 `project_context/` 아래 sibling owner이고, D36이 정한 `project_context_writer` 하나를 공유한다. 두 번째 context truth를 만들지 않는다.
2. **body는 `_workspaces`, metadata는 `_workmeta`.** 얇은 카드도 body이므로 `_workmeta`에 두지 않는다. `_workmeta`에는 `wiki_page_id`, `wiki_revision_id`, body `content_id`, `owner_decision_ref`만 남긴다.
3. **엔진 packet은 admitted project root 아래.** M2-2 계약이 "admitted project root 아래 relative locator의 canonical packet 한 파일만 stable-open"을 요구하므로 packet은 `_workspaces` 쪽에 materialize하고 `_workmeta`에는 exact ref + sha256만 남긴다. packet 본문에는 `_workspaces`/`_workmeta` 문자열이 들어갈 수 없다(엔진 `FORBIDDEN_STRING_PATTERNS`).
4. **쓰기 전 guard.** `_workmeta`에 파일·디렉터리를 만들기 전 `npm run guard:workmeta-write -- --assert-write-target "<target>"` (디렉터리는 `--target-kind directory`)를 통과해야 한다.
5. **영수증.** 모든 generation은 입력 원장 digest 집합, cutoff, coverage/gap 선언, writer epoch, row count를 결속한 receipt를 남긴다. receipt 없이 accepted를 주장하지 않는다.
6. **과제 격리.** 한 Knowledge View는 정확히 하나의 project binding + 명시 allowlist common revision만 본다. project가 없거나 둘 이상이면 retrieval 전에 `HOLD`.

### 6.3 CSV 7종 → JSONL 원장 마이그레이션

CURRENT 관측(한 과제 실측): `branches` 9행, `edges` 584행, `judgments` 191행, `nodes` 378행, `occurrences` 17행, `review_queue` 267행, `sources` 191행, `summaries/branch_summaries` 36행, `projections/timeline/current.csv` 269행. `projections/timeline/generations/` 아래에 월별 JSONL generation 2벌이 이미 존재한다. TARGET JSONL owner(`source_spans/`, `events/`, `units/`, `memberships/`, `memory_candidates/`)는 **아직 없다**.

즉 timeline lane은 이미 "월별 JSONL + generation + materialization receipt"로 이행했다. **그 형태를 그대로 복제**하는 것이 가장 안전한 경로다.

| 단계 | 내용 | 통과 기준 |
| --- | --- | --- |
| M0 | 현행 CSV 7종을 legacy generation `g0`로 동결하고 digest manifest 산출 | 파일별 sha256 + 행수 기록. CSV 삭제·이동 0 |
| M1 | JSONL owner를 **병행 추가**(기존 CSV 계속 사용) | `guard:workmeta-write` 통과. append-only writer 하나 |
| M2 | 재생기 구현: JSONL 재생 → CSV 7종 재생성 | 표현 가능한 부분집합에 대해 `g0`와 행 단위 parity. 표현 불가 행은 삭제하지 않고 `legacy_unbound` register에 계수 |
| M3 | reader를 JSONL로 전환, CSV는 재생 가능한 호환 투영으로 유지 | 양시간축 재생 2회 실행 digest 동일. rollback = reader를 CSV로 되돌리기만 하면 됨 |
| M4 | RTM 원장 4종 + `projections/rtm/` 추가 | §8 R2/R3 완료 기준 |

`legacy_unbound` 행이 남는 것은 실패가 아니라 정상이다. exact revision/evidence가 없는 legacy 행을 자동 승인·재분류하지 않는 것이 정본이다.

---

## 7. 엔진·RAG·Wiki·ERP 연결

### 7.1 층별 공급/소비 (P4/M2-3 → P5 → P6)

| 단계 | 이 설계가 **공급**하는 것 | 이 설계가 **소비**하는 것 |
| --- | --- | --- |
| **P4 / M2-3** project-local deterministic RAG + thin Wiki | 요구 ID·개정·locator를 찾을 대상 목록(어떤 source revision을 Stage 1로 올려야 하는가) | exact source revision을 pin한 RAG/Wiki receipt. receipt 없는 표면에서는 context를 받지 않는다 |
| **P5** accepted context generation/freshness | RTM generation과 그 coverage/gap 선언 | M2-3A Knowledge→Context Gate Crosswalk 7조건(exact project / source revision set / bitemporal stamps / coverage·gap / supersession / reviewer / writer epoch) |
| **P6** TaskIntent | `next_mission_candidates` ≤3 + 각 후보의 done/HOLD 조건 + logical role candidate 또는 `HOLD` | accepted generation. 그 전에는 TaskIntent를 만들지 않는다 |

### 7.2 엔진과의 접합

- 엔진은 model-free 순수 함수다. 이 설계는 그 **입력을 만들 뿐** 판단을 대신하지 않는다.
- packet은 raw byte sha256으로 pin되고, runner는 UTF-8 해석 전에 그 pin을 검증한다.
- 엔진 출력의 `requirement_counts`가 지금 사람이 채우던 값에서 **원장 재생 산물**로 바뀐다. 이것이 이 설계의 핵심 실효다.
- command PASS와 domain `HOLD`/`UNKNOWN`/`READY_FOR_OWNER_REVIEW`는 계속 분리된다.

### 7.3 RAG·Wiki 역할

- RAG(Stage 1): 요구 원문에서 exact page/chunk를 찾는 검색층. 요구 ID 추출의 **보조**이며 추출 권한이 아니다.
- Wiki: 반복 참조되는 SE 흐름·용어·source family 지도. 얇게 유지하고 모든 문서를 복제하지 않는다.
- 두 층 모두 판단 authority가 아니고, implicit project↔common fallback을 하지 않는다.

### 7.4 ERP와 MCP가 읽는 뷰

```text
_workmeta project_context canon (원장)
  -> accepted-generation projector
  -> ERP read model / ACL (SQLite)
  -> ERP UI 또는 MCP
  -> per-PC 클라이언트
```

MCP가 읽는 최소 뷰 4종(전부 accepted generation 기준, metadata-only):

1. `rtm.coverage.summary` — stage별 `requirement_counts` + coverage/gap 선언 + generation ref
2. `rtm.gaps` — 상태가 `satisfied`가 아닌 요구 목록 + 사유 코드 + exact refs
3. `rtm.requirement.detail` — 요구 1건의 개정 계보, Needs, 관측, 결정, 상충
4. `rtm.gate.readiness` — 진입기준/성공기준 분리 상태 + 열린 owner question

MCP·플러그인은 `_workmeta`를 직접 순회하거나 쓰지 않는다. 클라이언트의 정정·체크포인트는 proposal/receipt이며, 권한 있는 writer가 검증 후 append한다.

---

## 8. 단계별 도입 계획

### R1 — 계약 고정과 순수 함수 (1주차)

**만드는 것**
- 이 문서를 `canon_candidate`로 등록, `ONTOLOGY_RELATION_MATRIX_V1.md`에 신규 관계 3개 동기화
- public-safe synthetic fixture: `docs/architecture/workspace/examples/project_requirement_trace/`
- 순수 함수 `computeRequirementCoverage(ledgerReplay, needsPolicy, cutoffs)` — 파일·시계·네트워크·모델 접근 0
- (선행 조각, 2026-08-17 착수) 프로젝트 PDF 요구사항 ID 색인 seam — 요구사양서에서 `식별자` 블록을 결정론적으로 추출해 rows(ID·절·쪽·span·TBC/TBD·블록 해시)와 payload-free 영수증을 낸다. Requirement 노드의 `source_locator_ref`와 `requirement_ref` 원료.

**완료 기준**
1. 동일 입력에 대한 결정론적 출력(2회 실행 digest 동일)
2. 양시간축 재생 테스트: 뒤늦게 수집한 개정이 과거 `known_at` 질의에 섞이지 않음
3. fail-closed 회귀시험: 미관측 → `gap_unknown`, `invalid_floating_ref` → HOLD, 상충 → `gap_conflict`(부재로 접히지 않음), Needs 미선언 → `gap_unknown`
4. `unexpected_observed`(고아)가 삭제되지 않고 계수됨
5. `npm run validate` 및 관련 focused validator 통과

**Owner 결정 필요**: D37, D38, D39

### R2 — 원장 병행 + 재생 parity (2주차)

**만드는 것**
- CSV 7종 `g0` 동결 + digest manifest
- JSONL owner 4종(`requirements/`, `requirement_needs/`, `coverage_observations/`, `decisions/`) writer
- 시드는 **자동 추출이 아니라** owner 승인한 소량 pin부터: 관측된 과제의 `rtm` 25건 + `contract_sow` 18건을 출발점으로, 한 stage만

**완료 기준**
1. `replay(JSONL)` → CSV 재생성 결과가 `g0`의 표현 가능 부분집합과 행 단위 일치
2. `legacy_unbound` register가 계수되어 있고, 자동 승인·재분류 0
3. `guard:workmeta-write` 전건 통과, `_workmeta`에 body 0
4. rollback 리허설: reader를 CSV로 되돌려도 동작

**Owner 결정 필요**: D37(요구 ID 확정 authority), D40(중복 884건·상위판 불확실 15군 처리)

### R3 — 커버리지 투영과 엔진 packet (3주차)

**만드는 것**
- `projections/rtm/generations/<generation_id>/` 생성기 + materialization receipt
- 엔진 packet 생성기 → `_workspaces/<project_code>/reference_payloads/engine_packets/<generation_id>/`
- 기존 zero-write runner를 그 packet으로 1회 실행

**완료 기준**
1. `requirement_counts`가 사람 입력이 아니라 재생 산물이고, 모든 `unknown`에 사유 코드가 있음
2. packet이 `FORBIDDEN_KEYS`·경로 문자열 검사·stage 유일성·applicable requirement ≥1을 전부 통과
3. `assessment_stdout.json`의 `effects` 전부 0, `gates` 전부 false 유지
4. 같은 cutoff로 두 번 생성한 generation의 digest 동일
5. `npm run validate:engineering-engine-ax-se-project-assessment` 통과

**Owner 결정 필요**: D39(엔진 `gap_outdated` enum 추가 여부)

### R4 — 얇은 카드·ERP read model·수락 게이트 (4주차)

**만드는 것**
- 얇은 RTM 카드 body를 `_workspaces/.../wiki/`에, ref·hash를 `_workmeta`에 (generation마다 새 `wiki_revision_id`)
- dev-ERP SQLite read model + projection receipt
- MCP 뷰 4종
- M2-3A 7조건을 명시적으로 평가한 게이트 리포트

**완료 기준**
1. `_workmeta` ↔ ERP read model의 digest/row parity
2. 카드가 제자리 수정 없이 새 revision으로만 갱신됨
3. 7조건 중 미충족 항목이 `HOLD` 사유와 함께 **전부 열거**됨. 부분 accepted 없음
4. `cleared` / `boss_clear_candidate` 주장 0, ERP write 0, TaskIntent 0
5. `.workflow/post_development_review_gate_v0/` 통과 + 독립 검토

**Owner 결정 필요**: D41(graph DB 트리거·백업 분류), D36 범위 확인

### 8.1 Owner 결정 목록 (D-번호 매핑)

기존 등록된 최고 번호가 D36이므로 신규는 D37부터 제안한다.

| ID | 결정 사항 | 제안 안전 기본값 | 영향 단계 |
| --- | --- | --- | --- |
| **D36**(기존) | project-context 지속 계층·writer·ERP read-model owner | RTM 원장 4종을 `project_context/` 하위 sibling owner로 포함하고 writer를 공유. 별도 writer·별도 root 금지 | R2~R4 |
| **D06**(기존) | SourceRevision과 relation/application physical owner | 그대로. 요구 원문은 기존 `knowledge/source_revision_records` 사용 | R2 |
| **D08**(기존) | Wiki/knowledge truth promotion authority | 그대로. RTM 카드는 projection이며 canon 아님 | R4 |
| **D20**(기존) | external SE master schedule revision/event owner | 미정 유지. 게이트 **일자**는 이 설계에서 확정하지 않음 | R3 |
| **D29**(기존) | Knowledge View ACL / no-fallback | 그대로 적용 | R1~R4 |
| **D37**(신규) | 계약 요구사양서에서 요구 ID를 확정할 authority | 자동 추출은 `observed` candidate만. exact locator + owner 확인이 있어야 `source_supported`. 자동 확정 금지 | R1~R2 |
| **D38**(신규) | Needs 선언(어떤 stage에서 어떤 `requirement_kind`가 어떤 `artifact_type`으로 덮여야 하는가)의 정본 owner | 기존 `stage_expected_artifact_policy`를 확장하고 새 정책 store를 만들지 않음. 미선언은 `gap_unknown` | R1~R3 |
| **D39**(신규) | `outdated` 처리 | 기본은 투영층 사유 코드(`coverage_revision_stale`) + `gap_unknown`. 엔진 enum 추가는 별도 승인 | R1, R3 |
| **D40**(신규) | 중복·상위판 판정 authority | 중복 exact 884건은 동일 `content_id`이므로 `observation`만 추가하고 새 revision 만들지 않음. 상위판 불확실 15군은 **자동 병합 금지**, conflict로 보존 | R2 |
| **D41**(신규) | Graph DB 도입 트리거와 backup/restore 분류 | §4.4 트리거 전 미도입. 도입 시 `guild_hall/backup_controller` 분류와 synthetic restore gate 선행 | R4 이후 |

---

## 9. 대안 비교

| 축 | A. 순수 메모리 파일 | B. 순수 Graph DB | **C. 하이브리드(권장)** |
| --- | --- | --- | --- |
| 형태 | 과제별 장문 요약·LLM 편집 | Neo4j 등이 정본, 노드/엣지 직접 수정 | 원장(append) + 투영(재생) + 수락(사건) + 카드(불변 revision) |
| 커버리지 계산 | 불가(자유 텍스트) | 가능 | 가능, 결정론적 |
| 양시간축 재생 | 불가 | 어려움(개정 이력을 별도 설계해야) | 설계상 기본 |
| 정정 처리 | 덮어쓰기(과거 소실) | 노드 수정(과거 소실 위험) | supersession append(과거 보존) |
| 감사·재현 | 불가 | 스냅샷 설계 필요 | receipt + digest로 기본 제공 |
| 도입 비용 | 매우 낮음 | 높음(새 data surface, 백업/복구, ACL) | 중간(스키마 + 순수 함수 + 재생기) |
| 조회 편의 | 사람에게는 좋음 | 다중 홉 탐색 최상 | SQLite CTE로 충분, 필요 시 B를 조회 전용으로 추가 |
| 정본과의 충돌 | `_workmeta` metadata-only 위반, claim ceiling 부재, 원장 부재 | 두 번째 truth writer, "Neo4j는 projection" 규정 위반, 새 top-level data surface | 없음(기존 정본의 SE 확장) |
| 최대 위험 | 조용한 요구 누락 — Owner 목적을 정면으로 훼손 | 조용한 과거 덮어쓰기 + 운영 표면 폭증 | 스키마 조기 고착. 완화: R1을 순수 함수 + fixture로만 닫고 writer는 R2로 미룸 |
| 실패 시 회복 | 회복 불가(원본 소실) | 복구는 백업 의존 | 투영 폐기 후 재생. 원장 무손상 |

**추가 위험과 완화**

- *투영 재생 비용 증가* → generation 스냅샷 + delta, 압축 안전 게이트(§3.4)
- *`gap_unknown` 과다로 화면이 전부 회색* → 사유 코드별 집계와 "미시도"와 "시도했으나 불가"를 분리 표시. 숨기지 않는 것이 목적
- *중복 884건이 커버리지를 부풀림* → 동일 `content_id`는 새 revision이 아니라 observation 추가로만 처리(D40)
- *미분류 3,993건(대부분 한 폴더)* → 이 설계는 미분류를 `270_UNCLASSIFIED`로 보존하고 자동 stage 귀속을 하지 않는다

---

## 10. 확인된 사실 · 추론 · 미확인

### 10.1 확인된 사실 (2026-08-17 조사에서 직접 관측)

- `PROJECT_CONTEXT_GRAPH_MODEL_V0.md`의 6계층, CURRENT CSV 7종, TARGET JSONL 레이아웃, M2-3A 7조건
- 한 과제 `project_context/`의 실제 행수: branches 9 / edges 584 / judgments 191 / nodes 378 / occurrences 17 / review_queue 267 / sources 191 / branch_summaries 36 / timeline current 269
- TARGET JSONL owner(`source_spans/`, `events/`, `units/`, `memberships/`, `memory_candidates/`)는 **미존재**. `projections/timeline/`만 존재하며 월별 JSONL generation 2벌이 있음
- 해당 과제 inventory(2026-08-15): 파일 5,527 / 분류 후보 1,534 / 미분류 3,993 / 중복 exact 884 / 중복군 231 / 상위판 불확실군 15 / 범주별 분포 및 0건 범주 3종
- 엔진 kernel 실제 enum: `PRESENCE {present, unknown, absence_confirmed}`, `GAP_TYPE {satisfied, gap_missing, gap_unknown, gap_conflict, unexpected_observed}`, `RESOLUTION {ref_resolvable, unknown, missing, malformed_ref, invalid_floating_ref}`, `AXIS {expected, observed}`, `AUTHORITY_FAMILIES` 8단, `STAGE_CODE` 11값, `RISK_SEVERITY` 4값, `assessment_state {UNKNOWN, HOLD, READY_FOR_OWNER_REVIEW}`, `floor_status {blocked, active}`
- 엔진 packet 필드 집합(`REQUIREMENT_FIELDS`, `OBSERVATION_REQUIRED_FIELDS`, `OBSERVATION_OPTIONAL_FIELDS=conflict_claims`, `CLAIM_FIELDS`, `RISK_FIELDS`, `ROLE_FIELDS`, `REF_FIELDS`) 및 금지 키·금지 문자열 패턴
- `mission_kind` 4종: `resolve_source_conflict`, `disposition_open_risk`, `close_confirmed_gap`, `acquire_requirement_evidence`
- 파일럿 receipt 구조: `authority`(8 bool), `gates`(7 bool), `effects`(7 int), `knowledge_view`(18), `role_bound_assessment`(19). 모든 `*_ref`가 4-field tuple
- repo에 요구사항 추적을 소유하는 문서가 **없음**(RTM/SSRS/HRS/SRS 검색 결과 synthetic fixture 2건뿐)
- 마스터플랜 결정 등록부 최고 번호 = D36이며 D36이 project-context 지속 계층·writer·ERP read-model owner를 이미 소유

### 10.2 추론 (관측 아님, 검증 필요)

- 요구 노드 규모 10^3~10^5, 총 엣지 10^5~10^6 — 요구사양서 1,149건에 문서당 10~10^2 요구 ID를 가정한 값
- SQLite 재귀 CTE가 이 규모에서 충분하다는 판정 — 실측 벤치마크 없음
- `outdated`를 `gap_unknown`으로 접는 것이 유일하게 안전하다는 판단 — 논리적 귀결이며 owner 승인 사항
- timeline lane의 generation 형태를 복제하는 것이 최저 위험 경로라는 판단
- 미분류 3,993건 중 상당수가 한 stage 폴더에 몰려 있어 stage 귀속 자동화의 첫 병목이 될 것이라는 예상

### 10.3 미확인 (`UNKNOWN` / 후속 게이트)

- 요구사양서에서 실제로 추출 가능한 요구 ID의 수와 형식 — 본문을 읽지 않았다(→ 요구사항 ID 색인 seam 첫 실행이 측정한다)
- 메일·회의 lane의 실제 연간 건수와 프로젝트 귀속 정확도
- HWP→HWPX 정규화 잔여분이 요구 추출을 얼마나 막는가
- 게이트 일자·외부 마스터 일정의 정본 owner (D20 미결)
- 현재 runtime의 `project_context_writer` 실제 가동 여부와 위치 (`VERIFY_HP`)
- `semp`, `risk_register`, `role_roster` 후보 0건이 실제 부재인지 분류 실패인지
- 이 설계의 순수 함수를 `guild_hall/engineering_engine/` 안에 둘지 별도 `guild_hall/requirement_trace/`로 둘지 (owner 경계 확인 필요)

---

## 11. 비목표와 중단 조건

**비목표**: 요구 ID 자동 확정, 자동 stage 귀속, 게이트 자동 통과, ERP write, TaskDriver activation, LLM 활성화, graph DB 설치, legacy 대량 rename·삭제, 두 번째 task/context writer.

**다음이면 중단하고 보고한다.**

- `project_context/**`에 두 번째 writer가 필요해지는 설계
- 상충을 자동 해소하거나 별칭을 자동 병합해야 하는 상황
- 카드 body나 chunk를 `_workmeta`에 써야 하는 상황
- exact revision 없이 `source_supported`나 `satisfied`를 주장해야 하는 상황
- `cleared` / `boss_clear_candidate`를 원장 사실만으로 만들어야 하는 상황
- accepted generation 7조건 중 하나라도 없이 "현재 상태"를 주장해야 하는 상황

---

## 12. 관련 문서

- `docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md` (이 문서의 상위)
- `docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`
- `docs/architecture/foundation/ONTOLOGY_MODEL_V0.md` · `ONTOLOGY_RELATION_MATRIX_V1.md`
- `docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`
- `docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md`
- `docs/architecture/workspace/SE_DUNGEON_STAGE_MODEL_V0.md` · `SE_ASSISTANT_OPERATING_MODEL_V0.md`
- `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`
- `docs/architecture/guild_hall/RAG_THREE_STAGE_OPERATING_MODEL_V0.md` · `KNOWLEDGE_WIKI_WORLDVIEW_V0.md` · `KNOWLEDGE_OPERATING_MODEL_V0.md` · `ONTOLOGY_CANON_OPERATING_POLICY_V0.md` · `KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md`
- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` (M2 순서, P4/M2-3 → P5 → P6)
- `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md` §6.2~6.4, §7, §9, §17.1
- `guild_hall/engineering_engine/README.md` 및 `kernel/`, `subjects/ax_se_project_assessment.mjs`
- `.workflow/se_stage_artifact_gap_scan_v0/` · `.workflow/owner_decision_packet_v0/` · `.workflow/post_development_review_gate_v0/`
