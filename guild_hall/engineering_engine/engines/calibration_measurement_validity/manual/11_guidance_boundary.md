# 11 — Guidance boundary

E11 returns machine-readable reason codes. It does not generate a work instruction, prescribe recalibration, tell a user to accept/reject a product, or draft a calibration certificate.

Any future guidance layer must keep the determination, reason code, supplied source reference, and result impact visible. It must not change `unknown`, `held`, or `invalid` into an operational approval.

Q1 guidance is now a pure card builder. It can say to supply source-bound evidence, obtain current calibration evidence, hold a result for suitability review, or request an authorized exception disposition. It never performs, approves, or records that action.

Guidance accepts only the canonical CMV observation envelope and revalidates every direct-source candidate. Its read-only MCP guidance path builds that envelope internally from public-synthetic Typed Facts; unknown fixture case IDs return a declared MCP input error.
