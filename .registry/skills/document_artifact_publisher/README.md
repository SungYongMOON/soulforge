# Document Artifact Publisher Skill

This package is the thin Codex launcher for
`.workflow/document_artifact_publisher_v0`.

It resolves `$soulforge-document-artifact-publisher`, validates the
workflow-owned request, executes requested native DOCX, XLSX, and/or HTML lanes
through current runtime bindings, and returns workflow-owned validation and
boundary receipts.

## Boundary

The launcher does not author, summarize, polish, translate, or fact-check
report content. It does not download or choose templates or assets. Exact packet
and token contracts, adapter policy, QA criteria, and stop conditions remain
owned by the workflow.

Actual artifacts and render-review assets belong in `_workspaces`.
`_workmeta` stores portable pointers, hashes, sizes, versions, statuses, blocker
codes, and receipts only. PPT and PPTX are outside this launcher.

## Installed name

After skill sync, the Codex-facing name is:

```text
soulforge-document-artifact-publisher
```

## Status

The package is a registered non-default candidate. DOCX and HTML synthetic
adapter receipts pass. XLSX passed semantic, formula, round-trip, and all-sheet
visual checks, but its current receipt is `blocked_print_configuration` because
OOXML `pageSetup` and `Print_Area` are missing. Artifact-tool-only XLSX
correction, a fresh end-to-end workflow replay, Microsoft Word/Excel round-trip
on an owner sample, three representative real reports, and explicit owner
acceptance remain required before stronger claims.
