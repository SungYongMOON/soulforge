# Invocation examples

These examples demonstrate launcher routing only. They do not prescribe report
sections, wording, verdicts, or editorial structure. The workflow-owned references
under `.workflow/report_authoring_v0/references/` remain the sole editorial policy.

## Polish one existing draft

```text
Use $soulforge-report-writer in final_polish mode for this draft. Keep every fact,
number, qualifier, source, limit, and verdict unchanged. Produce Markdown and HTML
for a management reader.
```

Expected route: bind exactly one `draft_report`, skip optional-input questions,
coordinate a fresh author and separate verifier, then call the fixed runner.
All runner `--request`, `--config`, and `--input` values are absolute paths.

## Author from approved source material

```text
Use $soulforge-report-writer in full_authoring mode with these approved source
materials. Ask only if a missing decision-critical fact would change the report.
```

Expected route: complete material-gap intake one question at a time, bind the
approved source material, and use the same fixed author/verifier/finalize path.

## ERP boundary

ERP does not invoke this skill. It submits the same fixed workflow request directly
to the shared workflow runner and consumes only its bounded result and receipt
contract.
