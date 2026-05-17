# .registry/knowledge

- `knowledge/` 는 reusable knowledge canon 을 두는 registry surface 다.
- 각 knowledge folder 는 `knowledge.yaml` 을 canon entry 로 사용한다.
- class-local `knowledge_refs.yaml` 는 여기의 knowledge id 를 assign/ref 로 연결한다.
- `boundary_governance/` 는 skill package authoring 과 boundary review lane 을 위한 minimal canonical knowledge sample 이다.

## canon entry guards

- 새 `knowledge.yaml` 또는 기존 entry 승격은 public-safe reusable knowledge 에만 허용한다.
- entry 또는 인접 문서는 claim ceiling/state, owner boundary, source/review 근거, private/raw/secret 비포함 여부를 확인 가능하게 남긴다.
- NotebookLM/LLM/advisory note, ledger row, analysis label 만으로는 knowledge canon entry 를 만들거나 class `knowledge_refs.yaml` 에 연결하지 않는다.
- 근거가 부족하면 `.registry/knowledge/**` 가 아니라 `_workmeta/**` candidate 또는 `guild_hall/state/**` carry-forward 로 둔다.
