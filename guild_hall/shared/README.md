# guild_hall/shared

## M2-1 Project Knowledge View admission (public-synthetic candidate)

- `project_knowledge_view.mjs` selects exactly one project and an explicit set of
  common revisions. A separately supplied expected grant ref must match a grant
  whose canonical content binds the project, policy, common allowlist, and local
  root declarations before filesystem metadata is consulted. The caller, not the
  selector, owns the trusted provenance of that expected ref.
- `knowledge_root_resolver.mjs` admits only normalized selected roots that are
  strict descendants of one containment root. Selected project and common roots
  must be physically disjoint. The resolver delegates only bounded filesystem
  metadata probes; it never enumerates a directory or reads source bodies.
- The portable knowledge-scope fingerprint is separate from the local admission
  fingerprint. Local path commitments are ephemeral admission observations, not
  root-content hashes, stable file identities, or publishable actual-project
  authority evidence. Any later file read must reopen and revalidate identity.
- This slice is Feature-OFF and public-synthetic. Project/common reads, retrieval,
  Engine input, Wiki/RAG/ERP/TaskDriver writes, activation, and model calls remain
  unauthorized. M2-2 requires an Owner-frozen packet and independent actual-root
  binding before a zero-write project pilot.

The M2-2 public-synthetic composition candidate lives in
`../engineering_engine/subjects/ax_se_project_context_pilot.mjs`. It consumes this
selector as an admission primitive but does not change or reinterpret the M2-1
authority flags. A separately pinned pilot grant, complete project-source reference
manifest, explicit common-to-policy bindings, and a root-bound stable packet read are
required before the existing deterministic Engine is invoked. Actual project use is
still a separate Owner gate.

## AI 작업 기록 공통 이벤트 v1

- `ai_work_record_event.v1.schema.json`은 controlled wrapper/MCP/CLI/hook가
  관찰한 bounded AI 업무를 공통 metadata-only 사건으로 표현하는 strict additive
  계약이다. 기존 WorkSession, `codex_work_context`, H03/H05, ERP task/event,
  operation, ID 또는 저장 경로를 바꾸지 않는다.
- `ai_work_record_event.mjs`는 canonical JSON SHA-256, event 검증,
  strict lifecycle, replay/no-op, atomic conflict/HOLD, outcome gate와 audit-only
  correction을 메모리에서 판정한다. Filesystem, writer, DB, MCP, network, LLM
  호출 또는 runtime 활성화 표면은 없다.
- Unique lifecycle은
  `start -> checkpoint* -> closeout_pending -> closeout -> correction*`다.
  Correction은 terminal projection을 바꾸지 않는 exact-reference annotation이다.
- 모든 closeout kind는 result/packet ref와 evidence-capable ref를 각각 요구한다.
  `blocked`, `handoff`, `abandoned`에는 추가 stop/packet/uncertainty gate가 있으며,
  gate 미충족 상태는 `closeout_pending`이다.
- 모든 사건은 `official_completion=false`다. `completed_candidate`도 공식 완료가
  아니며 non-completed closeout kind는 성공 또는 ERP 완료가 아니다.
- Schema-only 검사는 달력 유효성, 시각 순서, digest, replay, lifecycle과 recursive
  policy를 판정하지 못하므로 pure JS validator/reducer를 함께 사용해야 한다.
- A1-native ID는 공통 safe wire intersection을 사용한다. 기존 colon-bearing ID는
  바꾸지 않고 exact source ID와 deterministic alias를 mapping ref로 함께 남긴다.
- `path_ref`는 normalized relative metadata pointer다. Private instance의
  owner-approved `_workspaces/`, `_workmeta/`, `guild_hall/state/` pointer는
  target 읽기·복사·공개 권한을 뜻하지 않으며 public test는 synthetic path만 쓴다.
- Raw/secret 검사는 알려진 sentinel과 구조 policy enforcement이지 universal DLP가
  아니다. Caller/writer가 metadata-only input 경계를 지킬 책임이 있다.
