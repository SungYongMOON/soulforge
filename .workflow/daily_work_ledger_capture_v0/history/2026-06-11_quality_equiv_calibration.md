# 2026-06-11 Quality-Equivalence Calibration

Calibration id: `cal_20260611_daily_work_ledger_quality_equiv_001`

The workflow profile policy was calibrated on a public-safe synthetic metadata
fixture covering project ledger routing, `P00-000_INBOX`, Soulforge `workflow`
and `automation` sub-ledgers, skipped raw payload handling, unknown
project/subledger review routing, duplicate candidate-key handling, and
synthetic no-write receipts.

Selected primary profile:

- `gpt-5.4|low|dwarf|auditor`
- candidate id: `B_gpt54_low_dwarf_auditor`
- quality score: `95`
- measured total tokens: `21224`
- measured wall time: `22.704s`

Shadow profiles:

- `D_gpt55_medium_dwarf_auditor`: fastest measured wall time, higher total tokens.
- `A_mini_low_dwarf_auditor`: quality pass, but more verbose and slightly higher total tokens than primary.
- `E_gpt55_xhigh_dwarf_auditor`: highest quality baseline, higher reasoning tokens and wall time.
- `C_gpt55_low_dwarf_auditor`: quality pass after guarded rerun, not cheaper or faster.

Measurement caveats:

- Quality source: `cli_quality_equivalence_shortlist`.
- Telemetry source: `codex_exec_json_cli_proxy`.
- Service tier: `fast`.
- Exact isolated subagent token usage was unavailable.
- Candidate C had one abandoned direct-shell attempt that timed out before content;
  the archived candidate output is from the successful guarded rerun.

Claim ceiling: observed synthetic quality equivalence only. This calibration does
not claim real ledger execution, source truth, owner acceptance, pilot execution,
production readiness, or a cross-PC default route change.
