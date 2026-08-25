# 10. Observation boundary

Common chassis: [../10_observation_eye.md](../10_observation_eye.md).

E01 consumes injected bounded metadata and exact refs only. No observation attempt or inaccessible
evidence produces `gap_unknown`; only a positive exact-evidence absence may produce `gap_missing`.
The local projection at `../observation/quality_readiness_observation.mjs` converts already-bound
Typed Facts into `observed_present`, `observed_absence_confirmed`, or
`observation_unavailable` rows. It scans no files, retrieves no source, resolves no project fact,
and has zero external effects.

The projection also requires the exact derived assessment receipt and verifies its Typed Facts
digest. Its receipt carries the bound assessment digest, so a stale or mismatched observation
cannot be paired with a different assessment in guidance.