- controlled path 밖 실행은 `unobserved`이며 추정하지 않는다. 수집률 주장은 해당
  controlled path 범위에만 한정한다. 경계와 호환성은
  `docs/architecture/workspace/AI_WORK_RECORD_EVENT_V1.md`가 설명한다.

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
  New directories are created and verified one direct component at a time, so
  a junction cannot cause even an out-of-root staging side effect. The
  authorized one-shot requires a singleton project binding, stages deterministic
  CSV/XLSX/readback bytes before DB mutation, commits generation plus a durable
  pending publication intent and immutable replay guard, publishes the manifest,
  and only then seals an immutable DB receipt. After a final-rename failure or
  post-manifest crash, only the identical request and original binding digest may
  replay: the current authority/capability, physical DB/root identities, project,
  generation/intent, whole-DB logical state digest, and absence of an accepted
  pointer must all still match. Unrelated DB mutation, guard/schema tamper,
  authority expiry, a receipt, or any conflicting state fails closed. First-run
  and dry-run validation still require the binding's initial DB SHA-256.
  Query-only verification requires receipt, manifest, DB, and artifact parity;
  pending, DB-only, and artifact-only states fail closed.
  The standalone projector CLI remains validation-only. The projector now
  retains an identity-checked native read handle from before `DatabaseSync`
  open through final receipt sealing. Every commit/publication boundary checks
  that the bound path still names that handle and that bytes did not change
  outside an authorized DB transaction. On Windows, after SQLite opens, the
  helper adds a compatible `GENERIC_READ` handle that shares read/write but not
  delete, so it denies rename/replacement without requesting SQLite's unshared
  DELETE access. The query-only verifier retains the same portable identity
  fence through DB/artifact parity. This closes the current Windows fixture's
  native DB-file identity HOLD, but it does not create cross-resource ACID,
  cross-platform artifact publication, scheduling, or production authority.
  Operational Shadow publication therefore remains feature-OFF. RAW-ingress
  authority cannot be reused as classification or projector authority; those
  production epochs remain deliberately unimplemented.

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

## Common source timeline annotations

- `source_timeline_annotation.mjs` is the common lower-level occurrence
  contract for mail, Slack, voice, structured PC work, team files, and run
  logs.
- Every annotation has one KST (`+09:00`) absolute business-event time, an
  explicit time precision, source identity/revision/hash, label kind, actor
  refs, project resolution state, confidence, and immutable authority
  boundaries. Source adapters may receive another explicit offset, but the
  persisted `occurred_at` is always KST.
- Repeated mentions remain repeated occurrences. The contract never stores raw
  bodies and never mutates an official task or project assignment.
- See
  `docs/architecture/workspace/SOURCE_TIMELINE_ANNOTATION_V1.md`.

## Feature-OFF 프로젝트 시간장부 (project timeline) projection

- `project_timeline_projection.mjs` consumes only validated
  `source_timeline_annotation.v1` rows and explicit append-only
  `scope_timeline_binding.v1` records. It does not open RAW sources, infer a
  project, or write a project folder.
- A binding routes one current source occurrence into exactly one of
  `project confirmed`, `project candidate`, `unassigned`, `common`,
  `restricted`, or `conflict`. Only confirmed project bindings enter a
  프로젝트 시간장부; every other state remains outside the project projection.
- The system receipt list is a minimal completeness/dedupe index, not a
  cross-project prompt or human work view. 프로젝트 시간장부 projections are
  isolated, rebuildable, and share only opaque source/revision/span refs.
- Binding corrections are one append-only chain. Orphans, branches, stale
  source revisions, forged IDs, duplicate projection entries, and
  cross-project leakage fail closed.
- `remote_llm` is a provider-neutral candidate producer kind for a bounded
  external model lane. It grants no classification or task authority.
- This module is pure and feature-OFF: it has no filesystem, DB, scheduler,
  network, ERP, MCP, or production-writer surface.

## HPP all-project file inventory delta

- The live HPP local-activity bridge enumerates 14 exact private project roots
  without an LLM. Its 2026-07-27T18:54:45+09:00 inventory contains 29,326 file
  metadata rows.
- One compact mutable inventory row is retained per observed path. The first
  run emits a metadata-only baseline; later 30-minute runs append only new or
  changed `파일 관찰` and non-authoritative absence candidates instead of another
  full packet.
- The `IgnoreNew` task launches a hidden PowerShell window and passed actual
  scheduler runs with held project 0 and no residual lock. The Task Scheduler
  definition itself has `Hidden=false`. Dead/stale legacy or partial locks
  recover atomically after a bounded grace while a live current owner remains
  fenced.
