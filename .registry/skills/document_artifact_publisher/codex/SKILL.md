---
name: soulforge-document-artifact-publisher
description: "Use when Codex should publish a workflow-approved strict content packet through Soulforge as editable DOCX, XLSX, and/or self-contained HTML under one shared design-token system, with native-format QA and metadata-only receipts."
---

# Soulforge Document Artifact Publisher

Use this skill only as a thin launcher for
`.workflow/document_artifact_publisher_v0`.

The workflow owns packet and token contracts, native adapter policy, artifact
QA, and stop conditions. Do not re-create those procedures here.

## Operating steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Resolve `$soulforge-document-artifact-publisher` to
   `document_artifact_publisher_v0` and verify it is registered in
   `.workflow/index.yaml`. Stop if it is missing or unregistered.
3. Read the workflow's `workflow.yaml`, `step_graph.yaml`, and
   `profile_policy.yaml`. Load contracts, templates, handoff rules, role slots,
   or calibration evidence only when the current run requires them.
4. Validate the request against the workflow-owned request template. Require
   immutable workflow identity, approved or declared-synthetic packet identity,
   schema identity, token identity, requested outputs, `_workspaces` output
   refs, `_workmeta` receipt ref, and idempotency key. Do not infer gaps.
5. Run the workflow-owned deterministic packet validator before publication.
   If facts, refs, verdicts, table types, output formats, or storage boundaries
   fail, stop and return the workflow blocker.
6. Resolve current runtime bindings by requested output:
   - DOCX: installed Documents skill and its full render/inspection contract.
   - XLSX: installed Spreadsheets skill plus loader-provided
     `@oai/artifact-tool` only.
   - HTML: local escaped, self-contained semantic renderer with zero remote
     dependencies.
   Stop when a required capability is unavailable. Do not install or substitute
   dependencies automatically.
7. Execute only requested native formats from the same validated packet. Do not
   convert one output format into another or alter the approved content for fit.
8. Write artifacts and render-review payloads only under allowed `_workspaces`
   paths. Keep `_workmeta` limited to portable pointers, hashes, sizes,
   versions, statuses, blocker codes, and workflow-owned receipts.
9. Return the workflow-owned contract, adapter, self-check,
   independent-verification, and boundary receipts. Do not claim a stronger run
   state than those receipts support.

## Boundary rules

- Do not author, summarize, final-polish, translate, or fact-check report content.
- Route missing report content or personal-voice work back to `report_authoring_v0`.
- Do not change facts, numbers, units, dates, signs, IDs, comparisons, negation,
  warnings, omissions, tables, evidence refs, or verdicts.
- Do not create PPT or PPTX.
- Do not search for, fetch, package, or infer remote templates or external assets.
- Do not use openpyxl, XlsxWriter, pandas ExcelWriter, SheetJS, or another XLSX
  library as an automatic fallback.
- Do not replace editable native artifacts with screenshots, flattened images,
  or PDF-only deliverables.
- Do not store document bodies, Office/HTML payloads, PDFs, screenshots, or
  rendered images in `_workmeta`.
- Do not copy workflow steps, profile values, project payloads, private evidence,
  runtime absolute paths, or secrets into this launcher package.
- Do not claim default-route safety, team-default promotion, unattended
  authority, production readiness, or owner approval without separate evidence.

## Load on demand

Read [`references/mapping.md`](references/mapping.md) for runtime linkage,
semantic bindings, native backend mapping, receipt expectations, storage
boundaries, and the validation checklist.
