# dual_deep_research_v0 Profile Calibration - 2026-05-24

Public-safe synthetic calibration promoted `profile_policy.yaml` from draft to active.

- Calibration archive: `calibrations/cal_20260524_staged_cli_001/`
- Runner surface: ephemeral `codex exec` CLI isolated candidates
- Quality baseline: `gpt-5.5` / `xhigh` / `human` / `auditor`
- Selected primary: `gpt-5.4-mini` / `low` / `dwarf` / `archivist`
- High-assurance shadow: `gpt-5.5` / `low` / `dwarf` / `archivist`

The fixture used only synthetic advisory packets and the public workflow contract. It did not use real NotebookLM output, web browsing, Google Drive, wiki state, account/session state, `_workspaces` payloads, private source truth, or owner decisions.

Selection rationale:

- The selected primary was the cheapest model family that passed the revised quality gate.
- Faster mini candidates failed or weakened common-claim dedupe and delta separation.
- `gpt-5.5/low/dwarf/archivist` produced the cleanest high-assurance packet and remains the shadow profile for the first real pilot or higher-risk boundary review.
- Exact dollar cost was not measured. Telemetry is exact for the isolated CLI candidate runs, not for a separate subagent orchestration runner.
