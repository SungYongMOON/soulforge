# Presentation Publisher Skill

This package is the thin Codex launcher for
`.workflow/presentation_artifact_render_v0`.

It resolves `$soulforge-presentation-publisher`, validates the workflow-owned
input packet, executes the workflow through current runtime bindings, and
returns workflow-owned artifact, render-QA, and boundary receipts.

## Boundary

The launcher does not write, summarize, rewrite, or fact-check presentation
content. It does not select, approve, or implement templates. Exact request and
receipt schemas, template binding, rendering behavior, QA criteria, and stop
conditions remain owned by the workflow.

Approved content and the template reference, family, revision, and SHA-256 must
be bound before execution. Editable PPTX payloads belong in `_workspaces` or an
owner-approved shared worksite. `_workmeta` stores pointers, hashes, statuses,
and QA receipts only.

Codex runtime may use the installed Presentations skill as an execution backend
for editable PPTX generation and render QA when the workflow and runtime binding
allow it.

## Installed Name

After skill sync, the Codex-facing name is:

```text
soulforge-presentation-publisher
```

## Status

The package remains `candidate`, but its first-build gate passed against one
synthetic fixture: deterministic skill/canon validation, a fresh workflow
executor, and a separate fresh verifier all completed. The target workflow is
registered as a non-default single-synthetic-pilot candidate.

This evidence does not authorize default routing or production use. A missing
or unregistered workflow is still a stop condition, not permission for the
launcher to invent a workflow.
