# Quality Priority Contract Probe

Date: 2026-05-14

Calibration archive: `../calibrations/20260514-2155_quality_priority_contract_probe/`

## Summary

A scoped quality-priority probe tested whether the current primary profile still satisfied the newer `exp_xml_component_materials` contracts for page-fragment input scope and owner-approved local official collateral reuse.

The probe used a public-safe synthetic page-fragment fixture. It included optional `capture_xml_intake_library_v0` downstream handoff context, handoff-only `J10`/`U11` refs, EXP-confirmed `U10` plus support parts, and mocked official Analog Devices local-collateral evidence.

## Decision

Primary profile changed from `gpt-5.4-mini` `medium` to `gpt-5.5` `medium`, keeping `orc` + `archivist`.

The previous primary preserved the major safety and authority boundaries, but its `download_manifest` did not explicitly place completed collateral under `DATA Sheet` and `EVAL`. Under the owner's quality-first direction, the cleaner `gpt-5.5` `medium` probe was selected because it passed the page-fragment scope, context-only handoff, local official reuse, checksum/file-magic, and explicit folder-placement gates.

## Boundary

No real project `EXP.xml`, downloaded vendor files, credentials, cookies, `_workspaces` raw material, `_workmeta` runtime truth, or private-state content is stored in the calibration archive.
