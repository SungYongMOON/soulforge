# 07 — Runs and receipts

The package runner is public-synthetic and stdout-only. Receipts record ruleset
and facts digests plus zero file, network, DB, and model effects. A replay with
identical inputs has identical bytes.

Run the public-synthetic demonstration from the repository root:

```text
node guild_hall/engineering_engine/engines/database_engineering/tools/database_engineering_runner.mjs
```

It compiles the base DBE rules, adapts the SQLite fixture, evaluates it, and
writes one JSON result to stdout. It accepts no database URL, file path, source
body, credential, model, or writer switch. Two identical invocations must have
byte-identical stdout and leave the caller directory unchanged.
