# 12 — Integration door

The Core Adapter interface is exercised with both the base ruleset and the Q1 source-bound Profile. The package self-registers only when `calibration_measurement_validity_evaluator_adapter.mjs` is imported. No registry loader or writer is added here.

Q1 adds a package-local read-only MCP adapter with three declared pure calls: source classification, public-synthetic evaluation, and public-synthetic guidance. It is not an MCP server registration, has no filesystem/project loader, and exposes no write tool.

The factory manager must decide the global discovery route and add this package to shared topology/release artifacts in a sequential integration worktree. Until that happens, the focused package is a tested domain candidate, not a globally released Engineering Engine module.

Core `71e84074` pre-admits the outer Core adapter/effective-ruleset envelope. Its recursive JSON snapshot helper is intentionally not a public Core import, so E11 keeps a package-local exact ingress snapshot for its domain-specific Typed Facts, derived-rule provenance, observation, guidance, and MCP contracts. The integration request records the optional future decision to expose a shared helper; this package does not modify Core to obtain it.
