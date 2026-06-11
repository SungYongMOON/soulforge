# 2026-06-11 Quality-Equivalence Calibration

Calibration `cal_20260611_rag_source_text_quality_review_quality_equiv_001`
ran the repo-local five-profile shortlist against a public-safe synthetic RAG
source-text quality-review fixture.

Selected primary profile:

- `gpt-5.4-mini|low|dwarf|auditor`
- candidate id: `A_mini_low_dwarf_auditor`
- quality score: `94`
- total tokens: `22279`
- reasoning output tokens: `23`
- wall time: `24.925s`

Outcome:

- Four candidates passed the exact-shape quality gate.
- `B_gpt54_low_dwarf_auditor` preserved the safety boundary but failed the
  exact page packet shape by using `classification` instead of the expected
  page-level `status` field.
- The workflow remains unregistered and not default-route-safe.

Boundary:

No source text payloads, copied chunks, excerpts, raw questions, raw answers,
NotebookLM answers, NotebookLM question or conversation ids, project/private
payloads, `_workspaces` content, secrets, credentials, or runtime absolute paths
were used or archived.
