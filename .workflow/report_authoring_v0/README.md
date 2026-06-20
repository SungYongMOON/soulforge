# Report Authoring v0

Workflow for turning experiment/test/analysis/progress results into a
conclusion-driven Soulforge report or briefing — so reports stop being data dumps
that draw "이 실험 왜 했어요 / 그래서요".

It interviews the author grill-style to fill the missing So-What pieces
(왜/뭘/뭘얻/그래서/다음), drafts by report type with practitioner register, runs a
separate de-slop pass (bans ungrounded hedging only, keeps grounded judgment),
and closes with a self-check and boundary review.

## Status

- Workflow status: active
- Registration: registered in `.workflow/index.yaml` (owner-requested, built via workflow-generator + workflow-check)
- Short invocation alias: `/report-writer`
- Default route: no
- Output state: pilot-executed (fresh-context evaluator/judge scenarios; no model-cost calibration)
- Claim ceiling: structure + fresh-eval pilot; not production-ready, not canon-promoted

## Doctrine and structure (not duplicated here)

- Writing doctrine (scaffold, register, conditioned de-slop, type spines): `docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md`
- Report structure (sections, MD + HTML companion pair, storage boundary): `docs/architecture/workspace/SOULFORGE_REPORT_FORMAT_V0.md`
- Interview question bank, scaffold quick-card, filled examples: `.registry/skills/report_writer/codex/references/`

## Core rules

- Conclusion-first: the report answers 왜/그래서/다음, with a one-sentence overall verdict and a recommendation that maps to a decision.
- The workflow never invents facts, numbers, or verdicts. Missing values are marked 미확인. An overall pass/fail verdict requires a named spec or source.
- De-slop runs as a separate pass and keeps grounded judgment verbs and explicit 미확인 labels.
- Public files use Soulforge-root-relative POSIX paths and carry no private payload, secrets, or runtime absolute paths.

## Invocation

Use `/report-writer` as the short alias. The resolver target is the canonical
workflow id `report_authoring_v0`. The launcher skill `report_writer`
(`soulforge-report-writer`) resolves to this workflow and reads `workflow.yaml`,
`step_graph.yaml`, the guide, and the interview reference at runtime.
