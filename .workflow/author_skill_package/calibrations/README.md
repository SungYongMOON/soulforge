# calibrations

- `calibrations/` stores public-safe workflow-level profile optimizer archives for `author_skill_package`.
- Each calibration uses `calibrations/<calibration_id>/`.
- A calibration may include golden output, frozen quality gate, candidate outputs, telemetry, evaluation, ranking, and recommendation files.
- Do not place actual skill source packets, customer API specs, credentials, `_workspaces` material, `_workmeta` run truth, or private project notes here.
- Optimizer results that change the workflow operating policy must also update `../profile_policy.yaml`.
