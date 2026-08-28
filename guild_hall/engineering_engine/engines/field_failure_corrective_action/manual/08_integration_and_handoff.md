# 08 — Integration and handoff

This package intentionally avoids shared writes. The factory integration lane alone may register
the adapter in shared Core tests, create a root validator entry, and regenerate whole-engine
manifest, topology, and release artifacts using existing emitters.

The exact shared work is listed in
[`../contracts/field_failure_corrective_action_integration_request_v0.md`](../contracts/field_failure_corrective_action_integration_request_v0.md).
The request states that no Core Interface change is needed. If integration discovers otherwise,
stop and return an interface-impact request rather than modifying Core locally.

For a handoff, report the source ceiling, focused test command/exits, external-review verdict,
branch and commit/ref equality, boundary status, integration request, and residual project
applicability/authority holds. Do not include raw sources, project payload, or review transcripts.
