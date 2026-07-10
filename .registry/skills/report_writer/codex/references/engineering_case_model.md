# Engineering Case Model and dual projection

Use this reference only for the engineering dual-projection mode of
`report_authoring_v0`. The writing doctrine remains
`docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md`, and the
report structure remains `SOULFORGE_REPORT_FORMAT_V0.md`. This file is an
operational schema guide, not a second doctrine owner.

## Scope

Freeze one `soulforge.engineering_case_model.v0` JSON object after intake,
gap interview, and a separate de-slop review of its text fields. Render both:

- `report.md`: conclusion-first engineering report content;
- `ppt_storyline.md`: PPT content storyline, not a binary `.pptx` file.

The renderer also writes structured report/PPT projections and a redacted
consistency report. Binary DOCX/PPTX creation and layout verification remain
outside this mode.

## Owner surfaces

- Input schema: `.workflow/report_authoring_v0/templates/engineering_case_model.schema.json`
- Deterministic renderer: `../scripts/render_engineering_case.mjs`
- Doctrine: `docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md`
- Structure: `docs/architecture/workspace/SOULFORGE_REPORT_FORMAT_V0.md`
- Public-safe examples:
  - `engineering_case_model.experiment.example.json`
  - `engineering_case_model.trade_study.example.json`

## Freeze contract

Require a non-empty `revision`. The renderer canonicalizes the JSON object and
records its SHA-256 identity in both projections and the consistency report.
Do not create report-only or PPT-only case prose after freeze. If facts or
wording must change, update the Case Model, increment its revision, and render
both projections again.

The Case Model carries:

- decision request, statement, verdict, and source/basis ref;
- evidence IDs with signed value, unit, comparator, basis, range, tolerance,
  sample size, uncertainty, and source ref;
- stable terminology IDs;
- evidence-strength judgments and their source refs;
- confirmed/unconfirmed limitations with close conditions;
- actions with owner and due value;
- captions and Markdown alt text;
- ordered PPT slide roles, titles, exactly one judgment ID per slide, and explicit
  title-binding terms present in both the title and its bound judgment;
- explicit anonymization mappings;
- optional trade-study structure.

Unknown values remain `unconfirmed` or the literal owner-provided equivalent.
Do not turn them into confirmed values in either projection.

## B+C+D register

Use the common order:

```text
판정·요청 -> 핵심 근거 수치 -> 상세 본문 -> 한계·미확정 -> 다음 조치
```

Within the detailed body, repeat:

```text
현황·수치 -> 문제점·판정 -> 개선방향·조치
```

Use the evidence-strength ending that matches each `judgments[].strength`:

| strength | accepted body ending |
| --- | --- |
| `confirmed_fact` | `확인되었다`, `확인됨`, `확인` |
| `analysis_result` | `분석되었다`, `나타났다` |
| `sourced_judgment` | `판단된다` |
| `bounded_tentative` | `볼 수 있다`, `어려울 수 있다` |
| `exceptional_softening` | `사료된다` (at most once) |

Reject copular `-임` endings. Lexical nouns such as `움직임`, `흔들림`,
`책임`, and `모임` remain valid.

## PPT storyline

Use the ordered roles below. `alternatives` is required for trade studies and
omitted for other report types.

```text
decision -> impact -> core_evidence -> alternatives? -> recommendation -> risk_execution
```

Provide each title in the Case Model and bind it to one `judgment_id`. Add one
or more `title_binding_terms` that occur in both the title and the bound
decision/judgment. The renderer rejects a missing term, checks role order, emits
only the linked judgment as the slide's substantive judgment, and requires
`core_evidence` no later than the midpoint. A separate fresh verifier still
judges whether each title is a real conclusion sentence and whether supporting
detail stays subordinate to that one judgment.

## Trade-study contract

Use `weighted_sum_0_to_100` only in v0. The criteria weights must total 100,
and every alternative must have one 0-to-100 score for every criterion. The
renderer recomputes weighted totals and rejects a mismatching declared total.

Set `recommendation_authorized_by_model: true` and name the recommended
alternative, rationale, and residual risk. The renderer never infers a
recommendation merely because one computed total is highest.

## Anonymization contract

Supply mappings explicitly with stable IDs and a category of `client`,
`person`, or `company`. The renderer does not infer identities or replacement
terms. It scans report text, PPT text, captions, alt text, and structured
projections for the original labels. The consistency report exposes mapping IDs,
categories, and counts only; it never repeats original labels.

If a required category has no mapping, stop. If the owner cannot provide the
mapping, keep the output internal or mark the release blocked.

## Deterministic command

```text
node .registry/skills/report_writer/codex/scripts/render_engineering_case.mjs --input <case_model.json> --out <output_dir>
```

The command writes:

- `report.md`
- `ppt_storyline.md`
- `report_projection.json`
- `ppt_projection.json`
- `consistency_report.json`

It fails closed on schema/relationship defects, model/projection drift,
untraceable numeric tokens (including declared Korean count/score/currency/time
units), `-임`, trade-study arithmetic, storyline ordering/title binding, or
anonymization leakage. The consistency report claims deterministic mechanical
integrity only; fresh semantic verification remains required. When `--out` is
known, a redacted fail report is still written.
