# 07. Runs and receipts

Runner: [pcb_compliance_runner.mjs](../tools/pcb_compliance_runner.mjs).

The public-synthetic runner emits deterministic JSON on stdout. Its receipt declares zero
filesystem writes, network calls, model calls, RAG queries, and external actions. It is not a
project run and it does not create a persistent execution record.
