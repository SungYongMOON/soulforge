# document_artifact_publisher_v0

`document_artifact_publisher_v0` is the registered non-default candidate that
publishes one approved `team_document_content_packet.v0` as editable DOCX,
XLSX, and/or self-contained HTML through format-native adapters.

The workflow is downstream of `report_authoring_v0`. It does not write or
polish report content, decide facts, or own a personal voice profile. It
validates the approved packet and shared design-token identity, dispatches only
requested formats, verifies native editability and semantic parity, and writes
a metadata-only receipt.

## Canon contracts

- `contracts/team_document_content_packet.schema.json`: portable strict packet
  schema. Actual payload output pointers must be Soulforge-root-relative
  `_workspaces/...` paths.
- `contracts/team_document_design_tokens.yaml`: shared semantic design tokens
  for DOCX, XLSX, and HTML. Semantic parity is required; pixel identity is not.
- `tools/validate_document_packet.mjs`: dependency-free deterministic packet,
  cross-reference, verdict, table, token, output-format, and boundary validator.

The public synthetic fixture is under
`docs/architecture/workspace/examples/document_artifact_publisher/`. It has no
private source body, external asset, secret, or host-specific absolute path.

## Format boundary

- DOCX uses the installed Documents capability and must preserve editable Word
  styles, numbering, tables, headers, footers, and all-page render evidence.
- XLSX uses the installed Spreadsheets capability with loader-provided
  `@oai/artifact-tool` only. Values, formulas, tables, and charts remain native,
  and every sheet is inspected and rendered.
- HTML uses an escaped self-contained semantic renderer with zero remote
  dependencies and desktop, narrow, and all-print-page review.
- PPT and PPTX are not supported by this workflow.

No format is converted from another format. Every output is a sibling rendering
of the same validated packet and token contract.

## Storage and status

DOCX, XLSX, HTML, PDFs, screenshots, and rendered review assets belong under
`_workspaces`. `_workmeta` receives only portable pointers, hashes, sizes,
versions, statuses, blocker codes, and receipts.

The package is registered because the owner explicitly requested its creation,
but it is not a default route. DOCX and HTML have complete synthetic adapter
receipts. XLSX passed semantic, formula, round-trip, and all-sheet visual checks,
but independent verification found missing OOXML `pageSetup` and `Print_Area`,
so its current receipt is `blocked_print_configuration`. A fresh end-to-end
workflow replay, Microsoft Word/Excel round-trip on an owner sample, three
representative real-report pilots, and explicit owner acceptance remain required
before stronger readiness claims.
