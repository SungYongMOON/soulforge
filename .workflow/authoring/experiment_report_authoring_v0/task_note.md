# Task Note

## Request

Create a public-safe draft workflow package for team experiment report authoring, and include the common experiment report outline inside the workflow as a reusable reference template.

## Chosen workflow_id

`experiment_report_authoring_v0`

## Human-facing names

- `display_name_ko`: `작성/보고서/실험결과/기술검토`
- `global_name_ko`: `작성_실험보고서_v0`

## Scope

The workflow authors project experiment, test, analysis, and technical review reports from approved source refs and analysis result refs.

It uses a common team outline as a reference template and preserves the Markdown or structured-text report as the reference report, with optional HTML review output for human review.

## Claim Ceiling

Allowed:

- report authoring scope
- source and result evidence map
- common experiment report outline application
- report-style core summary shaping
- report draft and HTML review plan
- limitations, gaps, and next actions

Not allowed:

- contract acceptance or final judgment
- customer or owner approval
- raw payload storage in public workflow material
- source truth promotion
- canon workflow registration

## Registration

This package is intentionally left in `.workflow/authoring/`. It does not update `.workflow/index.yaml`.
