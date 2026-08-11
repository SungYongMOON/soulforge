# Lane 1C — Typed graph projection and bounded Context Capsule

Status: `LANE CONTRACT / AUTHOR-WRITTEN FIXTURES / INDEPENDENT LOCK OWED BY 1V`

이 lane 은 동결 crosswalk 에서 `graph_typed_edge_and_capsule_and_context_capsule_fingerprint` 를 소유한다. Phase 1-0 공통 계약을 consume-only 로 쓰고 재정의하지 않는다.

구현: `kernel/graph.mjs`, `kernel/capsule.mjs`
시험: `tests/lane_1c_conformance.mjs`

## 1. Graph 의 지위

`P` Graph 는 기존 계약을 연결하는 **재생 가능한 projection** 이다. 새 truth owner 도, 선행 ontology 도, 거대 graph DB 도 아니다.

- `assertNotTruthOwner()` 는 graph 에 truth 소유를 요구하는 호출 자체를 오류로 만든다.
- `projectionDescriptor()` 는 projection 이 **무엇으로부터 재생됐는지** 를 명시하도록 강제한다. 재생 출처를 못 대는 view 는 projection 이 아니다.

## 2. 두 개의 불변식

### 2.1 양쪽 끝이 타입이다

`D` node type 과 edge shape 은 **닫힌 목록**이다. `(from_type, edge_type, to_type)` 삼중쌍 whitelist 밖의 edge 는 거부한다.

이유는 규모다. 타입 없는 edge 는 claim 이 아무 것에나 붙게 하고, 그 순간 navigation 보조물이 사고 없이 ontology 가 된다. 새 종류의 관계가 필요하면 계약을 바꾼다.

현재 node type 14종, edge shape 17종. 세 projection 을 덮는다.

- knowledge lineage: `source → source_revision → extraction_run → evidence_locator → claim → rule/wiki_revision`
- project context: `artifact → artifact_revision → observed_state_element`, `rule → expected_state_element`
- engine projection: `expected ↔ observed → finding → context_request`, `snapshot → finding baseline`

### 2.2 edge 는 자기 근거보다 높은 권위를 주장하지 못한다

`D` edge 의 `authority_family` 는 그 edge 가 기대는 evidence 의 authority 보다 **높을 수 없다.**

이 상한이 없으면 파생 edge 가 자기 출처 문서를 능가한다. 예를 들어 Reviewed Wiki 에서 파생된 edge 가 `project_contract_baseline` 권위를 주장하는 것을 막는다.

## 3. 시간 규칙

`D` 모든 asserted edge 는 `valid_at` 과 `known_at` 을 갖는다.

- 둘 다 Phase 1-0 canonical instant 여야 한다. 존재하지 않는 날짜는 거부한다.
- `known_at` 이 `valid_at` 보다 앞설 수 없다. 사실이 성립하기도 전에 알았다는 주장은 거부한다.

## 4. Bounded traversal

`D` capsule selector 는 다음을 pin 한다. 하나라도 없으면 거부한다.

```text
project_binding_ref + scope + accepted_context_generation + valid_at/known_at
acl_filter_revision + source_family_filter
seed_refs
traversal { max_hops, allowlisted_edge_types }
ranking { method, keys }
budgets { top_k, max_nodes, max_edges, max_sources, max_evidence_chars }
graph_projection_revision
```

### 4.1 hop 상한

`P` `max_hops` 는 **2** 를 넘지 못한다. 그 이상은 bounded capsule 이 아니라 corpus 다.

### 4.2 ACL 은 매 hop 에서 적용한다

`D` 이것이 이 lane 의 가장 중요한 결정이다. **seed 만 필터링하면 hop 2 가 새어나간다.**

요청자가 볼 수 없는 자료가 hop 1 을 경유해 hop 2 에서 capsule 에 들어오는 것이 전형적인 누출이다. 따라서 `aclCheck(ref, hop)` 을 **모든 hop 에서** 호출하고, 거부는 `acl_denied_at_hop` 이유와 함께 exclusion 으로 보고한다.

