# Public Synthetic Profile Calibration - 2026-05-15

Calibrated `review_gate_evidence_pack_v0` with a public-safe synthetic TRR-like/PDR-like controller-board harness review fixture.

Result:

- Primary profile: `gpt-5.4 / medium / darkelf / auditor`
- Shadow smoke profile: `gpt-5.4 / low / darkelf / auditor`
- Archive: `calibrations/cal_20260515_public_synthetic_staged_v0/`

The selected profile was the best quality-passing finalist for required output shape, source ref handling, CAN/reset gap visibility, decision non-overclaim, and public/private boundary hygiene.

Boundary note: this calibration did not use raw project truth, `_workspaces` material, private payloads, credentials, or runtime absolute paths.
