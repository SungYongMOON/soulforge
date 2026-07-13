# guild_hall/knowledge_access

## Purpose

- `knowledge_access/` is a small public-safe command surface for proving that ordinary knowledge ref reads/uses can append metadata-only ledger rows.
- Persisted metadata-RAG and source-text answer runs use the same writer to append selected-evidence `retrieve` rows automatically; ordinary editor/file/Wiki reads remain unobserved unless their adapter calls the writer.
- Automatic RAG writers validate the whole selected-evidence batch before one append and use an opaque per-node shard under `events/<year>/<year-month>/`; this prevents validation-partial batches and avoids four PCs writing the same monthly file.
- New rows carry a storage-independent logical `dedupe_key`; validators recompute it from canonical event identity before snapshot aggregation, which falls back to legacy `event_id` only for older rows without the key.
- It supports `read` for repo-relative public knowledge files and `record` for use/citation events where the target payload is not read.
- It supports `analyze`/`rollup` for explicit JSONL ledger files or repo-relative ledger refs, producing metadata-only usage rollup and boundary review note JSON.
- It supports `notebooklm-bridge` for importing explicit NotebookLM-like metadata binding/source-ledger/query-log files into `imported_log_entry` rows plus a metadata-only summary.
- It supports `candidate-ledger-append`, `candidate-ledger-validate`, and `candidate-ledger-triage` for deferred knowledge/RAG candidates under the workspace contract at `docs/architecture/workspace/KNOWLEDGE_RAG_CANDIDATE_LEDGER_V0.md`.
- It supports `ingest-receipt-append`, `ingest-receipt-validate`, and `ingest-receipt-missing-audit` for metadata-only knowledge ingest receipts under the workspace contract at `docs/architecture/workspace/KNOWLEDGE_INGEST_RECEIPT_V0.md`.
- The synthetic NotebookLM bridge fixture at `docs/architecture/workspace/examples/notebooklm_bridge/` covers positive advisory imports and blocked no-query/no-fabrication behavior without real source payloads.
- The ledger target is always explicit: pass either `--ledger-root` or `--ledger-file`. Use `_workmeta/**`, `guild_hall/state/**`, `private-state/**`, or a temp path outside the repo for actual runtime rows.
- The combined operating model is documented at `docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md`.

## Commands

```bash
npm run guild-hall:knowledge-access -- read --ref docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md --ledger-root _workmeta/system/reports/knowledge_access --reason-used "checked activity contract"
npm run guild-hall:knowledge-access -- record --ref docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md --ledger-root _workmeta/system/reports/knowledge_access --access-type cite --reason-used "cited activity contract" --output-ref _workmeta/system/reports/example.md
npm run guild-hall:knowledge-access -- record --ref knowledge:dapa_guidebook --ledger-root _workmeta/system/reports/knowledge_access --access-type apply --project-code P24-049 --gate-id CDR --branch-id branch:P24-049:verification --revision-ref source_revision:dapa:v1 --reason-used "applied approved guide rule" --output-ref _workmeta/P24-049/reports/example.md
npm run guild-hall:knowledge-access -- record --ref docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md --ledger-root _workmeta/system/reports/knowledge_access --capture-mode automatic_end_of_task_trigger_check --access-type route --trigger-result metadata_only_record --suggested-route knowledge_access_ledger --claim-ceiling observed --reason-used "end-of-task trigger check used this ref"
npm run guild-hall:knowledge-access -- analyze --ledger-ref _workmeta/system/reports/knowledge_access/events/2026/2026-05.jsonl
npm run guild-hall:knowledge-access -- notebooklm-bridge --binding-ref docs/architecture/workspace/examples/notebooklm_bridge/synthetic_notebooklm_binding.yaml --ledger-file _workmeta/system/reports/knowledge_access/notebooklm_bridge.jsonl
npm run guild-hall:knowledge-access -- candidate-ledger-append --ledger-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl --project-code system --source-context-ref _workmeta/system/reports/procedure_capture/example.md --candidate-kind manual_candidate --short-reason "metadata-only deferred candidate" --suggested-route owner_decision_needed --missing-input owner_decision_ref --owner-question "Should this stay metadata-only?"
npm run guild-hall:knowledge-access -- candidate-ledger-validate --ledger-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl
npm run guild-hall:knowledge-access -- candidate-ledger-triage --ledger-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl
npm run guild-hall:knowledge-access -- ingest-receipt-append --ledger-ref _workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl --project-code system --ingest-request-ref _workmeta/system/reports/procedure_capture/example.md --summary-label "metadata-only deferred ingest" --candidate-status recorded --candidate-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl#L1 --source-status missing --wiki-status missing --rag-status owner_decision_needed --canon-status missing
npm run guild-hall:knowledge-access -- ingest-receipt-validate --ledger-ref _workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl
npm run guild-hall:knowledge-access -- ingest-receipt-missing-audit --ledger-ref _workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl --write --audit-id knowledge_ingest_missing_audit_20260619
npm run validate:knowledge-access
npm run validate:knowledge-rag-candidate-ledger
npm run validate:knowledge-ingest-receipt
```

## Optional Stop Hook Guards

`knowledge_trigger_stop_guard.mjs` is a low-noise Codex `Stop` hook helper. It does not judge knowledge and does not read transcripts. It only inspects the hook payload's final assistant message and blocks bounded Soulforge completion reports that forgot the Korean `지식 트리거 확인:` closeout line. New reports should use user-facing Korean labels such as `지식 트리거 확인: 책임자 판단 필요`; legacy `지식 트리거 확인: 오너 판단 필요` and `Knowledge trigger check:` lines are still accepted for compatibility.

