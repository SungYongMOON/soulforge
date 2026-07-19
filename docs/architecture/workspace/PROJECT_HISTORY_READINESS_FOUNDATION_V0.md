# Project history readiness foundation V0

## Outcome

The readiness foundation makes the current boundary executable without
pretending that P0 or P1 has passed. It reuses the independent H00 envelope and
coverage contracts, adds a public gate-map validator, and provides a metadata-
only one-project fixture for all five lanes.

```text
C00A historical receipt -> C00Q retained public/synthetic receipt
             |
             v
C00B formal PASS absent ----> P0 / H00 / H01-H06 remain HOLD
                                      |
                                      v
                         synthetic five-lane Shadow only
                                      |
                                      v
                         H06 coverage + replay fixture
```

## Candidate lane map

| Lane | Phase | Candidate native occurrence | Current boundary |
| --- | --- | --- | --- |
| mail | H01 | `mail_occurrence` | exact owner ratification required |
| voice | H02 | `voice_recording` | candidate `voice_capture`; mapping ratification required |
| structured PC work | H03 | `erp_mcp_work_session` | bounded WorkSession candidate only; external schedule branch remains HOLD |
| file | H04 | observation, reconciliation event, or ERP upload event | subtype and owner ratification required |
| run/log | H05 | exact `report_authoring_v0` workflow job | accepted schema and identity ratification required |

These are readiness candidates, not live bindings. No default profile is
ratified, and the fixture uses synthetic owner surfaces only.

## Verified boundary

- the public map cannot include paths or grant activation;
- the V1 map is a fail-closed current-state snapshot: C00A is historical,
  C00Q retains one receipt, C00B is blocked, and P0/H00-H06/P1 are HOLD;
  each gate's evidence scope and blocking reason are pinned too, and advancing
  any field requires a separately reviewed map revision;
- the public map cannot set `progression_accepted` for any status;
- accepted prerequisite receipts are derived from status, not a self-declared
  progression flag: C00A's historical accepted outcome can precede C00Q, while
  later gates require a retained formal PASS receipt;
- a retained receipt cannot skip C00B, P0, H00, lane acceptance, or H06;
- one synthetic project receives one initial unclassified-to-classified event
  per lane, using a `synthetic-project-*` ID and only that lane's candidate
  native occurrence types;
- identical replay adds nothing and preserves the digest;
- conflicting event metadata and cross-lane double counting fail closed;
- H06 binds one exact coverage receipt per lane with no raw payload.

## Still blocked

- formal C00B PASS and P0 acceptance;
- H00 owner ratification;
- D19/D20/D25/D26 decisions and H01-H05 live adapters;
- D22/D24 export targets and production CSV/XLSX/ICS materialization;
- ERP, MCP, collector, promoter, writer, scheduler, migration, cutover,
  failover, and failback activation.
