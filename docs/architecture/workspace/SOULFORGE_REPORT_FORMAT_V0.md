# Soulforge Report Format v0

## Purpose

This document defines the default Soulforge report shape for owner-facing work.
It turns report material into a coordinated artifact set:

- a validated structured `ReportDocumentV1` authoring record;
- canonical reader-facing Markdown;
- optional standalone HTML for human review; and
- separate audit artifacts and a metadata-only receipt.

The HTML file is a derived human-review artifact. It does not become canon,
does not replace the Markdown record, and does not carry stronger authority
than the source record.

## Default Artifact Set

For a fixed report-authoring run, persist the structured record and Markdown.
Create HTML when requested. Keep reader deliverables separate from audit artifacts:

| Role | Format | Typical path |
| --- | --- | --- |
| Structured authoring record | `.json` | `_workspaces/<project_code>/reports/<job_id>/report_document.json` or approved worksite |
| Canonical reader record | `.md` | `_workspaces/<project_code>/reports/<job_id>/final_report.md` or approved worksite |
| Optional HTML companion | `.html` | `_workspaces/<project_code>/reports/<job_id>/final_report.html` or approved worksite |
| Audit artifacts | `.json` | `_workspaces/<project_code>/reports/<job_id>/{protected_semantic_manifest,preservation_audit,semantic_verification}.json` or approved worksite |
| Metadata-only receipt | `.json` | `_workmeta/<project_code>/runs/<job_id>/workflow_receipt.json` |
| Supporting charts/assets | `.png`, `.csv`, `.json`, etc. | `_workspaces/<project_code>/...` or owner-approved shared worksite |

Public-safe reusable examples belong under
`docs/architecture/workspace/examples/soulforge_report_format/`.

## Adaptive Document Roles

Section roles depend on report type and reader decision. Do not impose one
universal order or render empty decorative headings. The exact runtime matrix is
owned by `.workflow/report_authoring_v0/references/editorial_contract.md`.

| Report type | Minimum reader roles |
| --- | --- |
| Experiment/test | purpose; conditions/method; results; discussion/limits; bounded verdict; next actions |
| Analysis/trade | decision question/scope; method/assumptions; alternatives evidence; tradeoffs; recommendation/decision Ask |
| Progress | internal review: status; issues/risks/dependencies; next actions. Other audiences: status; baseline; milestones/actuals; issues/risks/dependencies; next actions |
| Presentation | title/context; body-derived BLUF/Ask; verified evidence; recommendation/next |
| Other | purpose; scope/evidence basis; findings; interpretation/limits; bounded conclusion/status; next action or explicit no-action state; traceability |

Criteria/weights, deliverables, forecast, support requests, minimum background,
and traceability sections are added only when the input supports distinct material
content. Omit an unsupported optional role instead of repeating another section,
inventing a placeholder, or expanding a short internal report mechanically.

An executive summary is required for management/customer/regulator audiences.
For `other`, it is also required above six sections and optional for the exact
six-role short internal form. Type-specific matrices may require a summary. It is
derived only after the body passes technical-content and evidence-logic review.
Every summary sentence must resolve to verified body claim IDs; the reader surface
does not expose those IDs.

The v0 structured contract assigns one role to each section and does not encode
combined-role sections. A verdict, recommendation, risk section, appendix, or
visual is included only when the report purpose and available evidence support it.

In the compact internal progress form, `status_summary` is a source-owned body
section rather than a derived executive summary. It can state scope, actual result,
and current decision status in one concise passage. Separate baseline or milestone
sections are added only for distinct comparison material; they must not repeat the
same inspection fact to satisfy structure.

Every protected unknown stated in the body must have a same-ID entry in
`unconfirmed_items` that records its decision impact and close condition. This
register is rendered as reader-facing unresolved work while its IDs remain on the
audit surface. A semantic verifier pass cannot waive the deterministic linkage.

The source record may still carry internal fields such as claim ceiling and
boundary status, but the owner-facing report surface should use report terms
such as `판정 범위`, `적용 범위`, `출처 및 추적성`, `고려사항`, and `문서 관리`.

## Owner-Facing Technical Report Surface

