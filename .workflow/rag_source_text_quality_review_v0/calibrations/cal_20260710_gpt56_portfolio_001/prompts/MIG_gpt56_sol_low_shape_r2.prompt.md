Calibration replay metadata: candidate_id=MIG_gpt56_sol_low_shape_r2; model=gpt-5.6-sol; reasoning_effort=low.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
# Public-Safe Candidate Prompt

You are a candidate runner for Soulforge workflow
`rag_source_text_quality_review_v0`.

Use only the candidate profile header, this prompt, and the synthetic fixture
provided below. Do not run shell commands, browse, read repository files, inspect
`_workspaces`, inspect `_workmeta`, inspect private-state, or use external
context. Do not include source text, copied chunks, excerpts, raw questions, raw
answers, NotebookLM answers, NotebookLM question ids, NotebookLM conversation
ids, private project payloads, secrets, credentials, or runtime absolute paths.

Task: produce a payload-free synthetic workflow output packet that follows the
workflow contract:

- Bind the quality review scope.
- Inventory the source-text index by refs, hashes, counts, labels, and lifecycle
  metadata only.
- Inventory traceability sidecar mappings by refs and warning labels only.
- Inventory answer-run traces by claim, citation, retrieval, page, source, and
  trace refs only.
- Classify each page-linked claim as `source_supported`, `manual_review`, or
  `blocked`.
- Close with a boundary review note and downstream route hints.

Classification rules:

- `source_supported` requires matching approved source refs, page index refs,
  sidecar refs, and a claim ceiling that is not blocked.
- Table, picture, or OCR uncertainty routes to `manual_review` with warning
  categories.
- Missing sidecar mapping, missing page identity, mixed source outside approved
  scope, stale index/sidecar refs, or blocked claim ceiling routes to `blocked`.
- This workflow reviews support traces only. It does not prove source truth,
  answer correctness, owner approval, canon readiness, registration, or default
  route safety.

Return only YAML. Use this top-level shape:

```yaml
profile:
  candidate_id:
  model:
  reasoning_effort:
  species:
  class:
quality_review_scope_binding:
source_text_index_inventory:
traceability_sidecar_inventory:
answer_run_trace_inventory:
page_quality_review_packet:
boundary_review_note:
completion_state:
```

Keep the output concise but directly usable. Include all five synthetic page
refs and all five synthetic claim refs.
