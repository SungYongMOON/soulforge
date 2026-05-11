# calibrations

- `calibrations/` stores public-safe workflow-level profile optimizer archives.
- Each calibration uses `calibrations/<calibration_id>/`.
- A calibration may include golden output, frozen quality gate, all subagent candidate outputs, passed-candidate CLI telemetry, evaluation, ranking, and recommendation files.
- Default optimizer layout:
  - `subagent_matrix/` for full quality matrix outputs and quality evaluation.
  - `cli_telemetry_probe/` for token/cost/wall-time proxy telemetry on quality-passing candidates only.
- Do not place actual project raw input, private transcript, secret material, or project-local run truth here.
- Optimizer results that change the workflow operating policy must also update `../profile_policy.yaml`.
