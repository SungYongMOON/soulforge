# Repeat Intake Handoff Top-K Calibration

Date: 2026-05-14

Calibration archive: `../calibrations/20260514-1401_repeat_intake_handoff_topk/`

## Summary

The repeat optimization re-ran the saved primary and shadow profiles against a public-safe fixture that includes optional `capture_xml_intake_library_v0` `downstream_handoff` context. The fixture checks that intake observations can prioritize review/source order without confirming component identity, manufacturer part number, connectivity, or placed inventory.

## Decision

Primary profile changed from `gpt-5.4-mini` `low` to `gpt-5.4-mini` `medium`, keeping `orc` + `archivist`.

The previous low-effort primary preserved the major safety boundary but failed the richer handoff gate because EVAL records were not explicit enough under the `EVAL` folder and review-required components were represented too close to `none_found` material results. The medium-effort mini profile passed the frozen gate, stayed public-safe, excluded handoff-only `J2` and `U3` from inventory, and was materially faster than the higher-quality `gpt-5.5` shadows.

## Boundary

No real project `EXP.xml`, downloaded vendor files, credentials, cookies, `_workspaces` raw material, `_workmeta` runtime truth, or private-state content is stored in the calibration archive.
