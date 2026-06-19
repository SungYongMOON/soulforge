# Boundary Review Note

- `workflow_id`: `project_folder_indexing_v0`
- `run_id`: `<run_id>`
- `project_code`: `<project_code>`
- `claim_ceiling`: `observed`

## Confirmed Boundaries

- Project files stayed in the project worksite or owner-approved shared worksite.
- `_workmeta` received metadata-only report content.
- Password values, credentials, tokens, cookies, sessions, `.env` contents, and secret file bodies were not read, printed, copied, or committed.
- Extracted text remained project-local index output and was not treated as source truth.
- Original files were not moved, deleted, renamed, overwritten, or reorganized.
- No scheduler, watcher, service, or default-route change was made.

## Follow-up Routes

- Password-needed rows: `project_password_unlock_copy_only_v0` after owner approval.
- Knowledge candidates: sourcebound review route with source pointers and hashes only.
- Automation binding: separate owner-approved automation workflow.
