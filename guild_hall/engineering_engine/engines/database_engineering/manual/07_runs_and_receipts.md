# 07 — Runs and receipts

The package runner is public-synthetic and stdout-only. The Project Binding
adapter emits the closed evidence receipt
`soulforge.database_engineering.evidence_receipt.v0`; evaluation emits the
separate closed evaluation receipt
`soulforge.database_engineering.evaluation_receipt.v0`. Both record only the
bound identities/digests and zero file, network, DB, and model effects. A replay
with identical inputs has identical bytes.

Run the public-synthetic demonstration from the repository root:

```text
node guild_hall/engineering_engine/engines/database_engineering/tools/database_engineering_runner.mjs
```

It compiles the base DBE rules, adapts the SQLite fixture, evaluates it, and
writes one JSON result to stdout. It accepts no database URL, file path, source
body, credential, model, or writer switch. Two identical invocations must have
byte-identical stdout and leave the caller directory unchanged.
