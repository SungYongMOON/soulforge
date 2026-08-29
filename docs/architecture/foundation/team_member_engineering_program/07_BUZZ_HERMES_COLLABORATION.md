# Buzz / Hermes Collaboration and Scheduled-Operation Model

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Boundary

Buzz is the source-local human-agent collaboration surface. Hermes is a bounded gateway/profile/runtime adapter. Neither one is an Official Task SoR, an ArtifactRevision authority, a Vault byte store, or a substitute for Guild's approved deployment/run identity.

4192 may show coarse collaboration/gateway health and a safe exact pointer into Buzz. It must not duplicate deep Bot chat, memory, session, tool output, or private status records.

## Collaboration objects and ownership

| Object | Source-local owner | Vault/ERP catalog role | Forge/Guild role | Watch role |
| --- | --- | --- | --- | --- |
| Buzz message/attachment/thread | Buzz relay/service | Link, classification, backup/recovery status, promotion receipt only | Optional bounded source/assignment/deployment relation | Coarse health plus exact safe pointer |
| Hermes profile/session | Hermes runtime | Deployment/runtime binding and recovery refs | Gateway availability and approved Run binding | Aggregate availability only |
| Chat-created candidate | Chat/source ledger until captured | Immutable capture generation and accepted projection only | Forge may consume accepted record | Candidate count/freshness only |
| Scheduled operation | Scheduler/source-local operation | Cataloged definition/run, provenance, result/backup status | Candidate/no-action interpretation within grants | Health/freshness and held incidents |

## Chat-created ledgers and scheduled operations as assets

The 1-hour intake, 3-hour source organization, 3-hour priority/order management, and any later Chat ledger are first-class assets. A sheet, chat history, or scheduled job is not automatically ERP truth.

Every capture generation must bind:

- source system and exact schedule/operation/run identity;
- collection window, cursor/replay/dedupe key, freshness and reconciliation state;
- row/candidate creation reason, source refs, decision/no-action/duplicate/correction/supersession relation;
- reviewer and acceptance state, task/artifact relation when one exists, and external owner policy;
- manifest and hash of the immutable capture generation; and
- a redacted metadata-only receipt rather than raw chat or credential content.

The later accepted projection into Vault/ERP or a Linear reconciliation is a separate state. It must preserve source references and immutable generation identity, make no hidden row deletion, and record whether reconciliation is complete, partial, rejected, or held. Scheduled operation success cannot create Official Done, a baseline, or a human acceptance.

## Operating flow

```text
source-local Chat / ledger / scheduler run
  -> immutable capture generation
  -> source/ACL/provenance validation
  -> candidate, no-action, correction, or hold
  -> optional Forge review / human decision
  -> accepted Vault/ERP projection and typed Linear reconciliation
  -> separate task/assignment/result lifecycle if approved
```

## Hermes and Buzz resilience boundaries

- Runtime availability is a coarse state: available, unavailable, stale, degraded, unknown, or held. It does not reveal a session body.
- A collaboration recovery requires a source-local backup generation, manifest/hash, isolated restore, and human acceptance before it is called recoverable.
- Deployment bindings use stable public identity/runtime refs and `secret_ref`; key material stays in the OS/secret owner.
- Bot identity/session history must be handed off through explicit binding/supersession/receipt, not inferred from a title or idle process.

## Current status and later build slices

Current public documents and code provide selected adapter/runtime evidence, but this plan does not re-observe a live Buzz or Hermes stack. Treat all deep collaboration data and physical availability as `VERIFY_PHYSICAL`.

The first build order is: (1) define capture-generation schema and source-local backup manifest, (2) prove no-action/dedupe/correction replay on synthetic data, (3) map approved capture to a read-only Vault/ERP projection, (4) connect a single approved Guild deployment in a one-seat test, and only then (5) request a bounded physical pilot.

## Related plans

- [Guild runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Watch / 4192](08_WATCH_4192_OPERATIONS.md)
- [External connector backup](10_EXTERNAL_CONNECTORS_AND_BACKUP.md)
- [Operations manuals](16_OPERATIONS_RUNBOOK_CATALOG.md)
