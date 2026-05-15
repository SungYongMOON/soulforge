# simulation_run_verify_v0 profile calibration - 2026-05-15

Public-safe synthetic calibration promoted the workflow profile policy from draft to active.

Recommended profile: `gpt-5.4 / low / human / auditor`.

The calibration used two synthetic cases: a blocked run with missing model and missing measurement definitions, and a synthetic-stub observed measurement case with no owner acceptance. No raw project truth, `_workspaces` material, private payloads, credentials, waveforms, or runtime absolute paths were used.

The primary profile was selected because it passed the frozen quality gate while keeping blocked runs separate from failed verification, synthetic observations separate from real simulator execution, and rule-based pass/fail separate from owner acceptance.
