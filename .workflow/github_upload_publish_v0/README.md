# GitHub Upload Publish v0

`github_upload_publish_v0` is the repeatable upload workflow for publishing
Soulforge work to GitHub across the public repo and companion private metadata
repos.

It checks public `Soulforge`, `_workmeta`, and `private-state` independently,
keeps public/private boundaries explicit, runs the relevant validators, commits
changed repos with scoped messages, pushes each repo to its own origin, and
records a private upload receipt.

## Outputs

- `upload_scope_packet`
- `repo_change_inventory`
- `validation_matrix`
- `commit_plan`
- `push_result_report`
- `upload_receipt`
- `boundary_review_note`

## Boundary

- Public repo commits must not include `_workmeta`, `private-state`,
  `_workspaces/<project_code>` payloads, secrets, mail bodies, or raw private
  source material.
- `_workmeta` commits may include protected metadata and run evidence, but
  still must not include secret values.
- `private-state` is committed only when it has changes.
- Each repo is committed and pushed through its own Git root and remote.

## Current Maturity

`validation_level: pilot_ready_private_evidence`

This workflow is being introduced for the current upload path. It should be
marked stronger only after at least one bounded upload run records a push result
report and receipt.

