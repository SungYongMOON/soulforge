# temporal_knowledge_binding

## 목적

프로젝트 시간축과 source/RAG/Wiki/지식 축을 연결할 때 사용하는 public-safe
metadata shape를 보여준다.

이 예시는 원본, 추출본문, RAG chunk, Wiki 본문, 실제 project relation truth가 아니다.
실제 payload는 `_workspaces/**` 또는 owner-approved worksite에, private metadata는
`_workmeta/**`에 둔다.

## 파일

- `source_revision_record.template.yaml`: 하나의 exact source revision의 identity,
  content/time/provenance만 고정하는 immutable metadata record 예시. 승인·hash 검증·claim
  ceiling 변화는 별도 append-only status event에 둔다.
- `source_revision_status_event.template.yaml`: 승인·hash 검증·claim ceiling 변화를
  원본 revision record 수정 없이 쌓는 append-only event 예시
- `project_knowledge_application.template.yaml`: source/RAG/Wiki/claim/rule/knowledge를
  project/gate/branch/task/artifact에 연결하는 적용 `event_id` 중심 relation packet 예시

`project_knowledge_application.template.yaml`에 ID가 많이 보이는 이유는 원본 파일
하나가 많은 ID를 갖기 때문이 아니다. 여러 개체 사이의 N:M 관계를 기록하는 적용
event packet이기 때문이다.

## 경계

- template placeholder를 승인·source support·canon evidence로 사용하지 않는다.
- runtime absolute path, raw payload, source text, chunk text, Wiki prose를 넣지 않는다.
- exact evidence가 없으면 `review_required`를 유지한다.
- 동일 source로 검증된 legacy ID만 `aliases`에서 canonical `source_id`로 연결한다.
- index, sidecar, packet, bundle ref는 typed ref 또는 SourceCollection 관계로 보존한다.
- 관계 endpoint는 `{entity_type, owner_surface, entity_id}` 3-tuple을 사용한다.
- 과거 조회는 `valid_at`과 `known_at`을 함께 사용한다.

상위 계약은
[`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../../../foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)를
따른다.
