# 11 — Guidance boundary

E11 returns machine-readable reason codes. It does not generate a work instruction, prescribe recalibration, tell a user to accept/reject a product, or draft a calibration certificate.

Any future guidance layer must keep the determination, reason code, supplied source reference, and result impact visible. It must not change `unknown`, `held`, or `invalid` into an operational approval.
