# GPT-5.6 migration validation — 2026-07-10

The existing public-safe API-contract-drift fixture and frozen gate were reused with species/class fixed to `darkelf|archivist`.

- Selected: `gpt-5.6-sol|low|darkelf|archivist`
- Observed quality scores: 96, 98, 97
- Backup: `gpt-5.6-luna|medium|darkelf|archivist` (minimum-quality pass only)
- Previous incumbent: rollback reference; observed scores 82 and 88
- Cost scope: CLI token and wall-time proxy only; no billed cost or ROI claim

Evidence: `calibrations/cal_20260710_gpt56_migration_001/`.
