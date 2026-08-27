# 11 — Guidance boundary

E11 returns machine-readable reason codes. It does not generate a work instruction, prescribe recalibration, tell a user to accept/reject a product, or draft a calibration certificate.

Any future guidance layer must keep the determination, reason code, supplied source reference, and result impact visible. It must not change `unknown`, `held`, or `invalid` into an operational approval.

Q1 guidance is now a pure card builder. It can say to supply source-bound evidence, obtain current calibration evidence, hold a result for suitability review, or request an authorized exception disposition. It never performs, approves, or records that action.

Guidance accepts only the exact `{ assessment, observation }` input shape. It snapshots that complete graph before reading it, validates the CMV assessment structure/status/impact and the complete canonical observation envelope, rechecks every direct-source candidate, and validates the observation receipt digest. Its read-only MCP guidance path builds that envelope internally from public-synthetic Typed Facts; each declared tool snapshots exact arguments before dispatch, rejects extra/unsafe arguments, and maps invalid fixture case IDs to a declared MCP input error.

Guidance verification (`validateCalibrationMeasurementValidityGuidance`) snapshots and admits both the guidance envelope and the trusted `{ assessment, observation }` context before reading them. It enforces exact byte-level equality for project binding identity/revision/content, valid_at/tested_at relationship, and known_at cutoff, recomputes assessment/candidates/receipt digests directly from the trusted upstream objects, recomputes the expected guidance digest, and refuses schema-valid but context-inconsistent or reclosed envelopes.
