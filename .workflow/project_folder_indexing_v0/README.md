# Project Folder Indexing v0

`project_folder_indexing_v0` is a registered structure-only public-safe workflow
package for building and refreshing a project-local file/search-readiness index.

It binds a project worksite, inventories stable files, checks whether an index
is missing or stale, prefers incremental indexing for new or changed files, and
uses a controlled gate for full re-indexing. It records extraction status,
blocked queues, duplicate candidates, project-local extracted text pointers, and
metadata-only `_workmeta` summaries. Optional dawn housekeeping is represented
as queue rows only; this package does not implement scheduler, watcher, daemon,
service, or default-route behavior.

## Outputs

- `project_index_binding_packet`
- `file_inventory_snapshot`
- `freshness_and_missing_index_check`
- `incremental_index_plan`
- `full_reindex_gate_packet`
- `file_search_catalog_update`
- `extracted_text_manifest`
- `extraction_status_register`
- `blocked_file_queue`
- `duplicate_candidate_register`
- `metadata_only_workmeta_report`
- `dawn_housekeeping_queue`
- `validation_closeout_packet`
- `boundary_review_note`

## Boundary

- Public-safe workflow canon only.
- Actual source files stay in `_workspaces/<project_code>/...` or an
  owner-approved shared worksite.
- `_workmeta/<project_code>/reports/project_folder_indexing` stores metadata
  summaries, pointers, counts, status, hashes when allowed, validation results,
  re-index reasons, and next actions only.
- Raw files, extracted text payloads, document bodies, password values,
  credential material, cookies, sessions, tokens, and `.env` contents must not
  be copied into `_workmeta`, Git, chat, or this public package.
- Extracted text is a project-local search-readiness output, not a source truth
  replacement and not accepted knowledge.
- HWP originals are not read directly for body analysis; use an owner-approved
  HWPX derivative before extraction.
- Password-protected or secret-bearing files become blocked queue rows unless a
  separate owner-approved workflow handles them.
- Original files are not moved, deleted, renamed, overwritten, or reorganized by
  this workflow.

## Current Maturity

`validation_level: private_pilot_executed_first_pass`

The package is registered in `.workflow/index.yaml` and has a private first-pass
pilot over `P23-VDS-EXPLORE`. It is not default-route-safe and is not connected
to any scheduler/service. Any future automation binding must be owner-approved
separately.
