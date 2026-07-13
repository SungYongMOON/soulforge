# dev-ERP report workflow shell v1

Status: candidate, default off

Workflow: `report_authoring_v0` only

Public request schema: `dev_erp.workflow_job_create.v1`

## Purpose and boundary

This slice adds a narrow dev-ERP shell around the fixed report-authoring workflow. It does not add a general workflow launcher. A browser can upload bounded report inputs, create one fixed job, inspect metadata-only state, cancel a queued job, retrieve approved result artifacts, and resume an interrupted receipt write.

The shell does not accept a prompt, model, skill, agent, instruction source, filesystem path, workflow id, binding id, digest, environment, command, or network option from a browser. There is no chat fallback. Existing chat v6/v1 request bodies and their 1 MiB limit remain unchanged.

This slice is not a production-readiness claim. The server has no production actual-probe dependency in this slice, so capability remains disabled even when environment self-attestation fields are populated. A later activation change must bind a current actual probe, the fixed shared-runner bundle, ERP and worker service identities, project ACL probe, pass-runner release, owner approval, attestation expiry, and repository review evidence. Setting an enable environment variable alone is insufficient.

## Fixed browser surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/workflow-jobs/capabilities` | Report fixed-route availability and non-secret blockers |
| `POST` | `/api/workflow-inputs?project_code=...&role=source|draft` | Upload one raw, uncompressed input body |
| `POST` | `/api/workflow-jobs` | Create an idempotent fixed workflow job |
| `GET` | `/api/workflow-jobs` | ACL-filtered, bounded job list |
| `GET` | `/api/workflow-jobs/:job_id` | Metadata-only job state |
| `GET` | `/api/workflow-jobs/:job_id/result` | Metadata-only result and artifact references |
| `POST` | `/api/workflow-jobs/:job_id/cancel` | CAS cancel of a queued job only |
| `POST` | `/api/workflow-jobs/:job_id/recovery` | Resume an interrupted receipt operation only |
| `GET` | `/api/workflow-jobs/:job_id/artifacts/:role` | ACL-checked artifact body read by one canonical artifact role |

The create body has exactly these fields:

```json
{
  "schema": "dev_erp.workflow_job_create.v1",
  "project_code": "P00-000_INBOX",
  "mode": "full_authoring",
  "report_type": "analysis",
  "audience": "internal_review",
  "input_handles": ["opaque-server-owned-handle"]
}
```

Unknown fields fail closed. `Idempotency-Key` is required as a header on create. Recovery carries its exact `wfi_...` idempotency key inside the fixed recovery body. IDs, input handles, artifact references, and receipt references are opaque public values; callers must not derive local paths from them.

## Body and metadata placement

Raw input bytes and generated report bodies live only under:

```text
_workspaces/system/dev-erp/workflow-jobs/**
```

The server selects every path from a fixed role map. It pins the real storage root, rejects symlink/root retargeting, writes with exclusive creation, fsyncs, checks hard-link count, re-reads, hashes, and verifies bytes before issuing an opaque handle. Artifact sets are staged and atomically renamed before metadata publication.

The raw, uncompressed aggregate input maximum is 393,216 bytes. At most one `source` and one `draft` may be resolved because the core contract forbids duplicate input roles; `final_polish` requires the draft and permits the source, while `full_authoring` requires the source. Text and JSON bodies are decoded with fatal UTF-8 validation, and any non-UTF-8 charset declaration is rejected. The same aggregate bound applies to the output artifact set. `Content-Encoding` other than `identity` is rejected. Compression does not buy additional capacity.

SQLite stores metadata only: account/project ownership, hashes, byte counts, media types, opaque references, fixed request enums, state transitions, pass-boundary receipts, recovery receipts, and artifact metadata. It must never store an input body, report body, prompt, mail body, or attachment. Foreign keys are enabled on every connection and checked after schema initialization.

The canonical workflow receipt is metadata, not a report body. Before persistence, the orchestrator calls the actual shared-runner receipt validator and rechecks the exact job, request digest, bundle digest, result digest, input refs, and output refs against the core prepared execution. Its exact canonical JSON-plus-newline bytes are then written by a separate required receipt sink under `_workmeta/<project_code>/runs/<job_id>/workflow_receipt.json`. The sink derives `_workmeta` only from the exact repository root, rejects body-like fields, pins the real root, uses an exclusive no-replace commit, and returns only an opaque pointer and hash to the ERP database. The deployment remains disabled when that companion sink or actual-probe dependency is not configured and attested.

