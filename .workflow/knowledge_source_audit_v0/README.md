# knowledge_source_audit_v0

`knowledge_source_audit_v0` is the registered workflow wrapper for the
read-only knowledge source storage audit runner in `guild_hall/rag`.

It runs the deterministic `knowledge-source-storage-audit` CLI, validates the
generated audit JSON, and points the owner to the generated next-action reports.
The workflow does not copy, move, delete, upload, or decode source payloads.

Typical run:

```powershell
npm.cmd run guild-hall:rag -- knowledge-source-storage-audit --write --date YYYY-MM-DD --audit-id <safe_id> --max-orphan-rows 500
npm.cmd run guild-hall:rag -- validate-knowledge-source-storage-audit --audit-ref _workmeta/system/reports/knowledge_source_storage_audit/<safe_id>/knowledge_source_storage_audit.json
```

Primary private report outputs:

- `summary.md`
- `owner_decision_queue.yaml`
- `source_storage_audit.csv`
- `pointer_only_sources.csv`
- `orphan_workspace_files.csv`
- `duplicate_recorded_hashes.csv`
- `missing_originals.csv`
- `validation_log.md`

Authority boundaries:

- Source storage mutation remains owner-gated.
- Source truth, source-of-record decisions, and public canon promotion are not
  granted by this workflow.
- Runtime absolute paths may appear only in private `_workmeta` audit reports,
  not in public workflow or skill canon.
- The workflow is registered but not default-route-safe.