`rule_hardening_stop_guard.mjs` is the matching low-noise guard for conversation rule hardening. It does not scan transcripts or decide whether a candidate is valid. It blocks bounded Soulforge completion-like reports that forgot the `규칙 강화 체크:` closeout block, and when that closeout contains real candidate bullets it appends a sanitized candidate JSONL row under `private-state/guild_hall/state/operations/soulforge_activity/rule_hardening_candidates/`. The row keeps metadata needed to rediscover the situation later, such as thread/run ids when present, project-code hints, a short sanitized task hint, message hash, closeout hash, and candidate bullets. The actual extraction procedure lives in the local Codex skill `conversation-rule-hardening`; the hook record is a follow-up queue, not a canon or project-rule promotion.

Preferred closeout wording:

```text
지식 트리거 확인: 책임자 판단 필요
주장 한계: 관찰됨 - 자료를 찾고 정리했지만 아직 검증/승인된 지식은 아님

규칙 강화 체크:
- 새 규칙 후보: 없음
```

Example user-local Codex hook config:

```toml
[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = 'node "$(git rev-parse --show-toplevel)/guild_hall/knowledge_access/knowledge_trigger_stop_guard.mjs"'
timeout = 10
statusMessage = "Checking Soulforge closeout line"

[[hooks.Stop.hooks]]
type = "command"
command = 'node "$(git rev-parse --show-toplevel)/guild_hall/knowledge_access/rule_hardening_stop_guard.mjs"'
timeout = 10
statusMessage = "Checking Soulforge rule hardening closeout"
```

Keep this in user/project Codex hook config, not in public runtime ledger data. The guards stay silent on normal conversation, non-Soulforge cwd, and responses that already include the required closeout lines.

## Boundary

- Ledger rows include refs and metadata only: event id, timestamp, capture mode, ledger ref, actor, target knowledge ref, access type, reason, output ref, work context, outcome state, and redaction flags.
- End-of-task trigger flags only populate `accumulation_delta_hint` metadata for already-used refs; they do not validate source truth, approve ontology/owner decisions, mutate graphs, archive/retire refs, or promote canon.
- Stop hook guard output is a compact missing-line continuation request only; it does not evaluate candidate quality, scan transcripts, or store `없음` / legacy `no_trigger` rows.
- Rule-hardening Stop hook output is also a compact missing-line continuation request only; it does not judge candidate quality, scan transcripts, write indexes, or promote rules.
- Source file payloads are returned only by `read`; they are never copied into the JSONL row.
- `retrieve` means selected into an answer context. `cite` and `apply` are separate later events; retrieval count alone is not evidence of project application or source importance.
- Persisted RAG answer writers record opaque chunk/unit ids, index refs, rank, query fingerprint, and output refs. They do not copy raw questions, source text, chunk bodies, or private runtime paths.
- `analyze`/`rollup` reads only explicit `.jsonl` ledger files or repo-relative ledger refs. It does not scan directories, follow ledger roots, read target payloads, or mutate canon/ontology/graph state.
- `notebooklm-bridge` reads only explicit metadata files. It does not call `nlm`, inspect NotebookLM auth/session files, copy source/query payloads or free-form query-log reason prose, or infer events when the query log has no importable rows.
- `notebooklm-bridge` rejects malformed `timestamp_utc` values, unsafe `entry_ref` auth/session/runtime paths, and invalid event enum cells without echoing rejected cell payloads.
- Rollup output includes counts, recency, actor/access/context count metadata, issue summaries, and boundary note checks only. Invalid rows are reported by safe source ref and line number without echoing row payloads.
- `apply_count` means exact `apply` events. `substantive_use_count` includes `apply`, `cite`, `promote`, and `validate`; neither is inferred from retrieval.
- Persisted RAG outputs use an atomically reserved occurrence-immutable path plus `output_revision_ref`. Shared workspace outputs use one output-global reservation in the shared workspace coordination surface, independent of project code; project-private outputs reserve inside their `_workmeta` owner. A metadata-only pending receipt lives under the matching project/system `_workmeta` access-history owner before the artifact and is marked recorded only after ledger append plus read-back verification of the expected physical `ledger_ref`. Reconciliation uses the recovering PC's separate shard, so pending receipts can be closed without rerunning the LLM answer or writing another PC's shard. Cross-PC exclusion requires every writer to see the same shared workspace filesystem.
- NotebookLM-like imported rows remain advisory signals only; analyzer output is not canon validation, owner approval, or graph mutation.
- Candidate ledger rows are metadata-only deferred signals; validation rejects raw payload-like fields, raw payload refs/extensions, absolute runtime paths, traversal, secret-like values, invalid project codes, and routes/claim ceilings that imply automatic source truth, graph mutation, canon promotion, or RAG ingestion.
- Candidate ledger triage reads only explicit candidate JSONL rows and emits dry-run grouping, owner questions, and recommended next actions; it performs no sourcebound review, RAG ingestion, ontology/canon promotion, graph mutation, archive, or retire action.
- Ingest receipt rows are metadata-only recovery handles for candidate, source, wiki, RAG, and canon layer status. Missing-audit tables read explicit receipt JSONL rows only and perform no sourcebound review, source-text extraction, index build, Drive/NotebookLM upload, NotebookLM query, ontology/public canon promotion, graph mutation, archive, retire, or owner-decision application.
- Secret-like filenames, private/runtime roots, absolute paths, and path traversal refs are blocked before any read or append.
- Public tracked canon is not a runtime ledger owner. If the ledger target is inside the repo, it must be under `_workmeta/**`, `guild_hall/state/**`, or `private-state/**`.
- Analysis outputs report source ledgers as repo-relative refs or `ledger_file:<basename>` for external temp paths; runtime absolute source paths are not emitted.