`aclCheck` 를 주지 않으면 selector 는 실행되지 않는다. 기본 허용은 없다.

### 4.3 ranking 은 결정론이다

`D` `ranking.method` 는 `deterministic` 이어야 하고 `ranking.keys` 는 선언된 순서 목록과 정확히 같아야 한다.

```text
authority_rank → applicability → revision_recency → ref_lexicographic
```

embedding 유사도나 학습 reranker 는 이 자리에 항목이 없다. 이것은 누락이 아니라 설계다. `capsule.mjs` 는 `method` 가 `deterministic` 이 아니면 거부한다.

### 4.4 제외된 것은 이유와 함께, 이유만 보고한다

`D` 조용히 빠진 evidence 는 애초에 없던 evidence 와 구별되지 않는다. 따라서 모든 제외에 이유를 붙인다. 이유 집합은 닫혀 있다 — 자유 문자열이면 거부된 식별자가 되돌아올 자리가 생긴다.

`acl_denied_at_seed` · `acl_denied_at_hop` · `project_binding_mismatch` · `project_binding_unknown` · `edge_type_not_allowlisted` · `applicability_unknown` · `applicability_false` · `top_k_budget`

`P` **exclusion 은 식별자를 담지 않는다.** 한 항목은 `{ reason, hop, count }` 뿐이다. 이전 판은 `excluded[].ref` 에 거부된 ref 를 그대로 실었고, 그것은 ACL 이 감춘 대상을 exclusion 이라는 이름으로 되돌려주는 것이었다. 동결 O6 의 금지 출력은 "capsule payload · hash · pointer set 어디에도" 이며 exclusion 도 capsule payload 다.

`D` `assertNoForbiddenIdentifier(capsule, ids)` 가 반환 객체 전체를 **key 까지 재귀적으로** 훑어 이 규칙을 집행한다.

`P` 그래도 **거부는 말로 해야 한다.** 조용한 빈 capsule 역시 금지이므로 이유와 개수는 남긴다. 무엇을 얼마나 거부했는지는 말하고, 무엇이었는지는 말하지 않는다.

`P` contradiction, unknown, missing evidence 는 capsule 과 함께 이동한다. 빼면 capsule 이 근거보다 확실해 보인다.

### 4.6 선택 전에 edge 를 검증하고, 매 hop 에서 project binding 을 맞춘다

`P` `project_binding_ref` 는 `REQUIRED_EDGE_ATTRIBUTES` 에 들어간다. scope 를 말하지 않는 edge 는 cross-project 도달을 **검사할 방법 자체가 없다.**

`D` `selectCapsule` 은 walk 전에 `graph.edges` 전부를 `validateEdge` 로 검증한다. 자기 계약을 못 지키는 edge 는 binding 이나 authority 주장도 믿을 수 없으므로 선택 전체를 거부한다.

`D` traversal 중 `edge.project_binding_ref !== selector.project_binding_ref` 인 edge 는 **읽기 전에** 거부하고 `project_binding_mismatch` 로 기록한다. 사후 필터는 이미 늦다 — 그때는 다른 과제 자료를 읽은 뒤다.

`D` **`graph.nodes` 는 필수다.** projection slice 는 완전한 node 집합을 선언해야 하고, traversal 이 닿는 모든 ref(seed 포함)가 그 집합에 있으며 selector binding 과 같아야 한다. 선언되지 않은 node 는 `project_binding_unknown` 으로 **거부한다**(fail closed). node 는 각각 정확한 revision ref 와 비어 있지 않은 `project_binding_ref` 를 나른다. 둘 중 하나라도 없으면 선택 전체를 거부한다.

`O` 이전 판은 node 집합을 **선택적**으로 두고 없으면 "edge 를 믿는다"로 처리했다. 그러면 edge 의 binding 주장에 대한 유일한 증인이 그 edge 자신이 되고, 위조된 edge binding 과 참인 edge binding 이 구분되지 않는다. slice 하나를 node 없이 넘기는 것만으로 cross-project 격리가 검사 대상의 정직성에 의존하게 된다.

