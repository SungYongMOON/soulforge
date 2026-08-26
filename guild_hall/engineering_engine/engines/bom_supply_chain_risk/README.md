# BOM and Supply-Chain Risk Domain Engine

Status: deterministic public-synthetic candidate. The package evaluates typed
BOM/supplier facts for bounded risk/readiness signals. It does not own ERP
material truth, purchasing, supplier approval, alternate approval, counterfeit
authentication, contract interpretation, or product release.

Start with the [source packet](contracts/bom_supply_chain_risk_source_packet_v0.md)
and [domain contract](contracts/bom_supply_chain_risk_contract_v0.md), then the
[manual](manual/README.md). The public-synthetic zero-write demonstration is:

```text
node guild_hall/engineering_engine/engines/bom_supply_chain_risk/tools/bom_supply_chain_risk_runner.mjs
```

The package uses the existing Engineering Engine Core interfaces only. It does
not require a Core, registry-schema, root-manifest, or Watchtower change; those
shared surfaces are requested separately in [integration_request.md](integration_request.md).

## Focused validation

Run these public-safe, package-local checks after a change:

```text
Get-ChildItem guild_hall/engineering_engine/engines/bom_supply_chain_risk -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
node --test guild_hall/engineering_engine/engines/bom_supply_chain_risk/tests/*.test.mjs
npm.cmd run validate:path-policy
npm.cmd run validate:path-length
npm.cmd run validate:engineering-engine-core-domain
npm.cmd run validate:engineering-profile-schemas
npm.cmd run validate:engineering-engine-no-duplicate-authority
```

The package test suite includes actual-fixture AJV checks for the snapshot,
effective ruleset, domain result, assessment, and receipt; public-safe
digest/replay regressions; hostile admission checks; and the zero-write runner.
Shared discovery/manifest/topology/release validation remains a factory
integration responsibility.
