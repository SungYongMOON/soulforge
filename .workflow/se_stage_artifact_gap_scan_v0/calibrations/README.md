# calibrations

- `calibrations/` stores public-safe workflow-level optimizer archives.
- Each calibration lives under `calibrations/<calibration_id>/`.
- `cal_20260519_quality_equiv_001/` is the active public-safe CLI-only
  quality-equivalence calibration for this package.
- The archive must not include real project raw truth, private transcripts,
  `_workspaces` material, credentials, cookies, sessions, or secret-derived
  material.
- When a later calibration changes the workflow operating policy, update
  `../profile_policy.yaml` in the same change.