Soulforge report material for a team or customer-facing technical context should
use concise, evidence-bound language:

- use complete sentences for reasoning; noun-phrase endings are optional for
  headings, cards, and compact checklist bullets;
- state how a value, table, or graph is used, not only what it is not;
- keep conditions, qualifiers, numbers, units, uncertainty, attribution, and
  evidence status attached to the statement they bound;
- name the actor when responsibility, provenance, or assurance matters.

The workflow judges function and meaning, not individual vocabulary. There is no
forbidden-word list, AI-detector score, detector-evasion target, or mandatory
active/passive voice. The following are contextual examples, not banned phrases:

| Avoid on report surface | Prefer on report surface |
| --- | --- |
| `음향 군지연은 아니다` | `전기 포트 기준 지연성 지표로 산출하며 음향 전달 결과와 대조하는 진단 그래프로 활용한다` |
| `edge 구간은 쓰면 안 된다` | `edge 구간은 sweep edge 및 계측 조건 영향 구간으로 분류하고 후속 시험에서 재확인한다` |
| `claim ceiling` | `판정 범위` |
| `Boundary Note` | `문서 관리` |

The HTML companion should render the same reader-facing information with:

- a visible banner that says `HTML companion - canonical record remains the
  Markdown/structured text file`;
- title block with project, date, report id, 판정 범위, and canonical record
  ref;
- verdict cards for the main conclusion, applicable scope, and follow-up
  confirmation scope;
- evidence and next-action tables when the corresponding source/action data exists;
- print-friendly CSS and no remote assets by default.

## Storage Rules

- Do not place source payloads, Office/PDF/HWP/HWPX originals, mail bodies,
  archives, raw attachment content, cookies, tokens, or passwords in either
  report artifact.
- Store original/reference files, report bodies, structured authoring records,
  generated report pairs, and audit artifacts in `_workspaces/<project_code>/...`,
  `_workspaces/system/...`, or an owner-approved shared worksite.
- Store only receipt metadata in `_workmeta`: opaque pointers, hashes, sizes,
  media types, workflow/binding digest, status, validator counts, provenance,
  timestamps, and stop/error codes. Do not store report/source bodies, excerpts,
  generated files, or reviewer working notes there.
- ERP databases keep job state and the same bounded metadata only. ERP calls the
  workflow/runner directly, not the launcher skill.
- Public repo report templates must be public-safe and synthetic. They must not
  include host-local absolute paths or private project payload.

## HTML Style Contract

Soulforge HTML report companions should use a quiet engineering-report style:

- constrained page width and print-friendly margins;
- dark text on light background;
- restrained status colors for `accepted`, `limited`, `blocked`, and `risk`;
- tables for evidence and action items;
- callouts for assumptions and boundaries;
- no external fonts, scripts, analytics, or remote images;
- optional local-only JavaScript only for harmless table filtering or copy
  controls.

## Minimal HTML Template Fields

Every HTML report companion should expose these metadata fields when the value is
source-owned. `report_date` is nullable; omit the complete date row when it is
unknown rather than rendering `null` or inventing a date.

```text
report_id
project_code
report_title
report_date
canonical_record_ref
html_status = derived_human_review_artifact
claim_ceiling  # internal/source record; surface as 판정 범위 when owner-facing
source_boundary
```

The current v0 workflow adopts `private_work_product` only because it has no
trusted classification authority. Draft-only `final_polish` is capped at
`claim_ceiling: observed` and `source_record_status: partial|unconfirmed`.
`public_safe` classification requires a future verified owner-contract
classification lane. A draft-only run may claim `complete` only after a future
verified source lane is added.

## Completion Criteria

A Soulforge fixed-run report set is complete when:

- validated `ReportDocumentV1` and canonical Markdown exist in an approved
  artifact worksite;
- requested HTML exists, or HTML was not requested;
- when present, the HTML companion visibly points back to the canonical
  Markdown/structured record;
- private/raw/secret boundaries are preserved;
- reader deliverables contain no workflow/audit scaffolding while audit artifacts
  remain separately addressable;
- claim ceiling and reader-relevant unresolved gaps are visible;
- the metadata-only receipt is confirmed before success is reported.
