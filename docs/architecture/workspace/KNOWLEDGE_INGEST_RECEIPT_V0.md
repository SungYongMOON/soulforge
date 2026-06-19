# Knowledge Ingest Receipt v0

## Purpose

`knowledge_ingest_receipt_v0` records a metadata-only receipt for bounded
knowledge ingest work. It answers one operational question: after a chat, file
upload, source packet, wiki preparation, RAG preparation, or closeout, which
layers are still missing or owner-gated?

The receipt is not source truth, owner approval, RAG index evidence, NotebookLM
authority, or public canon. It is a recovery handle so another PC can later see
what was captured and what still needs work.

## Storage Surface

Runtime receipt rows must be written only to explicit JSONL files under:

- `_workmeta/system/knowledge_ingest_receipts/**`
- `_workmeta/<Pxx-xxx>/knowledge_ingest_receipts/**`

Missing-audit tables should be written under:

- `_workmeta/system/reports/knowledge_ingest_missing_audit/**`
- `_workmeta/<Pxx-xxx>/reports/knowledge_ingest_missing_audit/**`

Cross-PC visibility depends on syncing the private `_workmeta` repo or another
owner-approved metadata sync path. A receipt written only in a local Codex chat
or unpushed private repo is not recoverable from another PC.

## Receipt Row

Each JSONL row is one metadata-only receipt with:

- `receipt_id`
- `created_at`
- `project_code`
- `capture_surface`
- `ingest_request_ref`
- `summary_label`
- `trigger_skill_id`
- optional `source_thread_ref`
- optional `source_pc_label`
- `required_layers`
- `layer_states`
- `claim_ceiling`
- `boundary`

Known layers are:

- `candidate`
- `source`
- `wiki`
- `rag`
- `canon`

Allowed layer statuses are:

- `missing`
- `queued`
- `recorded`
- `stored`
- `prepared`
- `completed`
- `blocked`
- `owner_decision_needed`
- `not_applicable`

Statuses that imply progress, such as `recorded`, `stored`, `prepared`, or
`completed`, require a metadata ref. Open statuses such as `missing`, `queued`,
`blocked`, and `owner_decision_needed` require a next action.

## Command Surface

The command surface is under `guild_hall/knowledge_access/cli.mjs`:

```bash
npm run guild-hall:knowledge-access -- ingest-receipt-append --ledger-ref _workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl --project-code system --ingest-request-ref _workmeta/system/reports/procedure_capture/example.md --summary-label "metadata-only deferred ingest" --candidate-status recorded --candidate-ref _workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl#L1 --source-status missing --wiki-status missing --rag-status owner_decision_needed --canon-status missing
npm run guild-hall:knowledge-access -- ingest-receipt-validate --ledger-ref _workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl
npm run guild-hall:knowledge-access -- ingest-receipt-missing-audit --ledger-ref _workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl --write --audit-id knowledge_ingest_missing_audit_20260619
npm run guild-hall:knowledge-access -- ingest-receipt-missing-audit-validate --audit-ref _workmeta/system/reports/knowledge_ingest_missing_audit/knowledge_ingest_missing_audit_20260619/missing_audit.json
```

Validation script:

```bash
npm.cmd run validate:knowledge-ingest-receipt
```

## Boundary

The receipt and audit validators block:

- Raw payload-like fields such as `raw`, `body`, `html`, `payload`,
  `attachment`, `source_text`, `chunk`, `notebooklm_answer`, `question`, and
  `prompt`.
- Raw payload refs/extensions such as mail, Office, PDF, HWP/HWPX, archives,
  and audio/video files.
- Absolute runtime paths, UNC paths, path traversal, and secret-like paths or
  values.
- Project codes outside `system` and `Pxx-xxx`.
- `canon_entry` claims unless the canon layer is completed and has a metadata
  ref.

Receipt capture performs no sourcebound review, source-text extraction, RAG
index build, Drive/NotebookLM upload, NotebookLM query, ontology/public canon
promotion, graph mutation, archive, retire, or owner-decision application.

## Missing Audit

`ingest-receipt-missing-audit` reads explicit receipt JSONL rows and writes:

- `missing_audit.json`
- `missing_audit.csv`
- `missing_audit.md`

The table includes each receipt id, project code, capture surface, summary
label, layer statuses, missing layers, blocked layers, owner-decision layers,
completion state, and next action. It is a recovery and work-routing table, not
a proof that the underlying knowledge is valid.
