# .registry/knowledge

- `towed_body_sensor_stability/` is a public-safe source-supported reusable knowledge entry for towed-body stability, internal sensor-axis quieting, liquid damping, cable/body vibration, appendage case planning, and pointing-budget orientation.
- `knowledge/` 는 reusable knowledge canon 을 두는 registry surface 다.
- 각 knowledge folder 는 `knowledge.yaml` 을 canon entry 로 사용한다.
- class-local `knowledge_refs.yaml` 는 여기의 knowledge id 를 assign/ref 로 연결한다.
- `boundary_governance/` 는 skill package authoring 과 boundary review lane 을 위한 minimal canonical knowledge sample 이다.
- `graph_rag/` 는 GraphRAG / graph-assisted RAG 판단을 위한 source-supported reusable knowledge entry 다.
- `sonar_signal_chain/` 는 수중 음향, hydrophone/transducer, AFE, ADC, 디지털 수신 처리, beamforming/detection, calibration/QA 를 잇는 sonar engineering sourcebound orientation entry 다.
- `dapa_weapon_system_test_eval_guidebook/` 는 공식 공개 방위사업청 무기체계 시험평가 실무 가이드북을 승인 기준 지식으로 등록한 entry 다.

## canon entry guards

- 새 `knowledge.yaml` 또는 기존 entry 승격은 public-safe reusable knowledge 에만 허용한다.
- entry 또는 인접 문서는 claim ceiling/state, owner boundary, source/review 근거, private/raw/secret 비포함 여부를 확인 가능하게 남긴다.
- NotebookLM/LLM/advisory note, ledger row, analysis label 만으로는 knowledge canon entry 를 만들거나 class `knowledge_refs.yaml` 에 연결하지 않는다.
- 공식 기관 공개자료처럼 owner rule 로 승인된 source 는 public-safe 요약, ontology seed, NotebookLM packet manifest, registry entry 를 같은 작업 안에서 만들 수 있다. 다만 원문 전체, chunk, NotebookLM 답변, private payload 는 public entry 에 복사하지 않는다.
- 근거가 부족하면 `.registry/knowledge/**` 가 아니라 `_workmeta/**` candidate 또는 `guild_hall/state/**` carry-forward 로 둔다.
