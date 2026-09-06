# export/

ERP-absorbable snapshots (`snapshot.mjs`), written as CSV + JSON. This directory
is a hand-off point, not a database: dev-erp reads these files if/when it
chooses to, and nothing in this app reads dev-erp's database. Generated files
(`*.csv`, `*.json`) are gitignored — only this README is tracked.

Generate a snapshot:

```bash
npm run export:snapshot
```

See `../README.md` for the app overview and `../docs/SONAR_INTEL_MASTER_PLAN_V1.md`
§4 for the design principle this follows (self-contained schema, no ERP-format
coupling; `erpMapping` stays a reserved, nullable field).
