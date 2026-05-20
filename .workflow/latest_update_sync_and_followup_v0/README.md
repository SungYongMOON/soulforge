# Latest Update Sync And Follow-up v0

`latest_update_sync_and_followup_v0` is the event-driven workflow for checking
Soulforge after GitHub or another approved upstream surface changes.

It pulls the latest repo state, checks whether installed Codex skill mirrors are
current against `.registry/skills/**/codex`, syncs missing or stale mirrors when
policy allows, checks companion metadata state, refreshes workspace junction
status from `_workmeta/system/bindings/workspace_junctions.yaml`, and routes
follow-up work to curation, gateway, snapshot, skill sync, or owner-decision
surfaces.

## Outputs

- `latest_update_scope_packet`
- `repo_sync_preflight_report`
- `codex_skill_sync_audit`
- `codex_skill_sync_patch_report`
- `material_completeness_audit`
- `workspace_junction_refresh_report`
- `followup_route_packet`
- `boundary_review_note`

## Boundary

- Public-safe workflow canon only.
- It does not store host-local cloud roots, credentials, source payloads, mail
  bodies, NotebookLM answers, or private runtime paths.
- It does not automatically create or repair junctions unless a project binding
  explicitly provides local root resolution and mutation authority.
- It does not hand-edit installed Codex skill mirrors. Skill updates must come
  from tracked `.registry/skills/**/codex` bridges through the canonical sync
  command.
- It does not claim source truth, owner approval, canon promotion, or production
  readiness.

## Current Maturity

`validation_level: pilot_executed_report_only_private_evidence`

The workflow package has one report-only private pilot run. It verified that
the step chain can bind scope, inspect companion repo state, refresh declared
workspace junction state, surface metadata gaps, and route follow-up without
mutating junctions or project metadata. It is not production-ready and it does
not switch any default route.
