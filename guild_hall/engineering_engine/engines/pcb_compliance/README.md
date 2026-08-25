# PCB Compliance Domain Engine

`pcb_compliance` is a candidate, deterministic, public-safe Domain Engine. It checks only
whether a supplied evidence bundle is ready to be reviewed against an explicit rule/binding.
It does not decide actual PCB workmanship, fabrication quality, assembly acceptance, standard
compliance, repair disposition, release, or project applicability.

## Scope and boundary

- Public NASA source rows are conditional on a pinned project applicability and authority basis.
- IPC revision metadata is public, but protected/paid body text, clauses, class/addendum choices,
  and exact applicability remain `UNKNOWN/HOLD` until an Owner-approved lawful private binding
  exists.
- Evidence is key-addressed: only the exact keys declared by each effective rule are accepted,
  and every required key must carry bounded evidence references before a readiness result can be
  `SATISFIED`.
- RAG can help locate a source, never validate a source, applicability, evidence, or verdict.
- The runner has no filesystem, network, model, RAG, ERP, or external-action effect.

## Package surfaces

- [Source packet](contracts/pcb_compliance_source_packet_v0.md)
- [Source inventory](contracts/pcb_compliance_public_source_inventory_candidate_v0.json)
- [Compiler adapter](compiler/pcb_compliance_compiler_adapter.mjs)
- [Evaluator adapter](evaluator/pcb_compliance_evaluator_adapter.mjs)
- [Public-synthetic fixture](fixtures/pcb_compliance_public_synthetic.mjs)
- [Manual](manual/README.md)
- [Integration request](contracts/pcb_compliance_integration_request_v0.md)

Run the focused deterministic suite with:

```text
node --test guild_hall/engineering_engine/engines/pcb_compliance/tests/pcb_compliance.test.mjs guild_hall/engineering_engine/engines/pcb_compliance/tests/pcb_compliance_compiler.test.mjs guild_hall/engineering_engine/engines/pcb_compliance/tests/pcb_compliance_manual.test.mjs
```

Run the public-synthetic zero-write demonstration with:

```text
node guild_hall/engineering_engine/engines/pcb_compliance/tools/pcb_compliance_runner.mjs
```
