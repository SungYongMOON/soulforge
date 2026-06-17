# Project Password Unlock Copy Only v0

`project_password_unlock_copy_only_v0` is the generic workflow for handling
project folders that contain owner-provided password candidates and encrypted
documents.

It binds the target project, finds the project-local password candidate file,
scans only file types that commonly carry passwords, runs a route dry-run, and
then executes copy-only unlock attempts in a lab workspace after owner approval.
Original files remain read-only inputs. Reports contain metadata, tool routes,
counts, hashes of source artifacts when allowed, and blocked-file status, not
password values or document bodies.

## Outputs

- `project_context_binding_packet`
- `password_candidate_file_receipt`
- `encrypted_file_route_dry_run`
- `copy_only_unlock_smoke_report`
- `copy_only_unlock_batch_report`
- `original_integrity_receipt`
- `unlocked_output_manifest`
- `blocked_file_register`
- `owner_apply_handoff`
- `boundary_review_note`

## Boundary

- Public-safe workflow canon only.
- Password candidate values stay in the project-local secret file and are never
  printed, copied into `_workmeta`, committed, summarized, or sent to an LLM.
- The workflow may count usable candidate lines, but it must not hash, echo, or
  preserve the candidate file contents in reports.
- Unlock attempts use owner-provided candidates only. The workflow does not
  brute-force, infer, generate, or ask an LLM to guess passwords.
- Original project files are never modified, moved, deleted, or overwritten by
  this workflow. Only lab copies are opened or rewritten.
- Unlocked outputs remain in `_workspaces/system/password_unlock_lab_v0` or an
  owner-approved project workspace location until a separate owner decision
  approves replacement, migration, or reindexing.
- `_workmeta` stores metadata, pointers, counts, route decisions, hashes of
  source/output artifacts when allowed, and verification status only.

## Current Maturity

`validation_level: registered_structure_with_private_pilot_evidence`

The workflow was extracted from a private project pilot that successfully ran
dry-run, smoke, batch copy-only unlock attempts, and original-integrity checks
without exposing password values. It is registered as a reusable workflow
package, but it is not a default route and it does not claim unattended
production readiness.
