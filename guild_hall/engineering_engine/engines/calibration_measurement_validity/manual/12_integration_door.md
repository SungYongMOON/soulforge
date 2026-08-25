# 12 — Integration door

The Core Adapter interface is exercised with the base ruleset and no profile bindings. The package self-registers only when `calibration_measurement_validity_evaluator_adapter.mjs` is imported. No MCP endpoint, registry loader, CLI registration, or writer is added here.

The factory manager must decide the global discovery route and add this package to shared topology/release artifacts in a sequential integration worktree. Until that happens, the focused package is a tested domain candidate, not a globally released Engineering Engine module.
