# Knowledge Wiki Cell Launcher Mapping

## Soulforge Mapping

- Canon skill id: `knowledge_wiki_cell_launcher`
- Installed Codex skill name after sync: `soulforge-knowledge-wiki-cell-launcher`
- Target party id: `knowledge_wiki_cell`
- Target party canon: `.party/knowledge_wiki_cell/`
- Default party workflow: `se_knowledge_wiki_pipeline_v0`
- Source owner for party chain: `.party/knowledge_wiki_cell/party.yaml`
- Source owner for allowed workflow set: `.party/knowledge_wiki_cell/allowed_workflows.yaml`
- Source owner for workflow procedures and optimized execution profiles: `.workflow/<workflow_id>/`
- Source owner for local runtime bindings and private run truth: `_workmeta/<project_code>/`

## Workflow Set

Required workflow ids from the party:

- `se_knowledge_wiki_pipeline_v0`
- `official_source_packet_collect_v0`
- `sourcebound_knowledge_packet_operating_loop_v0`
- `knowledge_access_event_capture_v0`
- `post_development_review_gate_v0`

Optional workflow ids:

- `source_packet_sufficiency_review_v0`
- `owner_decision_packet_v0`

The launcher should resolve these ids against `.workflow/index.yaml`, then read each selected workflow's `workflow.yaml` and `profile_policy.yaml` at execution time.

## Profile Resolve Rule

Use workflow-owned `profile_policy.yaml` files as hints at execution time. Do not treat the launcher as the owner of model, reasoning effort, species, class, unit, tool, connector, or local runtime binding decisions.

Observed current primary profile labels at creation time were:

- `se_knowledge_wiki_pipeline_v0`: `gpt-5.5|medium|dwarf|pathfinder`
- `official_source_packet_collect_v0`: `gpt-5.5|low|elf|archivist`
- `sourcebound_knowledge_packet_operating_loop_v0`: `gpt-5.5|medium|dwarf|archivist`
- `knowledge_access_event_capture_v0`: `gpt-5.5|medium|dwarf|archivist`
- `post_development_review_gate_v0`: `gpt-5.5|xhigh|dwarf|auditor`
- `source_packet_sufficiency_review_v0`: `gpt-5.5|medium|dwarf|auditor`
- `owner_decision_packet_v0`: `gpt-5.5|low|dwarf|auditor`

These labels are informational snapshots only. Re-read the workflow-owned policies before each real run.

## Execution Behavior

The launcher should:

1. Reconstruct the user's request as a `knowledge_wiki_request_packet` or equivalent bounded request summary.
2. Route the request through `se_knowledge_wiki_pipeline_v0` unless the user explicitly asks for a narrower downstream workflow.
3. Use `official_source_packet_collect_v0` for source packet collection or indexing.
4. Use `sourcebound_knowledge_packet_operating_loop_v0` for private sourcebound projection, contradiction/gap lint, concept candidates, claim ceiling, optional advisory handoff, and workflowization routing.
5. Use `knowledge_access_event_capture_v0` for metadata-only knowledge usage or accumulation signals.
6. Use `source_packet_sufficiency_review_v0` when evidence coverage or allowed claim ceiling is uncertain.
7. Use `owner_decision_packet_v0` when owner approval, source approval, promotion, archive/retire, or default-route authority is needed.
8. Use `post_development_review_gate_v0` before claiming a bounded development result is accepted.

## Non-Claims

The launcher does not claim:

- The party is newly authorized, renamed, or default-routed.
- A workflow is production-ready unless the workflow package and review evidence already support that label.
- Optimizer outputs are copied into the skill or enforced by the launcher.
- Species, class, model, or reasoning choices are runtime bindings beyond the available execution profile and explicit run setup.
- Source truth can be approved by NotebookLM, Drive placement, Obsidian output, generated wiki projections, or advisory tool answers.
- Project-local payloads, private evidence, raw source files, credentials, or runtime absolute paths are safe to store in public tracked skill files.

## Output Shape

Report:

- `Target party: knowledge_wiki_cell`
- `Launcher skill: knowledge_wiki_cell_launcher`
- `Workflow chain checked: se_knowledge_wiki_pipeline_v0 plus required downstream workflows`
- `Profile resolve rule: workflow-owned profile_policy.yaml at execution time`
- `Installed mirror: soulforge-knowledge-wiki-cell-launcher` when sync ran
- `Validators: ...`
- `Remaining blockers: ...`

## Validation Checklist

- `SKILL.md` frontmatter has only `name` and `description`.
- `agents/openai.yaml` keeps UI metadata only and the default prompt mentions `$soulforge-knowledge-wiki-cell-launcher`.
- Public tracked files contain no raw payloads, secrets, private evidence, host-local absolute paths, or NotebookLM answers.
- The launcher keeps party, workflow, profile policy, runtime binding, and owner decision boundaries separate.
- `npm.cmd run skills:sync -- knowledge_wiki_cell_launcher` materializes the installed mirror before claiming it can be invoked by Codex.
