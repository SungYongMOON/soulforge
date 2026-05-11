# calibrations

- `calibrations/` stores public-safe workflow-level profile optimizer archives for `meeting_followup`.
- Each calibration uses `calibrations/<calibration_id>/`.
- A calibration may include golden output, frozen quality gate, all candidate outputs, telemetry, evaluation, ranking, and recommendation files.
- Do not place actual meeting transcripts, private project notes, credentials, `_workspaces` material, or project-local raw run truth here.
- Optimizer results that change the workflow operating policy must also update `../profile_policy.yaml`.
