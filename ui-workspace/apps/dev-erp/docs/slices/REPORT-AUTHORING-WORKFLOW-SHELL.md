# Report authoring workflow shell

Status: candidate / default off

Owner split: dev-ERP metadata shell + Soulforge `report_authoring_v0` body

Production/live attestation: incomplete

## Slice

This slice exposes one fixed ERP job surface for `report_authoring_v0`. It is not a generic workflow, prompt, model, skill, agent, or filesystem launcher. Existing worklog/report draft routes and chat v6/v1 remain unchanged.

The browser may upload bounded raw inputs, create a fixed `full_authoring` or `final_polish` job, inspect metadata-only state/results, cancel a queued job, read ACL-approved artifacts by canonical role, and request receipt-only recovery. `final_polish` accepts exactly one draft plus at most one optional source; `full_authoring` accepts exactly one source. Text/JSON is fatal-UTF-8 only, non-UTF-8 charset declarations fail closed, and the aggregate raw, uncompressed input maximum is 393,216 bytes.

## Ownership

- Input and report artifact bodies: `_workspaces/system/dev-erp/workflow-jobs/**`
- Canonical metadata receipt: `_workmeta/<project_code>/runs/<job_id>/workflow_receipt.json`
- ERP database: account/project bindings, hashes, sizes, media types, opaque pointers, state/CAS transitions, pass receipts, artifact metadata, and recovery metadata only

The receipt sink accepts only canonical metadata JSON and rejects body-like fields. Neither report bodies nor source bodies are stored in SQLite or `_workmeta`.

## Fixed runner path

The only runner import is `../../../../guild_hall/workflow_runner/index.mjs`, exact export `runWorkflowJob`. The ERP orchestrator calls it once, binds full input-ref objects to server-owned handles, records separate author/verifier receipts against server-issued nonces, captures and validates the exact core prepared result before the artifact rename, writes the canonical artifact set once, validates and writes the canonical receipt once through the companion `_workmeta` sink, and accepts success only after the returned outcome/result/receipt/DB digest chain passes and a final DB CAS completes with human review still `required`. Normally returned `blocked`, `failed`, and `interrupted` outcomes also converge to ERP terminal state.

The public/core vocabulary is identical for report type, audience, binding, boundary policy, acceptance profile, artifact roles, claim ceilings (`observed|source_supported|rejected_or_blocked`), and the local identity claim `local_context_separation_declared`. Only two mechanical input mappings exist at the internal boundary: `source` → `source_material`, `draft` → `draft_report`; UTF-8 text upload media types are canonicalized to the core media types. Unknown values fail closed.

## Activation state

The server capability is always false in this slice because no production actual-probe dependency is bound. It reports blockers without secrets. A route flag or environment self-attestation alone cannot enable it. Activation additionally needs the fixed shared runner to be present, exact bundle and deployment-attestation hashes, distinct ERP/worker identities, a configured companion receipt sink, an attested worker adapter release, passing ACL and actual runtime probes, owner approval, expiry validation, real shared-runner integration evidence, and the repository review gate.

Synthetic adapter tests are evidence for shell call order and single-writer behavior only. They are not production/live evidence.

## Validation

```powershell
npm.cmd --prefix ui-workspace/apps/dev-erp run test:workflow-jobs
npm.cmd --prefix ui-workspace/apps/dev-erp test
```

Detailed security, persistence, API, recovery, and activation contracts are documented in `docs/architecture/ui/DEV_ERP_REPORT_WORKFLOW_SHELL_V1.md` at the repository root.
