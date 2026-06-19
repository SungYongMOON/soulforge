# Project Folder Indexing Report

- `run_id`: `<run_id>`
- `project_code`: `<project_code>`
- `worksite_ref`: `<project_worksite_ref>`
- `index_output_ref`: `<project_local_index_output_ref>`
- `catalog_ref`: `<file_search_catalog_ref>`
- `extraction_status_ref`: `<extraction_status_register_ref>`
- `blocked_queue_ref`: `<blocked_file_queue_ref>`
- `duplicate_candidate_ref`: `<duplicate_candidate_register_ref>`

## Counts

- `file_count`: `<count>`
- `file_type_counts`: `<metadata_only_counts_ref_or_inline_counts>`
- `extraction_status_counts`: `<metadata_only_counts_ref_or_inline_counts>`
- `blocked_counts`: `<metadata_only_counts_ref_or_inline_counts>`

## Freshness

- `freshness_state`: `<missing|stale|no_op|incremental_update_needed|full_reindex_candidate>`
- `reindex_reason`: `<reason_or_null>`
- `next_action`: `<next_action>`

## Boundary Review

- `_workmeta_metadata_only`: `<true|false>`
- `raw_payload_copied_to_workmeta`: `false`
- `password_or_secret_values_logged`: `false`
- `original_files_mutated`: `false`
- `source_truth_claim_made`: `false`
- `default_route_changed`: `false`
