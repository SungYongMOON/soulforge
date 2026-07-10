---
name: soulforge-report-writer
description: "Use as a thin launcher for the Soulforge report authoring workflow when a teammate has measurement data or a draft but the report/briefing has no conclusion, when turning experiment/test/analysis/progress results into a report, or when one frozen Engineering Case Model must produce a consistent report and PPT storyline with trade-study and anonymization checks. Resolves /report-writer to .workflow/report_authoring_v0, which fills missing So-What pieces, applies the B+C+D engineering register with copular -임 forbidden, renders and verifies dual projections when requested, runs a separate de-slop pass, and self-checks. Style/structure only — facts, numbers, verdicts, and anonymization mappings stay owner/source; never invents values."
---

# Soulforge Report Writer

Thin launcher for `.workflow/report_authoring_v0`. The workflow owns the procedure;
this skill maps the invocation and carries the interview/scaffold/examples references
the workflow consumes. Do not re-create the workflow body here.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Resolve `$soulforge-report-writer` or `/report-writer` to `.workflow/report_authoring_v0`.
3. Read `.workflow/report_authoring_v0/workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
4. Read `docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md` (doctrine) and `SOULFORGE_REPORT_FORMAT_V0.md` (structure) before drafting.
5. Mode: if input is measurement data/draft with no conclusion, or So-What ①왜/④그래서/⑤다음 are missing, run the workflow's interview step with [`references/interview.md`](references/interview.md) — one question at a time. If information is complete, go direct_draft.
6. Map facts to the So-What scaffold; expand into the report type spine (실험/분석/진도/평가/의사결정·trade-study/발표) using the register rules. Never invent facts, numbers, or verdicts; missing values stay "미확인".
7. For a single report, continue through the existing separate de-slop and self-check path. For an engineering report + PPT-storyline pair, read [`references/engineering_case_model.md`](references/engineering_case_model.md), de-slop the Case Model text as a separate pass, freeze its revision, then run `scripts/render_engineering_case.mjs` so both projections carry the same model SHA-256 and consistency report.
8. Self-check (왜/그래서/다음 answered, 종합 판정 1문장, 권고→의사결정, no data dump, no fabrication, deliverable-only output). In dual mode also require zero model→report, model→PPT, and cross-projection mismatches; explicit title-binding terms and one substantive judgment per slide; explicit anonymization mappings; zero forbidden copular `-임`; and a passing numeric signature report. Treat that pass as mechanical integrity only and obtain a separate fresh semantic verdict before a production-ready claim.
9. Close with the boundary review.

## Boundary Rules

- 출력은 산출물만. 첫 줄부터 산출물이어야 하며 작업 메모/사고 과정/모드 판단을 보고문·발표에 넣지 않는다. 발표자료에는 ①②③ 골격 라벨을 그대로 노출하지 말고 결론 헤드라인·근거·Ask 로 변환한다.
- 사실, 수치, 시험결과, 합부 판정을 만들어내지 않는다. 빈 곳은 "미확인" 또는 owner question. 종합 판정은 명명된 규격/source 가 있을 때만 단정한다.
- claim ceiling 을 실제 검증 수준 이상으로 올리지 않는다. production-ready/합격 단정은 source·review 근거가 있을 때만.
- 비공개 업무 원문, secret, runtime 절대경로를 산출물이나 public 파일에 넣지 않는다. 공개 예시는 합성만.
- 법정 별지/고객 양식이 강제되면 그 양식을 우선하고 골격은 내용 점검용으로만 쓴다.
- 익명화 대상과 대체어를 추측하지 않는다. 발주처·인명·회사명 치환은 owner가 Case Model에 명시한 mapping만 적용한다.
- engineering dual mode의 PPT 산출은 내용 스토리라인 Markdown이다. binary DOCX/PPTX 생성·레이아웃 검증은 이 스킬 범위가 아니다.
- 워크플로/가이드 변경은 `.workflow/post_development_review_gate_v0/` 로 닫는다.

## Load On Demand

- 대화형 빈칸 채우기 절차·질문 뱅크: [`references/interview.md`](references/interview.md)
- 골격·register 규칙·체크리스트·조건부 de-slop quick-card: [`references/scaffold_and_register.md`](references/scaffold_and_register.md)
- 타입별 채워진 예시 + 데이터덤프 Before/After: [`references/examples.md`](references/examples.md)
- Engineering Case Model·PPT·trade-study·익명화·일관성 검증: [`references/engineering_case_model.md`](references/engineering_case_model.md)
- 결정적 renderer: `scripts/render_engineering_case.mjs --input <case_model.json> --out <output_dir>`
- 워크플로 패키지: `.workflow/report_authoring_v0/` (workflow.yaml, step_graph.yaml, profile_policy.yaml)
- 전체 doctrine / 구조: `docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md`, `SOULFORGE_REPORT_FORMAT_V0.md`
