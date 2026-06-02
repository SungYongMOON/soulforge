# Soulforge Report Format v0

## Purpose

This document defines the default Soulforge report shape for owner-facing work.
It turns report material into two coordinated artifacts:

- a canonical Markdown or structured-text record for diffing, reuse, and agent
  context;
- a standalone HTML companion for human review.

The HTML file is a derived human-review artifact. It does not become canon,
does not replace the Markdown record, and does not carry stronger authority
than the source record.

## Default Artifact Pair

For each report material task, create this pair unless the task is explicitly
text-only, too small to be report material, or blocked by an unsafe boundary:

| Role | Format | Typical path |
| --- | --- | --- |
| Canonical record | `.md`, `.yaml`, or `.json` | `_workmeta/<project_code>/reports/<lane>/<yyyymmdd>_<slug>.md` |
| HTML companion | `.html` | `_workmeta/<project_code>/reports/<lane>/<yyyymmdd>_<slug>.html` |
| Supporting charts/assets | `.png`, `.csv`, `.json`, etc. | `_workspaces/<project_code>/...` or owner-approved shared worksite |

Public-safe reusable examples belong under
`docs/architecture/workspace/examples/soulforge_report_format/`.

## Required Sections

The canonical Markdown report should contain these sections when applicable:

1. `Report Header`: project code, title, date, authoring surface, claim
   ceiling, source record status.
2. `Executive Summary`: three to seven owner-readable bullets.
3. `Decision / Conclusion`: what can be used now and what cannot.
4. `Evidence Map`: source refs, computed artifacts, and pointer-only asset
   refs.
5. `Method`: equations, processing steps, assumptions, and exclusions.
6. `Findings`: compact tables and bounded observations.
7. `Risks / Gaps`: missing source, calibration, owner decision, or validation
   limits.
8. `Next Actions`: concrete follow-up items.
9. `Boundary Note`: public/private/raw/secret handling and claim ceiling.

For experiment reports, test reports, and technical review material, prefer the
owner-facing spine below over generic advisory prose:

1. `시험 목적`
2. `시험 조건`
3. `요청/검토 항목`
4. `검토 결과`
5. `고려사항`
6. `후속 조치`

The source record may still carry internal fields such as claim ceiling and
boundary status, but the owner-facing report surface should use report terms
such as `판정 범위`, `적용 범위`, `출처 및 추적성`, `고려사항`, and `문서 관리`.

## Owner-Facing Technical Report Tone

Soulforge report material for a team or customer-facing technical context should
use concise test-report language:

- prefer nouns and result verbs such as `확인`, `검증`, `산출`, `식별`,
  `분류`, `비교`, `보강`, `재확인`, and `반영`;
- state how a value, table, or graph is used, not only what it is not;
- convert defensive wording into constructive report wording.

Examples:

| Avoid on report surface | Prefer on report surface |
| --- | --- |
| `음향 군지연은 아니다` | `전기 포트 기준 지연성 지표로 산출하며 음향 전달 결과와 대조하는 진단 그래프로 활용한다` |
| `edge 구간은 쓰면 안 된다` | `edge 구간은 sweep edge 및 계측 조건 영향 구간으로 분류하고 후속 시험에서 재확인한다` |
| `claim ceiling` | `판정 범위` |
| `Boundary Note` | `문서 관리` |

The HTML companion should render the same information with:

- a visible banner that says `HTML companion - canonical record remains the
  Markdown/structured text file`;
- title block with project, date, report id, 판정 범위, and canonical record
  ref;
- verdict cards for the main conclusion, applicable scope, and follow-up
  confirmation scope;
- evidence and next-action tables;
- print-friendly CSS and no remote assets by default.

## Storage Rules

- Do not place source payloads, Office/PDF/HWP/HWPX originals, mail bodies,
  archives, raw attachment content, cookies, tokens, or passwords in either
  report artifact.
- Store original/reference files and generated analysis assets in
  `_workspaces/<project_code>/...` or an owner-approved shared worksite.
- Store source refs, hashes, file sizes, claim ceilings, and summarized
  findings in `_workmeta/<project_code>/reports/**`.
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

Every HTML report companion should expose these metadata fields:

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

## Completion Criteria

A Soulforge report pair is complete when:

- the source-of-truth record exists and is easier to diff than the HTML;
- the HTML companion exists or the skip reason is recorded;
- the HTML companion visibly points back to the source record;
- private/raw/secret boundaries are preserved;
- claim ceiling and unresolved gaps are visible;
- supporting assets are pointer-only unless they are generated summaries or
  public-safe examples.
