# 07. Runs and receipts

Common chassis: [../07_runs_and_receipts.md](../07_runs_and_receipts.md).

The public-synthetic runner imports literals only and prints deterministic JSON to stdout. Its
default mode preserves the accepted base case. `tools/quality_readiness_runner.mjs --deepening`
exercises the local source/RAG/Profile/Typed Facts/observation/guidance/read-MCP path with public
synthetic data only. Both modes are deterministic and declare zero filesystem write, network,
model, RAG, ERP, task, and approval effects.
