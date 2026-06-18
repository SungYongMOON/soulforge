# Knowledge Ingest Cell Launcher Mapping

## Soulforge Mapping

- Canon skill id: `knowledge_ingest_cell_launcher`
- Installed Codex skill name after sync: `soulforge-knowledge-ingest-cell-launcher`
- Target party id: `knowledge_ingest_cell`
- Target party canon: `.party/knowledge_ingest_cell/`
- Default party workflow: `knowledge_ingest_pipeline_v0`
- Source owner for party chain: `.party/knowledge_ingest_cell/party.yaml`
- Source owner for allowed workflow set: `.party/knowledge_ingest_cell/allowed_workflows.yaml`
- Source owner for workflow procedures and optimized execution profiles: `.workflow/<workflow_id>/`
- Source owner for local runtime bindings and private run truth: `_workmeta/<project_code>/`

## Workflow Set

Required workflow ids from the party:

- `knowledge_ingest_pipeline_v0`
- `knowledge_source_audit_v0`
- `knowledge_wiki_pipeline_v0`
- `owner_decision_packet_v0`
- `post_development_review_gate_v0`

Optional workflow ids:

- `project_password_unlock_copy_only_v0`
- `source_packet_sufficiency_review_v0`
- `knowledge_access_event_capture_v0`
- `rag_metadata_refresh_v0`
- `rag_source_text_quality_review_v0`
- `rag_work_card_router_v0`

The launcher should resolve these ids against `.workflow/index.yaml`, then
read each selected workflow's `workflow.yaml` and `profile_policy.yaml` at
execution time.

## Profile Resolve Rule

Use workflow-owned `profile_policy.yaml` files as hints at execution time. Do
not treat the launcher as the owner of model, reasoning effort, species, class,
unit, tool, connector, or local runtime binding decisions. Do not copy optimizer
profile values into the launcher as authority.

## Execution Behavior

The launcher should:

1. Reconstruct the user's request as a `knowledge_ingest_request_packet` or equivalent bounded request summary.
2. Route the request through `knowledge_ingest_pipeline_v0` unless the user explicitly asks for a narrower downstream workflow.
3. Accept an existing `unlocked_output_manifest` as an input pointer only.
4. Delegate copy-only preprocessing to `project_password_unlock_copy_only_v0` only when owner approval is explicit and the workflow boundary can be preserved.
5. Use `knowledge_source_audit_v0` for read-only source/storage audit before stronger placement or promotion decisions.
6. Use `knowledge_wiki_pipeline_v0` for sourcebound wiki/RAG preparation.
7. Use `source_packet_sufficiency_review_v0` when evidence coverage or allowed claim ceiling is uncertain.
8. Use `owner_decision_packet_v0` before Drive/NotebookLM upload, public canon promotion, source-text/index build, replacement, migration, controlled/internal source handling, or default-route authority.
9. Prepare a `rag_metadata_refresh_v0` handoff only for metadata-only RAG surface refresh.
10. Use `rag_source_text_quality_review_v0` and `rag_work_card_router_v0` only after approved source-text lane refs exist and the request needs support-trace quality review or deterministic work-card routing.
11. Use `knowledge_access_event_capture_v0` for metadata-only usage or accumulation signals when knowledge refs are used or changed.
12. Use `post_development_review_gate_v0` before claiming a bounded development result is accepted.

## Non-Claims

The launcher does not claim that:

- The party is newly authorized, renamed, default-routed, or default-route-safe.
- A workflow is production-ready unless the workflow package and review evidence already support that label.
- Optimizer outputs are copied into the skill or enforced by the launcher.
- Species, class, model, or reasoning choices are runtime bindings beyond the available execution profile and explicit run setup.
- Password values may be guessed, generated, printed, summarized, stored, or sent to an LLM.
- Unlocked output manifests replace project originals or become source-of-record authority.
- Drive placement, NotebookLM notebooks, advisory tool output, generated wiki projections, or RAG metadata are source truth.
- RAG refresh handoff grants source-text retrieval, BM25/vector source-index build, NotebookLM packet membership, public canon promotion, ontology acceptance, owner approval, default-route authority, or answer authority.
- RAG quality review or work-card routing grants source truth, answer authority, project execution authority, owner approval, default-route authority, or public canon promotion.
- Project-local payloads, private evidence, raw source files, credentials, or runtime absolute paths are safe to store in public tracked skill files.

## Output Shape

Report:

- `Target party: knowledge_ingest_cell`
- `Launcher skill: knowledge_ingest_cell_launcher`
- `Workflow chain checked: knowledge_ingest_pipeline_v0 plus required downstream workflows`
- `Optional preprocessing route: project_password_unlock_copy_only_v0 when owner-approved or existing manifest supplied`
- `Optional RAG routes: rag_metadata_refresh_v0 metadata-only handoff, rag_source_text_quality_review_v0 support trace review, rag_work_card_router_v0 deterministic work card when needed`
- `Profile resolve rule: workflow-owned profile_policy.yaml at execution time`
- `Installed mirror: soulforge-knowledge-ingest-cell-launcher` when sync ran
- `Validators: ...`
- `Remaining blockers: ...`

## Validation Checklist

- `SKILL.md` frontmatter has only `name` and `description`.
- `agents/openai.yaml` keeps UI metadata only and the default prompt mentions `$soulforge-knowledge-ingest-cell-launcher`.
- Public tracked files contain no raw payloads, password values, secrets, private evidence, host-local absolute paths, or NotebookLM answers.
- The launcher keeps party, workflow, profile policy, runtime binding, owner decision, upload, index-build, and mutation boundaries separate.
- `npm.cmd run skills:sync -- knowledge_ingest_cell_launcher` materializes the installed mirror before claiming it can be invoked by Codex.
