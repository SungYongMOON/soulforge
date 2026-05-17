# synthetic NotebookLM query log

These rows model imported NotebookLM-like advisory results. They are not copied answers or source excerpts.

| entry_ref | timestamp_utc | capture_mode | actor_type | actor_id | target_knowledge_ref | access_type | outcome_state | source_ref | query_ref | reason_used |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| entry-001 | 2026-05-16T12:00:00Z | imported_log_entry | advisory_handoff | synthetic_notebooklm_bridge | docs/architecture/workspace/examples/notebooklm_bridge/synthetic_notes/source_intake_pattern.md | advisory_handoff | useful | synthetic-source-001 | synthetic-query-001 | Imported advisory signal for source intake pattern review. |
| entry-002 | 2026-05-16T12:05:00Z | imported_log_entry | advisory_handoff | synthetic_notebooklm_bridge | docs/architecture/workspace/examples/notebooklm_bridge/synthetic_notes/source_intake_pattern.md | summarize | partially_useful | synthetic-source-001 | synthetic-query-002 | Imported advisory summary for source intake pattern review. |
| entry-003 | 2026-05-16T12:10:00Z | imported_log_entry | advisory_handoff | synthetic_notebooklm_bridge | docs/architecture/workspace/examples/notebooklm_bridge/synthetic_notes/review_boundary_pattern.md | route | routed | synthetic-source-002 | synthetic-query-003 | Imported advisory route for boundary review pattern review. |
