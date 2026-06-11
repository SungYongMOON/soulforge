# Meeting Follow-up

`meeting_followup` is the registered workflow for turning public-safe meeting
notes into formal minutes, action items, and a follow-up note while preserving
uncertainty and non-invention boundaries.

## Purpose

- Convert a bounded meeting follow-up request into owner-readable outputs.
- Keep formal minutes, action items, and follow-up note generation in one
  reusable procedure.
- Preserve unknowns and open questions instead of inventing missing decisions,
  attendees, dates, approvals, or commitments.

## Current Package Surfaces

- `workflow.yaml`
- `role_slots.yaml`
- `step_graph.yaml`
- `handoff_rules.yaml`
- `monster_rules.yaml`
- `party_compatibility.yaml`
- `profile_policy.yaml`
- `calibrations/`
- `history/`

## Boundary

- Public workflow canon stores the reusable procedure, role split, handoff
  policy, and profile calibration policy only.
- Runtime meeting source material, private transcripts, raw recordings,
  attendee private data, and project-local execution truth do not belong in
  this workflow package.
- Profile calibration archives under `calibrations/` must stay public-safe,
  synthetic, or redacted.