- The superseded repeated full-packet outbox was retired on 2026-07-27 only
  after all 347 packets (1,179,013,521 bytes) proved semantically unchanged,
  an exact same-volume quarantine preserved its byte-tree digest, and a fresh
  14/14 collector run succeeded without recreating the legacy path. Project
  source files, compact inventories, and delta outboxes were not deleted.
- Exact hashes are still partial and refill under the bounded byte budget.
  Unchanged stat tuples may reuse the pinned exact hash for the private
  binding's 30-day TTL. Large or pending hashes still retain path, size, and
  KST observation metadata.
- This is a machine-local collection state. A `파일 관찰` does not reconcile a
  logical `파일 이력`, confirm deletion, write `_workmeta`, or enter a 프로젝트
  시간장부.

## One-project 프로젝트 시간장부 Shadow materializer

- `project_timeline_shadow.mjs` combines one exact project's private mail
  history metadata, already-confirmed Slack annotations, and explicitly
  owner-confirmed metadata events into the common annotation/binding contract.
  It never opens or copies mail bodies, Slack text, audio, attachments, or
  secrets.
- Mail rows marked as raw-copied are held outside the projection. Slack rows
  must already carry the exact confirmed project binding. Voice and the three
  remaining lanes enter only through an explicit project event with retained
  basis refs; this builder does not guess a project.
- `project_timeline_shadow_cli.mjs` is dry-run by default. `--apply` writes only
  below an exact, non-aliased private project root:
  `project_context/projections/timeline/`. Immutable generation JSON and
  monthly JSONL files are replay-safe; `current.csv` is a rebuildable view.
- The first actual bounded Shadow is `P26-014` (KVDS). Its current V3 contains
  269 KST rows: 84 mail metadata occurrences, 3 owner-confirmed voice
  occurrences, and 182 `5필드 업무 결과 요약` proxy occurrences. The latest
  machine-local collector has 200 KVDS work occurrences, so the materialized
  프로젝트 시간장부 is 18 rows behind that outbox. Slack source-arrival and
  attachment refs, reconciled 파일 이력 events, and common 실행·검증 영수증 are
  not yet projected.
- This surface does not accept context, create a task, change an official
  project classification, write ERP/DB, or activate a runtime writer.

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
- `ai_work_record_event.v1.schema.json`: strict common AI work record event contract
- `ai_work_record_event.mjs`: pure canonical digest, event validator, and chain reducer
- `soulforge_state_root.mjs`: 공용 `SOULFORGE_OWNER_ROOT` / `SOULFORGE_STATE_ROOT` override resolver (fail-closed, 값 미출력). Workspace Board runtime, AI usage meter, Codex retention refresh가 같은 state root를 읽도록 한다

## 상태

- shared helper owner boundary는 Stable이다.
- `project_history_envelope.mjs` 계약은 `canon_candidate`이며 live adapter가 아니다.
- `project_history_readiness.mjs`는 readiness-only이며 progression grant, source binding, writer activation을 할 수 없다.
- actual Shadow generation은 `classification_state: shadow`,
  `accepted_history: false`이며 H01~H05 PASS, ERP write, official history promotion,
  live activation을 만들지 않는다.
- AI 작업 기록 공통 이벤트 v1은 `canon_candidate`이며 collector, writer,
  receipt acceptance 또는 공식 완료 authority가 아니다.
- Task Engine의 최신 운영·투영 요약은
  `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`
  맨 앞 `최신 CURRENT 상태표`가 소유한다. 이 README의 Shadow 상태가 바뀌면
  그 표와 같은 commit에서 갱신한다.
- 사람이 보는 Task Engine/AX 업무·증거 이름은
  [`SHARED_GLOSSARY_V0.md`](../../docs/architecture/foundation/SHARED_GLOSSARY_V0.md#task-engine--ax-업무증거-용어)
  를 따른다.
- `HPP Codex 작업 맥락 수집기`가 쓰는 `HPP 로컬 업무 장부`는 현재
  machine-local append-only evidence다. 한 프로젝트에는 서로 다른 실제 업무마다
  여러 `로컬 업무`가 있을 수 있고, 같은 업무를 이어가는 프로젝트
  팀장·자식·계속·검증 작업만 하나의 `work_id`에 명시적으로 연결한다. 각
  시작·연결·checkpoint·종료는 `업무 사건`이다. 아직 accepted WorkSession,
  H05 실행·검증 영수증, 프로젝트 시간장부 또는 ERP 완료 입력은 아니다.
