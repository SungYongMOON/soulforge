# guild_hall/shared

## Receipt-to-Shadow adapter v2

- `project_history_receipt_adapter_v2.mjs` converts an explicit set of HPP
  staging or voice-copy receipts into zero or more metadata-only Shadow events
  for each of the five lanes. It never reads a RAW payload and never accepts a
  project classification.
- The adapter always emits exactly five independent coverage receipts, so an
  empty or degraded lane is visible rather than silently treated as complete.
  Writer-authority evidence is a separate attestation and cannot be smuggled in
  as source evidence.
- Replay is deterministic. Reusing an occurrence identity with different
  receipt evidence fails closed. Version 1 remains unchanged for retained pilot
  evidence.
- A feature-OFF validation build additionally requires a separately supplied private
  Shadow-adapter authority record and its externally pinned digest. The adapter
  opens that exact file, binds its identity and bytes, and checks its validity
  against the trusted operation clock rather than request time. An opaque
  capability is checked at the copied-SQLite and artifact-bundle boundaries.
  New directories are
  created and verified one direct component at a time, so a junction cannot
  cause even an out-of-root staging side effect. The standalone projector CLI
  is validation-only. Operational Shadow publication remains disabled: the HPP
  scheduler must not invoke the one-shot route until an independent review proves
  one continuous authority fence through database commit and final publication,
  plus immutable staged bytes through rename. RAW-ingress authority cannot be reused as classification or
  projector authority; those production epochs remain deliberately
  unimplemented.

## Continuous receipt-to-Shadow orchestrator v1

- `project_history_continuous_shadow_orchestrator_v1.mjs` binds one externally
  pinned continuous-ingress v2 run receipt, one explicit project, explicit
  custody receipt metadata, and a separate private Shadow authority epoch into
  the existing receipt-adapter v2 request and in-memory generation/replay path.
- The orchestrator rejects missing, ambiguous, or mixed project classification
  and RAW-ingress authority reuse. H01-H05 preserve each lane's honest coverage,
  including `complete_no_events`; H06 is only a feature-OFF Shadow coverage
  aggregate and never grants production readiness.
- This surface has no CLI or output writer. It does not schedule work, write a
  live/copy ERP database, publish accepted history, or enable a classifier,
  projector epoch, service, or external side effect.

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
- `project_history_knowledge_query.mjs` adds the next read-only step over one
  validated projection. The caller must repeat the exact `project` or `common`
  scope and origin project; a mismatched projection is rejected instead of
  falling back to another scope. Its CLI emits metadata-only stdout, keeps the
  raw question transient, and performs no file, DB, network, Wiki, RAG, graph,
  Drive, NotebookLM, or canon write.

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
