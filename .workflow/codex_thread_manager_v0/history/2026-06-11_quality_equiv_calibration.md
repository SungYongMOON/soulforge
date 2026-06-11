# Codex Thread Manager Quality-Equivalence Calibration - 2026-06-11

This calibration used a public-safe synthetic thread orchestration fixture for
`codex_thread_manager_v0`. It did not create Codex threads, fork or continue
threads, create worktrees, edit files, edit `NIGHT_WORK_HANDOFF`, run
validators, inspect secrets, use private/raw payloads, contact external
services, or claim real thread ids.

The shortlist compared five isolated Codex CLI proxy candidates:

- `gpt-5.4-mini|low|dwarf|auditor`
- `gpt-5.4|low|dwarf|auditor`
- `gpt-5.5|low|dwarf|auditor`
- `gpt-5.5|medium|dwarf|auditor`
- `gpt-5.5|xhigh|dwarf|auditor`

Three candidates passed the synthetic hard gate. `gpt-5.4-mini|low|dwarf|auditor`
and `gpt-5.5|medium|dwarf|auditor` were excluded because they did not place an
explicit `default_route_safe: no` value in the workflow-check closeout surface.

The selected primary profile is `gpt-5.4|low|dwarf|auditor` because it was the
lowest-token explicit hard-gate pass while preserving manager-plus-role-worker
routing, checkpoint-before-worker/rollover planning, worktree-or-stop handling
for overlapping mutation, fresh verifier independence, no real execution
claims, and explicit default-route-safety refusal.

Archive:
`.workflow/codex_thread_manager_v0/calibrations/cal_20260611_quality_equiv_001/`
