# Knowledge Ingest Cross-PC Mapping

## Soulforge Mapping

- Canon skill id: `knowledge_ingest_cross_pc`
- Installed Codex skill name after sync: `soulforge-knowledge-ingest-cross-pc`
- Primary target skill: `soulforge-knowledge-ingest-cell-launcher`
- Target party id: `knowledge_ingest_cell`
- Target party canon: `.party/knowledge_ingest_cell/`
- Target workflow: `knowledge_ingest_pipeline_v0`
- Source owner for workflow procedures and execution hints:
  `.workflow/knowledge_ingest_pipeline_v0/`
- Source owner for receipt and missing-audit command surface:
  `guild_hall/knowledge_access/`
- Source owner for cross-PC metadata evidence: `_workmeta/**`

## Start Sequence

1. Inventory:
   - public repo: `.`
   - project metadata repo: `_workmeta`
   - continuity state repo: `private-state`
2. Fetch/pull safe fast-forward updates for each repo with an origin remote.
3. If public repo changed, run `npm.cmd run skills:sync -- --all`.
4. Confirm installed mirror availability for:
   - `soulforge-knowledge-ingest-cross-pc`
   - `soulforge-knowledge-ingest-cell-launcher`

Block rather than improvise when a repo has dirty tracked changes, divergent
history, detached HEAD, merge conflicts, missing remotes, or a private payload
that would have to be inspected.

## Ingest Sequence

1. Read the execution contract.
2. Read the Knowledge Ingest Cell launcher skill and target party/workflow refs.
3. Convert the user's current side-session request into a bounded summary.
4. Route ingest through `knowledge_ingest_pipeline_v0`.
5. Use the receipt capture stage before closeout.

Receipt layer statuses should cover:

- `candidate`
- `source`
- `wiki`
- `rag`
- `canon`

Use the weakest supported status. Prefer `owner_decision_needed` or `blocked`
over implying a layer is complete.

## Receipt Paths

Use metadata-only refs under:

- `_workmeta/system/knowledge_ingest_receipts/**/*.jsonl`
- `_workmeta/<project_code>/knowledge_ingest_receipts/**/*.jsonl`

Write missing-audit outputs under:

- `_workmeta/system/reports/knowledge_ingest_missing_audit/<run_id>/`
- `_workmeta/<project_code>/reports/knowledge_ingest_missing_audit/<run_id>/`

Do not place raw source files, raw transcript exports, NotebookLM answers,
mail bodies, attachments, or source text in these locations.

## Publish Sequence

1. Run focused validators.
2. Stage only intentional `_workmeta` evidence for the current run.
3. Commit with a metadata-only message such as:
   `record: 지식 인입 영수증`
4. Push `_workmeta` to origin.
5. If public repo changed, route through `soulforge-github-up` or the
   registered GitHub upload workflow.

## Output Shape

Report:

- `Applied skill: soulforge-knowledge-ingest-cross-pc`
- `Target skill: soulforge-knowledge-ingest-cell-launcher`
- `Target workflow: knowledge_ingest_pipeline_v0`
- `Repos pulled: public/_workmeta/private-state with blockers if any`
- `Skill sync: all or named skills`
- `Receipt refs: ...`
- `Missing-audit refs: ...`
- `Validators: ...`
- `Published repos and commit refs: ...`
- `Remaining owner decisions or blocked layers: ...`

## Non-Claims

This skill does not claim:

- source truth validation
- owner approval
- Drive or NotebookLM upload
- NotebookLM answer authority
- source-text extraction or RAG index build authority
- public canon promotion
- ontology acceptance
- default-route safety
- that local chat memory is recoverable without `_workmeta` commit/push

## Validation Checklist

- `SKILL.md` frontmatter has only `name` and `description`.
- `agents/openai.yaml` is UI metadata only.
- Public tracked skill files contain no host-local absolute paths, raw payloads,
  private evidence, secrets, or NotebookLM answers.
- The skill points to workflow-owned `profile_policy.yaml` at execution time
  and does not copy optimizer/profile authority into the launcher.
- The skill requires receipt and missing-audit refs before closeout.
- The skill requires `_workmeta` commit/push for cross-PC recovery.
- `npm.cmd run skills:sync -- knowledge_ingest_cross_pc` materializes the
  installed mirror before claiming it can be invoked.
