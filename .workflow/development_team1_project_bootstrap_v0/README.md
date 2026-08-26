# Development Team 1 Project Bootstrap v0

This registered workflow turns an Owner-authorized Development Team 1 project request into a preview-first, boundary-safe project start.

It covers classification, identity reservation, storage and metadata separation, starter packets, onboarding worklog, minimum runtime planning, compatibility holds, one bounded first-work canary, and closeout review.

The deterministic preflight is read-only. It proposes an internal `D1-YY-NNN` code or checks an exact formal project code, but it never edits a register, creates a workspace, provisions an agent, or touches an external service.

## Modes

- `internal_project_preview`
- `internal_project_apply_after_owner_authority`
- `formal_project_onboarding_with_exact_code`
- `readiness_recheck`

## Boundaries

- Project number, people, priority, budget, external commitments, baseline, public release, and final acceptance remain Owner authority.
- Project payload stays in `_workspaces/<project_code>` or an approved worksite; `_workmeta` stays metadata-only.
- Storage, runtime, and collaboration integrations are explicit variants, not defaults.
- Unknown compatibility becomes `HOLD`; aliases or fake project codes are forbidden.
- Persistent Bots and Engines are never created merely because a responsibility field exists.

## Focused validation

```powershell
npm.cmd run validate:development-team1-project-bootstrap
```

One public synthetic cold preview passed fresh executor and separate verifier review. Profile calibration is not yet bound, so `profile_policy.yaml` remains draft; production-ready and default-route-safe are not claimed.
