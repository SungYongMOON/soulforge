# 2026-06-11 Quality-Equivalence Calibration

- Calibration id: `cal_20260611_se_assistant_quality_equiv_001`
- Mode: `cli_quality_equivalence`
- Fixture: public-safe synthetic SE-assistant route triage request
- Candidate shortlist: A-E quality-equivalence precedent
- Selected primary: `gpt-5.4-mini | low | dwarf | auditor`
- Selection basis: all five candidates passed the hard gate; A was the lowest-token and fastest passing candidate.
- Archive: `.workflow/se_assistant_operating_loop_v0/calibrations/cal_20260611_se_assistant_quality_equiv_001/`

The policy change calibrates only the model-facing route triage surface:
boundary classification, route packet shaping, owner/source/review gap queues,
and closeout non-claim handling. It does not claim live pilot execution,
source truth, design authority, review approval, verification completion,
production readiness, or default-route safety.
