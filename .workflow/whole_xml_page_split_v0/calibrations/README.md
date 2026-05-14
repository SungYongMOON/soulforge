# calibrations

- `calibrations/` stores public-safe workflow-level profile optimizer archives for `whole_xml_page_split_v0`.
- Each calibration uses `calibrations/<calibration_id>/`.
- Do not store real XML bodies, generated page XML payloads, host-specific absolute paths, `_workspaces` outputs, `_workmeta` raw truth, credentials, cookies, or private-state material here.
- Optimizer results that change the workflow operating policy must also update `../profile_policy.yaml`.
