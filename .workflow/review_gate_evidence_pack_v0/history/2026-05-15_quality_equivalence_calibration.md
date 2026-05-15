# review_gate_evidence_pack_v0 quality-equivalence calibration

Date: 2026-05-15

Calibration archive: `../calibrations/cal_20260515_quality_equiv_001/`

## Purpose

Re-run the workflow profile policy under the updated workflow-optimizer rule that a cheap or staged candidate cannot become the active primary unless it is compared against actual `gpt-5.5` candidates and passes the output-quality equivalence gate.

## Previous policy

- Primary: `gpt-5.4 / medium / darkelf / auditor`
- Candidate: `stageB_darkelf_auditor_54_medium`
- Quality score: 91
- Basis: public-safe staged synthetic calibration with CLI proxy telemetry

## New candidate comparison

| Rank | Candidate | Profile | Quality class | Score | Notes |
| --- | --- | --- | --- | ---: | --- |
| 1 | `qe_55_medium_darkelf_auditor` | `gpt-5.5 / medium / darkelf / auditor` | `quality_equivalent_pass` | 96 | Best source/checksum propagation and most routeable blocker/action structure. |
| 2 | `qe_prior_primary_54_medium_darkelf_auditor` | `gpt-5.4 / medium / darkelf / auditor` | `quality_equivalent_pass` | 94 | Previous primary still passes, but is no longer strongest. |
| 3 | `qe_55_xhigh_darkelf_auditor` | `gpt-5.5 / xhigh / darkelf / auditor` | `quality_equivalent_pass` | 94 | Strong boundary posture, slightly over-conservative on power-thread success. |
| 4 | `qe_55_low_darkelf_auditor` | `gpt-5.5 / low / darkelf / auditor` | `quality_equivalent_pass` | 93 | Good low-effort shadow, less granular than medium. |

## Decision

Promote `gpt-5.5 / medium / darkelf / auditor` as the active primary. The older `gpt-5.4 / medium` primary remains a valid quality-equivalent shadow, but the selected `gpt-5.5 / medium` candidate produced cleaner source-checksum preservation in evidence, blocker, action, and decision records while preserving all public/private and owner-decision boundaries.

## Safety boundary

This calibration used only the public-safe synthetic fixture in the archive. It did not consume raw project truth, private workspace material, credentials, or runtime absolute paths. Exact subagent token telemetry was unavailable, so cost confidence remains relative rather than billing-exact.