## State and concurrency

The public state machine is monotonic and transition rows are append-only. Mutations use expected status/phase/attempt predicates so stale writers fail rather than overwrite newer state. Input handles are single-consume and account/project-bound. Create idempotency compares the canonical request hash; replay of the same key and same request returns the original job, while a conflicting body fails.

Queued cancellation is supported. Running cancellation is intentionally unavailable until the worker exposes a tested abort contract. A normally returned core `blocked`, `failed`, or `interrupted` outcome is validated and converged to the same ERP terminal state instead of leaving an orphaned `running` row. Startup recovery converts any remaining orphaned running state into an explicit interrupted or manual-review state; it does not silently rerun authoring.

Recovery has one operation: `resume_receipt`. It may retry the durable receipt sink for an already committed artifact manifest. It must not invoke the author, verifier, shared workflow runner, or artifact generator. The recovery ledger is idempotent and immutable.

## Author/verifier and human-review requirements

The author and verifier must produce independent, role-bound pass receipts. Acceptance requires different process and context identifiers, different operation identifiers and PIDs, author termination before verifier start, and a verifier input hash equal to the author output hash. Both passes must declare:

- no skills or external instruction sources;
- no writable roots;
- read-only source access;
- network disabled;
- approval policy `never`.

The database and runtime request fix human review to `required`. The browser cannot weaken or replace it. A complete machine result is metadata-only until the separate human-review authority records its decision; this shell does not invent that authority.

## Single-writer runner flow

The callable candidate path has one owner for each body write:

1. The ERP orchestrator claims the queued job with CAS, issues two server-owned pass nonces, resolves the opaque input handles, and builds the fixed core request.
2. It calls the shared `runWorkflowJob` export exactly once through the fixed bridge; a browser cannot supply or replace any adapter.
3. The orchestrator binds input reads to the resolved handle bytes and binds the core artifact adapter to the ERP payload store. At the core pre-rename barrier it captures `prepared_execution.execution.result`, validates it with the actual core result validator, and persists that exact result and digest; ERP does not synthesize a replacement result.
4. The core receipt adapter validates the exact canonical receipt and digest chain, then writes its bytes once through the companion `_workmeta` sink. SQLite is not marked successful during the write.
5. The orchestrator validates the returned core outcome and requires `outcome.result`, `receipt.result_sha256`, the DB `result_sha256`, artifact refs, and receipt confirmation to form one exact digest chain. Only then does a final ERP CAS mark `succeeded`; `human_review_status` remains `required`.

The only report claim ceilings stored by this shell are the core values `observed`, `source_supported`, and `rejected_or_blocked`. The candidate harness uses the exact core local identity claim `local_context_separation_declared`; it does not represent local context separation as deployment-attested process separation.

The core artifact roles are used without semantic aliases: `report_document_json`, `final_report_md`, `final_report_html`, `protected_semantic_manifest`, `preservation_audit`, and `semantic_verification`. The fixed request always asks for Markdown and HTML. A filesystem commit that outruns its SQLite transaction is adopted only when its canonical manifest exactly matches the prewritten metadata journal; otherwise the job is blocked for manual review. No author or verifier is rerun during receipt recovery.

## Activation checklist

The capability endpoint may return `enabled: true` only when all of these are true at the same instant:

1. The explicit report-route flag is enabled.
2. The fixed shared runner import resolves to the exact exported entry point.
3. The pinned bundle digest and binding id exactly match the deployment attestation.
4. ERP and workflow-worker service identities match the attestation.
5. The pass-runner release and ACL probe are attested as passing.
6. Owner approval is present and the attestation has not expired.
7. A current semantic end-to-end evidence packet, including independent pass receipts, the shared-runner single-writer path, and receipt-only crash recovery, has passed the repository review gate.
8. A separately bound current actual runtime probe has passed. Environment variables and self-attestation JSON are not a substitute for this dependency.

If any check is missing or mismatched, upload and create return `503 report_workflow_unavailable`. There is no general runner import, local behavior copy, dynamic workflow choice, or chat fallback.

## Verification

Targeted validation:

```powershell
npm.cmd --prefix ui-workspace/apps/dev-erp run test:workflow-jobs
```

Full dev-ERP regression validation:

```powershell
npm.cmd --prefix ui-workspace/apps/dev-erp test
```

Production activation additionally requires the current deployment attestation and repository post-development review gate. Unit tests using injected runner/pass doubles prove shell behavior only; they are not production evidence.
