# guild_hall/shared

## Feature-OFF project-history knowledge projection

- `project_history_knowledge_projection.mjs` derives explicit `project` or
  `common` held candidates, an exact graph view, and a rebuildable metadata-only
  RAG manifest/index from a valid actual Shadow generation. The caller must
  also provide the expected origin project code, which must exactly match the
  generation; no project is hard-coded or inferred as a fallback.
- `project_history_knowledge_projection_cli.mjs` reads one generation and emits
  canonical stdout only. It has no writer, DB, network, Drive, NotebookLM, or
  canon mutation route.
- Project scope remains project-owned. Common scope is system-owned while
  retaining the origin project. There is no implicit fallback between scopes.
- Source text, RAW payload, locators, lineage/graph tampering, live or
  authoritative manifest laundering, accepted knowledge, and feature
  activation fail closed. Every authority flag stays false and the route stays
  `owner_decision_needed`.

## 목적

- `shared/` 는 `guild_hall/` owner 들이 공통으로 쓰는 최소 helper surface 다.
- repo-relative path 정규화, JSON/JSONL state 입출력, 존재 여부 점검처럼 owner 경계를 바꾸지 않는 내부 유틸만 둔다.

## 범위

- `doctor`, `gateway`, `town_crier`, `night_watch` 같은 cross-project 운영 owner 에서 중복되던 helper 를 모은다.
- `project_history_envelope.mjs` 는 다섯 history lane의 public synthetic
  event-envelope/coverage-receipt canonicalization과 validation만 제공한다.
- `project_history_actual_shadow.mjs` 는 별도 private metadata-only pilot packet을
  feature-OFF 상태에서 검증해 actual Shadow generation을 메모리에서만 만든다.
- project truth, private continuity, runtime state 자체를 소유하지는 않는다.

## 원칙

- helper 는 owner boundary 를 바꾸지 않는 범위에서만 추가한다.
- 새 helper 를 넣을 때도 실제 state/read/write owner 는 계속 각 owner 문서가 가진다.
- project history envelope/readiness/actual Shadow module은 pure named exports만
  가지며 filesystem, writer, adapter, resolver, DB, network를 사용하지 않는다.
  actual Shadow CLI는 JSON packet 하나를 읽어 canonical JSON을 stdout으로만
  내보내는 thin adapter이며 ERP, official history, source, output file을 쓰지 않는다.
  owner ratification 전 envelope 상태는 `canon_candidate`이고 live completeness/gap
  vocabulary는 D25가 소유한다.
- actual Shadow packet은 immutable receipt byte digest와 redacted proof digest를
  분리하고, semantic occurrence·receipt proof·classification evidence의 source
  digest를 exact-match한다. raw/path/URI/body/transcript/payload field는 재귀적으로
  거부한다.
- actual pilot native type은 lane별 `mail_occurrence`, `voice_recording`,
  `bounded_pc_work_event`, `file_observation`, `bounded_run_event`로 고정한다. 이는
  bounded pilot identity 검사이며 production owner ratification이나 H01~H05 PASS가
  아니다.

## 색인

- `io.mjs`: 공통 JSON/JSONL 및 atomic text I/O helper
- `python_bin.mjs`: Python executable 선택 helper
- `project_history_envelope.mjs`: public synthetic history envelope/coverage validator
- `project_history_readiness.mjs`: public gate-map and synthetic five-lane Shadow/H06 readiness validator
- `project_history_actual_shadow.mjs`: feature-OFF actual five-lane Shadow generation validator/builder
- `project_history_actual_shadow_cli.mjs`: metadata packet read + canonical stdout-only adapter
- `project_history_actual_shadow_{packet,generation}.v1.schema.json`: input/output strict schemas

## 상태

- shared helper owner boundary는 Stable이다.
- `project_history_envelope.mjs` 계약은 `canon_candidate`이며 live adapter가 아니다.
- `project_history_readiness.mjs`는 readiness-only이며 progression grant, source binding, writer activation을 할 수 없다.
- actual Shadow generation은 `classification_state: shadow`,
  `accepted_history: false`이며 H01~H05 PASS, ERP write, official history promotion,
  live activation을 만들지 않는다.
