# 06 — Evidence trace

Every input contains a typed immutable `project_binding_ref`; identity, certificate, traceability, environmental record, exception, and approval facts are references rather than source bodies. The receipt records a ruleset reference, source-packet reference, canonical input digest, assessment digest, and replay digest.

The input reference can prove only that an upstream producer supplied a pinned fact. E11 does not dereference it, validate the referenced certificate, or elevate it to a metrological claim.

Raw certificate bodies, customer files, and project evidence remain in their owner workspace and are not public package content or `_workmeta` payload.

Q1 Typed Facts add exact provenance for six fact families: instrument identity, calibration status, measurement suitability, traceability, environment, and exception. Every family binds an immutable source reference classified as direct official public evidence. `tested_at` and `known_at` are canonical UTC cutoffs, and `known_at` cannot precede the test time.

Receipt convention: `*_sha256` and `replay_digest` hold bare lowercase SHA-256 hex; `*_digest` and immutable reference `content_id` use the `sha256:` prefix. Every Q1 receipt and derived-ruleset identity digest uses `shared/calibration_measurement_validity_canonical_digest.mjs`.
