# 04. 지식, ontology, RAG, Wiki

| 항목 | 내용 |
| --- | --- |
| owner | source owner + project/common knowledge owners |
| authority | exact lineage, retrieval/projection roles, access evidence |
| CURRENT | RAG/Wiki와 temporal ontology 계약은 있으나 project path와 exact revision propagation은 migration 중 |
| TARGET | project/common 격리 + source-revision-bound RAG/Wiki/TaskDriver use |
| non-goals | RAG/Wiki/Neo4j를 source truth로 만들기, 모든 자료 Wiki 복제 |
| stop | exact revision/locator 부재, project/common 분류 불명, permission 불명 |

## 역할 분리

| 층 | 역할 | authority 아님 |
| --- | --- | --- |
| source original/revision | 사실 근거 | - |
| RAG | exact page/chunk 검색 projection | 승인·canon |
| Wiki | sourcebound 탐색/설명 projection | source truth |
| reviewed knowledge | 재사용 canon | project application truth |
| project ontology | 실제 project relation metadata | public reusable canon |
| Neo4j/UI | generated view | ledger writer |

project payload와 common payload 경계는 [02](02_OWNER_BOUNDARIES_AND_STORAGE.md)를 따른다.
project ontology instance는 `_workmeta/<project_code>/ontology/**` metadata-only이며 raw body나
chunk를 저장하지 않는다.

RAG는 아래 개체 목록 자체가 아니라 **필요한 exact 근거를 찾는 검색층**이다. 한 source
revision을 등록할 때 결과를 섞지 않고 다음 세 갈래로 만든다.

1. 검색용: chunk + exact page/section/time locator + embedding/index metadata
2. 맥락 후보: project, event, actor, task candidate, file/artifact, evidence/rule 관계 후보
3. 설명용: sourcebound Wiki summary/claim; 필요할 때만 만들고 원본 전체를 복제하지 않음

관계 후보가 confirmed ontology가 되거나 task가 되는 과정은 별도 approval/TaskDriver를 거친다.

## 지식과 도구를 섞지 않는 법

| 예 | 기본 분류 | RAG/Wiki에 넣는 것 |
| --- | --- | --- |
| 방사청·SE 가이드북 | sourcebound knowledge/rule source | exact 판·page/chunk·규칙 후보·Wiki 설명 |
| 소나 설계 문서·시험 근거 | project knowledge/evidence | project-local source revision·locator·claim |
| 회사 공통 설계 원칙 | common knowledge | common-only RAG/Wiki와 reviewed knowledge |
| 잡음/O-ring 계산기 실행 코드 | tool | 실행 코드는 tool owner; 사용 event에는 exact tool revision ref |
| 계산기 매뉴얼·식 근거·검증 예제 | knowledge/evidence | 필요하면 RAG/Wiki, tool 결과의 provenance 근거 |

LLM이 계산기를 쓸지 판단할 수 있지만 계산 결과를 지식 truth로 자동 승격하지 않는다. 도구를
깊게 하네스하기 전에 입력/출력/검증/중단조건과 exact version ref가 필요한지로 결정한다.

## exact sync

```text
source_id -> source_revision_id + content_id
  -> extraction_run_id
  -> rag_index_id / rag_chunk_id -> evidence_locator_id
  -> wiki_page_id / wiki_revision_id -> claim_id
  -> rule_revision_id / knowledge_revision_ref
  -> TaskDriver justified_by exact revision
  -> task/event/artifact uses exact revision
```

source revision이 바뀌면 RAG/Wiki를 덮어쓰지 않고 새 lineage를 만든다. index/chunk가 ready여도
project applicability나 task auto-open authority가 되지 않는다.

## access logs

선택된 근거는 `retrieve`, 실제 인용은 `cite`, 실제 업무 반영은 `apply`로 분리한다.
metadata-only access event에는 actor/project/task, exact target revision, run/rank, output ref,
outcome만 두고 raw question/body/chunk를 넣지 않는다. 접근 횟수만으로 중요도·승격·폐기를
결정하지 않는다.

## Neo4j/view rule

Neo4j는 선택 가능한 view-only projection이다. generated edge 편집으로 source, task,
Driver, knowledge owner record가 변하지 않는다. candidate/conflict/unknown을 confirmed edge와
다르게 표시하고 `valid_at`, `known_at`, revision, authority/application state 필터를 제공한다.

| Neo4j/UI가 보여줄 수 있음 | Neo4j/UI가 할 수 없음 |
| --- | --- |
| 시간 줄기, 가지, 관문, task, actor, evidence와 exact revision link | 원본·task·승인·canon의 source truth가 되기 |
| 가지 간 참조, dependency, supersession, conflict/candidate 상태 | fuzzy edge를 confirmed relation으로 조용히 승격 |
| 특정 시점에 알고 있던 지식/규칙/task 상태 | 누락된 source coverage를 완전한 이력처럼 표현 |
| RAG/Wiki 근거에서 task/result까지 역추적 | graph 편집만으로 owner record를 변경 |

Neo4j는 선택 사항이다. 없어도 ledger, RAG, TaskDriver, task engine은 동작해야 하며 필요할 때
동일 metadata에서 다시 만드는 viewer/projection으로 둔다.

## canonical refs

- [`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../../../../../docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)
- [`ONTOLOGY_MODEL_V0.md`](../../../../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md)
- [`PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md`](../../../../../docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md)
- [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
