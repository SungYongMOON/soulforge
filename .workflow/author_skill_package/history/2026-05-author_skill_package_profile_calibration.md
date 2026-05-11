# author_skill_package profile calibration - 2026-05

## Summary

- Calibration id: `20260511-161446_subagent_quality_first`
- Primary profile: `gpt-5.4-mini|low|darkelf|archivist`
- Archive: `../calibrations/20260511-161446_subagent_quality_first/`
- Policy: `../profile_policy.yaml`

## Decision

`gpt-5.4-mini|low|darkelf|archivist` is the active operating profile for the skill authoring lane. It passed the frozen public-safe quality gate with score `100` and had the lowest published Codex credit estimate among Stage B quality-passing candidates.

## Measurement Notes

- Stage A compared species/class on `gpt-5.4-mini|low`; `darkelf|archivist` won.
- Stage B compared model/reasoning effort on `darkelf|archivist`.
- CLI telemetry probed 19 Stage B quality-passing candidates.
- Spark candidates were faster in the archived run, but the GPT-5.3 family was removed from active/default candidates after follow-up analysis because regular 5.3 was not cost/speed competitive and Spark pricing was not final.

## Boundary Notes

- The fixture was synthetic and public-safe.
- No real API specs, customer endpoint names, production logs, credentials, `_workspaces`, `_workmeta`, or `private-state` material is part of the archive.
- CLI telemetry is proxy telemetry and does not represent exact subagent usage.
