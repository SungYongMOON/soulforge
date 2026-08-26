# Runs, receipts, and limits

The zero-write runner compiles the public-synthetic Profile and evaluates
public-synthetic Core Typed Facts. Its receipt contains deterministic digests,
bindings, state counts, and zero values for filesystem writes, network requests,
model calls, procurement actions, ERP writes, and authority actions. It is a
demonstration command, not a production or project-data runner.

Focused validation is explicit:

```text
Get-ChildItem guild_hall/engineering_engine/engines/bom_supply_chain_risk -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
node --test guild_hall/engineering_engine/engines/bom_supply_chain_risk/tests/*.test.mjs
npm.cmd run validate:path-policy
npm.cmd run validate:path-length
npm.cmd run validate:engineering-engine-core-domain
npm.cmd run validate:engineering-profile-schemas
npm.cmd run validate:engineering-engine-no-duplicate-authority
```

The package tests prove only their named public-synthetic seams: Core facts and
derived-ruleset digest coherence, typed source applicability, opaque BOM/revision
binding, AJV validation of actual public outputs, hostile admission refusal,
evidenced-zero semantics, exact local package inventory, and zero-write replay.
They do not prove a real supplier, alternate, contract clause, ERP record, or
product decision.

`source_supported` is the maximum claim ceiling. A green test does not mean that
a component can be purchased, a supplier is qualified, an alternate is approved,
a part is authentic, a contractual clause applies, or a product is ready.