`D` 위조는 두 검사가 함께 막고, 어느 하나로도 막지 못한다.

- edge 가 alpha 를 주장하는데 가리키는 node 가 bravo 로 선언된 경우 → node 검사(`admit`)가 거부
- edge 가 bravo 를 주장하는데 양끝 node 가 alpha 인 경우 → edge 검사가 거부

`D` 반환 직전에 **돌려줄 ref 전부**를 다시 node binding 에 대조한다. 위 검사들이 이미 도달 불가로 만들었어야 하는 지점이며, "이미 그랬어야 한다"가 바로 누출이 사는 자리이므로 남긴다. 통과하면 capsule 이 `every_returned_ref_bound_to_the_selector: true` 와 `traversed_node_count` 를 함께 말한다.

### 4.5 capsule 은 pointer 를 나른다

`P` raw private span 은 권한 있는 runtime 에서 필요할 때만 hydration 한다. capsule 에는 pointer·hash·bounded evidence 만 둔다. `assertNoRawPayload()` 가 `body`/`text`/`payload` 를 실은 capsule 을 거부한다.

## 5. `context_capsule_fingerprint`

`D` 이 값은 Phase 1-0 이 `replay_relevant_provenance` 에 자리만 잡아두고 정의를 이 lane 에 남겨둔 항목이다. 이제 정의한다.

**선택 절차와 선택 결과를 함께 hash 한다.**

| 포함 | 이유 |
|---|---|
| selector 전 필드 (버전·binding·scope·generation·시각·ACL revision·source family·traversal·ranking·budgets·projection revision) | 같은 절차임을 보장 |
| `included_refs` (revision_id 정렬) | graph projection 이 바뀌어 **같은 selector 가 다른 evidence 를 뽑는 경우**를 잡는다 |
| `excluded_reasons` (중복 제거·정렬) | 무엇을 왜 뺐는지가 바뀌면 capsule 도 바뀐 것이다 |

입력만 hash 하면 projection 변화를 놓치고, 결과만 hash 하면 서로 다른 절차가 우연히 일치한 경우를 놓친다. 이 값은 snapshot fingerprint 로 흘러 들어가므로 **evidence 집합의 변화가 snapshot 에서 반드시 보여야** 한다.

domain separation prefix 와 selector contract version 을 hash 재료에 포함해, 절차 규칙이 바뀌면 과거 fingerprint 가 조용히 무효화되지 않는다.

## 6. 이 lane 이 하지 않는 것

- graph population. 실제 자료를 넣지 않는다
- 새 거대 ontology 신설
- capsule selector 에서 embedding 또는 학습 reranker 사용
- graph 를 source·project baseline·ERP truth 로 승격

## 7. 열린 항목

| 항목 | 상태 | 비고 |
|---|---:|---|
| graph backend (JSON/YAML/CSV/SQLite) | `U` | V1.2 §4.5 그대로 열어 둔다. 이 lane 은 backend 를 고르지 않고 edge 계약만 고정한다 |
| 독립 fixture lock | **미완** | 아래 참조 |

## 8. 검증 강도 — 정직한 한계

`O` Phase 1-0 동결 oracle 에는 1C case 가 **없다.** 따라서 `tests/lane_1c_conformance.mjs` 의 기대값은 **구현과 같은 저자가 작성**했다. kernel conformance 가 독립검증된 oracle 에 대해 판정받는 것과 달리, 이 lane 의 초록불은 그만큼 약하다.

`D` lane 1V 가 1C 에 대한 **독립 locked fixture** 를 만들 의무를 진다. 그때까지 이 lane 을 independently verified 로 부르지 않는다. 시험 출력의 `verification_strength: author_written_fixtures` 가 매 실행마다 이 사실을 함께 보고한다.

현재: 80 검사 통과 / 0 실패. 그중 누출 시험이 hop 별 ACL 적용(`1C/ACL/*`)과 project binding 격리(`1C/BIND/*`)를 직접 확인한다.
