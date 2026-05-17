# synthetic NotebookLM bridge fixture

This directory is a tracked public-safe fixture for a NotebookLM-like advisory bridge into `guild_hall/knowledge_access`.

It contains only synthetic metadata:

- `synthetic_notebooklm_binding.yaml` describes the bridge policy and import shape.
- `synthetic_notebooklm_source_ledger.md` lists synthetic source handles without source payload.
- `synthetic_notebooklm_query_log.md` mirrors NotebookLM-like query/import rows as metadata only.
- `synthetic_notebooklm_binding_no_query.yaml` and `synthetic_notebooklm_query_log_no_query.md` cover the blocked no-query/no-fabrication path.
- `expected_bridge_summary.yaml` records the expected metadata rollup used by tests.

The fixture intentionally omits account data, runtime paths, owner text, and source payload. Imported rows are advisory signals only; they do not validate knowledge, promote canon, or mutate graph state.
