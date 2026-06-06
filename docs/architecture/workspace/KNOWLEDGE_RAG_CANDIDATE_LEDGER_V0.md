# Knowledge RAG Candidate Ledger v0

## Purpose

`knowledge_rag_candidate_ledger_v0` records deferred knowledge and RAG candidates as metadata-only JSONL rows. It exists for later batch automation to dry-run triage candidates toward sourcebound review, RAG ingestion review, ontology review, owner decision, or hold/reject routes.

The ledger is not a source of truth for source content. It is not approval to ingest, index, promote, mutate a graph, or accept ontology/canon.

## Storage Surface

Runtime rows must be written only to explicit JSONL files under:

- `_workmeta/system/knowledge_rag_candidate_ledger/**`
- `_workmeta/<Pxx-xxx>/knowledge_rag_candidate_ledger/**`

Synthetic tests may use explicit external temp `.jsonl` files. Public tracked docs may describe the contract, but public tracked docs are not runtime ledger storage.

## Candidate Row

Each JSONL row is one append-only candidate record with at least:

- `candidate_id`
- `created_at`
- `project_code`
- `source_context_ref`
- `candidate_kind`
- `short_reason`
- `suggested_route`
- `claim_ceiling`
- `missing_inputs`
- `owner_question`
- `status`
- `boundary`

`project_code` must be `system` or a `Pxx-xxx` style project code. Candidate ids are deterministic from metadata fields when not supplied.

Allowed `suggested_route` values:

- `metadata_only_record`
- `sourcebound_review_candidate`
- `rag_ingestion_candidate`
- `ontology_candidate`
- `owner_decision_needed`
- `reject_or_hold`

Allowed statuses:

- `open`
- `triaged`
- `held`
- `rejected`
- `accepted_for_review`

Allowed claim ceilings are candidate-level only: `observed`,
`source_supported`, or `rejected_or_blocked`. Stronger states such as
`validated_private`, `canon_candidate`, or `canon_entry` require a separate
review/owner-decision surface and are not valid in this append lane.

## Boundary

The validator blocks:

- Raw payload-like fields such as `raw`, `body`, `html`, `payload`, `attachment`, `source_text`, `chunk`, `notebooklm_answer`, `question`, and `prompt`.
- Raw payload refs/extensions such as `.msg`, `.eml`, Office, PDF, HWP/HWPX, archives, and audio/video payloads.
- Absolute runtime paths, UNC paths, traversal, and secret-like paths or values.
- Project codes outside `system` and `Pxx-xxx`.
- Routes or claim ceilings that imply automatic canon promotion, source truth, graph mutation, or RAG ingestion.

`rag_ingestion_candidate` rows must still list `owner_rag_ingestion_decision` and `knowledge_source_card` as missing inputs. The row is only a deferred candidate signal.

## Command Surface

The command surface is under `guild_hall/knowledge_access/cli.mjs`:

```bash
npm run guild-hall:knowledge-access -- candidate-ledger-append --ledger-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl --project-code system --source-context-ref _workmeta/system/reports/procedure_capture/example.md --candidate-kind manual_candidate --short-reason "metadata-only deferred candidate" --suggested-route owner_decision_needed --missing-input owner_decision_ref --owner-question "Should this stay metadata-only?"
npm run guild-hall:knowledge-access -- candidate-ledger-validate --ledger-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl
npm run guild-hall:knowledge-access -- candidate-ledger-triage --ledger-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl
```

Validation script:

```bash
npm.cmd run validate:knowledge-rag-candidate-ledger
```

`candidate-ledger-triage` reads only explicit candidate JSONL metadata rows. It groups candidates by project, route, readiness, missing inputs, and repeated-use signal when present, then emits owner questions and recommended next actions. It performs no sourcebound review, RAG ingestion, ontology/public canon promotion, graph mutation, archive, or retire action.
