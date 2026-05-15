# Golden Baseline Summary

Baseline profile: `gpt-5.5 / xhigh / human / auditor`.

The golden baseline produced a complete review gate bundle with supported power evidence, partial CAN readiness, conflicting reset readiness, caveated TRR conversation readiness, explicit CAN/reset blockers, carry-forward actions, no fabricated owner decision, and required non-claims.

Key baseline behaviors used to derive the frozen gate:

- Preserve all nine public-safe source refs and checksums.
- Separate power support, CAN gaps, reset conflicts, owner-decision absence, and caveated conversation readiness.
- Keep entrance criteria as readiness-to-hold checks and success criteria as intended review outcomes.
- Classify blockers using workflow-allowed scopes only.
- Route actions to narrow owner/workflow surfaces without claiming closure.
- Record reset only as proposed or deferred unless an accepted owner decision exists.
- Avoid review approval, verification completion, upstream mutation, raw payload copying, secret use, private data, and runtime absolute paths.
