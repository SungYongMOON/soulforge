# 20260514-171147 profile calibration

Calibrated `whole_xml_page_split_v0` with a public-safe structural fixture derived from the supplied real sample XML.

- Calibration archive: `calibrations/20260514-171147_staged_cli_real_sample_structural/`
- Mode: `staged_cli_calibration`
- Quality source: `cli_only_calibration`
- Recommendation: `gpt-5.4 | high | dwarf | archivist`

The selected profile passed the Stage C quality gate while preserving the 11 `Page` node boundary, source order, ordinal page ids from `page_001` through `page_011`, the titleblock `Page Count = 8` conflict warning, project-local output containment, source preservation policy, and downstream `page_xml_normalize_spec_v0` handoff.

The `gpt-5.4-mini | high | dwarf | archivist` candidate looked strongest in Stage B, but Stage C degraded to `pass_with_gaps` and its reasoning tokens spiked, so it was downgraded to a monitored fallback instead of the primary profile.

No real XML body, generated page XML payload, runtime absolute path, `_workspaces` output data, `_workmeta` raw truth, credentials, cookies, private-state material, or secret-derived content is stored in the public archive.
