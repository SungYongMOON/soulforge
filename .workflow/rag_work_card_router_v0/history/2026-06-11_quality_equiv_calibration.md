# 2026-06-11 Quality-Equivalence Calibration

Calibration id: `cal_20260611_rag_work_card_router_quality_equiv_001`

The workflow profile policy was calibrated with the repo-local A-E shortlist on
a public-safe synthetic RAG work-card router fixture. The fixture used only
synthetic labels, fingerprints, refs, page ids, status counts, route hints, and
non-claim flags. No source payload, work-card source body, source chunk,
private project data, secret, `_workspaces` content, owner approval, or canon
claim was used.

Selected primary:

- `gpt-5.4|low|dwarf|auditor`

Decision summary:

- A (`gpt-5.4-mini|low|dwarf|auditor`) had the lowest measured tokens but
  failed the frozen gate by dropping supplied optional context refs and omitting
  the owner-decision/post-review route surface.
- B (`gpt-5.4|low|dwarf|auditor`) was the lowest-token quality pass and
  preserved the six artifact outputs, blocked-page exclusion, visible
  manual-review status, optional context refs, downstream route hints, and
  non-authority boundaries.
- D was the fastest passing run, but its token total was higher than B.
- E was the strongest quality baseline, but it was much slower and more
  token-heavy than the primary.

This calibration updates the workflow profile policy only. It does not register
the workflow, switch a default route, claim owner approval, or strengthen the
workflow beyond its draft/unregistered ceiling.
