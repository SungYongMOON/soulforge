# Document Artifact Publisher Launcher Mapping

## Canon linkage

- Canon skill id: `document_artifact_publisher`
- Codex installed skill: `soulforge-document-artifact-publisher`
- Source workflow id: `document_artifact_publisher_v0`
- Source workflow: `.workflow/document_artifact_publisher_v0/`
- Canon skill package: `.registry/skills/document_artifact_publisher/`
- Artifact payload owner: `_workspaces/<project_code>/...` or
  `_workspaces/SE_TEMPLATE_LIBRARY/...`
- Run-receipt owner: `_workmeta/<project_code>/runs/<run_id>/`

## Runtime resolution

When invoked:

1. Verify `document_artifact_publisher_v0` is present in
   `.workflow/index.yaml`.
2. Read `.workflow/document_artifact_publisher_v0/workflow.yaml`,
   `step_graph.yaml`, and `profile_policy.yaml`.
3. Load workflow-owned contracts, request/receipt templates, handoff rules,
   role slots, or calibration notes only when required by the current run.
4. Validate and execute using the workflow's current schema, token contract,
   and profile policy.
5. Return only the workflow-declared run state and receipts.

If the workflow is missing, unregistered, internally inconsistent, or lacks a
required contract, stop. The launcher must not synthesize a replacement
workflow, packet, design tokens, adapter policy, or receipt.

## Semantic input bindings

Use exact field names and validation rules declared by the workflow. Confirm:

- immutable workflow id, revision, and package ref
- approved-for-render or explicitly declared synthetic packet ref and SHA-256
- strict packet schema ref and SHA-256
- design-token ref, version, and SHA-256
- requested outputs limited to unique `docx`, `xlsx`, and/or `html` values
- output refs under `_workspaces`
- receipt ref under `_workmeta`
- idempotency key and project/item identity
- no authoring, rewrite, translation, or PPT/PPTX instruction

Missing values remain gaps. Do not derive approval from file presence or use the
latest-looking file as the accepted revision.

## Native backend mapping

The Codex runtime may use:

- installed Documents skill for editable DOCX generation, structural checks,
  and every-page render inspection;
- installed Spreadsheets skill with loader-provided `@oai/artifact-tool` for
  editable XLSX values, formulas, tables, charts, key-range inspection,
  formula-error scan, and every-sheet render inspection;
- a local escaped semantic HTML renderer for self-contained HTML, with network
  blocking plus desktop, narrow, and every-print-page inspection.

These are runtime bindings, not launcher authority. Do not copy their full
procedures into the launcher. If a capability is unavailable, use only a
fallback explicitly allowed by the workflow; otherwise stop. Never convert one
output format into another as the authoring path.

## Content and storage boundary

- `report_authoring_v0` or another approved content owner owns wording, facts,
  claims, omissions, verdicts, and final polish.
- `document_artifact_publisher_v0` owns strict input validation, native adapter
  dispatch, artifact QA, and metadata-only receipts.
- The launcher owns only workflow resolution, request validation, execution
  dispatch, and receipt return.
- DOCX, XLSX, HTML, PDFs, screenshots, and rendered review assets remain under
  `_workspaces`. `_workmeta` contains no body or payload.

## Receipt expectations

Return the exact receipts declared by the workflow. At minimum they expose:

- artifact format, portable pointer, size, and SHA-256
- workflow id, revision, and immutable package ref
- packet, schema, and token refs plus hashes and versions
- contract, adapter, structure, semantic-parity, visual, accessibility, and
  independent-verification statuses
- unresolved gaps, retry state, blocker codes, and next action
- public/private/raw/secret boundary result

## Validation checklist

- Target workflow is registered and required files were read.
- Current workflow request and contract files were used without launcher-local substitutions.
- Packet, schema, token, output, idempotency, and storage identities were present.
- Deterministic packet validation passed before adapter execution.
- Requested outputs contain no unsupported format or PPT/PPTX.
- Every artifact was produced natively from the same validated packet.
- DOCX, XLSX, and HTML runtime bindings followed the workflow profile policy.
- Required page, sheet, viewport, print, formula, and semantic checks ran.
- No payload or visible content was written to `_workmeta`.
- No report content, template decision, dependency install, or default-route authority was invented by the launcher.
- No readiness claim exceeded current receipts and owner gates.
