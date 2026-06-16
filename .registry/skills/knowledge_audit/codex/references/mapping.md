# Knowledge Audit Mapping

## Soulforge Mapping

- Canon skill id: `knowledge_audit`
- Installed Codex skill name after sync: `soulforge-knowledge-audit`
- Target workflow id: `knowledge_source_audit_v0`
- Target workflow canon: `.workflow/knowledge_source_audit_v0/`
- Source owner for workflow procedure and profile policy:
  `.workflow/knowledge_source_audit_v0/`
- Source owner for local runtime bindings and private report truth:
  `_workmeta/<project_code>/` or `_workmeta/system/`

## Workflow Files To Read

- `.workflow/knowledge_source_audit_v0/workflow.yaml`
- `.workflow/knowledge_source_audit_v0/step_graph.yaml`
- `.workflow/knowledge_source_audit_v0/profile_policy.yaml`

Read on demand:

- `.workflow/knowledge_source_audit_v0/handoff_rules.yaml`
- `.workflow/knowledge_source_audit_v0/role_slots.yaml`
- `.workflow/knowledge_source_audit_v0/monster_rules.yaml`
- `.workflow/knowledge_source_audit_v0/party_compatibility.yaml`

## Profile Resolve Rule

Use workflow-owned `profile_policy.yaml` as execution hints at run time. Do not
treat the launcher as the owner of model, reasoning effort, species, class,
unit, tool, connector, or local runtime binding decisions.

## Execution Behavior

The launcher should:

1. Reconstruct the user request as a bounded audit scope.
2. Use `knowledge-source-storage-audit` when a new report is needed.
3. Use `validate-knowledge-source-storage-audit` before interpreting report
   artifacts.
4. Summarize counts and owner next actions from the generated private reports.
5. Route storage mutation, source-of-record, or cleanup questions to owner
   decision handling instead of performing them.
6. Route missing/unresolved/orphan source questions to source sufficiency review
   when source support is unclear.
7. Use post-development review when the current task changes Soulforge files.

## Report Output Shape

Private reports normally live under:

`_workmeta/system/reports/knowledge_source_storage_audit/<audit_id>/`

Important files:

- `knowledge_source_storage_audit.json`
- `summary.md`
- `owner_decision_queue.yaml`
- `source_storage_audit.csv`
- `pointer_only_sources.csv`
- `orphan_workspace_files.csv`
- `duplicate_recorded_hashes.csv`
- `missing_originals.csv`
- `validation_log.md`

## Non-Claims

The launcher does not claim:

- Source truth approval.
- Source-of-record approval.
- Copy/link/move/delete/upload approval.
- NotebookLM upload/query authority.
- Google Drive mutation authority.
- Public canon promotion.
- Ontology acceptance.
- Default-route safety.
- Production readiness.

## Output Shape

Report:

- `Target workflow: knowledge_source_audit_v0`
- `Launcher skill: knowledge_audit`
- `Workflow files checked: ...`
- `Profile resolve rule: workflow-owned profile_policy.yaml at execution time`
- `Installed mirror: soulforge-knowledge-audit` when sync ran
- `Validators: ...`
- `Remaining blockers: ...`

## Validation Checklist

- Target workflow exists in `.workflow/index.yaml`.
- Required workflow files were read before execution planning.
- Generated reports were validated before interpretation.
- Public tracked files contain no raw payloads, secrets, private report bodies,
  or host-local absolute paths.
- The launcher keeps workflow, profile policy, runtime binding, and owner
  decision boundaries separate.
- `npm.cmd run skills:sync -- knowledge_audit` materializes the installed mirror
  before claiming it can be invoked by Codex.
