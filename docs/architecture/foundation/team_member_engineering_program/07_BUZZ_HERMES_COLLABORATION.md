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

## Buzz operating surfaces

Buzz surfaces have different authority and must not be treated as interchangeable
ledgers.

| Surface | Intended use | Authority ceiling |
| --- | --- | --- |
| Channel / thread / DM | Human-Agent instruction, discussion, clarification, and source-local collaboration | Conversation source only; not Official Task, accepted Evidence, or Human Acceptance |
| Pulse | Bounded important-status, milestone, blocker, or decision-needed projection | Broadcast/read projection only; a Pulse note cannot transition task or artifact state |
| Project | Project-scoped collaboration and repository-access boundary | Scope and access relation only; Project existence is not project acceptance or physical folder materialization |
| Project Git | Source-local Agent output, terminal receipt, manifest, validator, and reproducible revision submission surface | Evidence candidate source only; not Linear state, ArtifactRevision acceptance, accepted context, or Official Done |

Creating a Buzz Project publishes Project/repository metadata and access-channel
binding. It does not automatically turn an existing Hermes profile, Bot work
folder, human project folder, ERP record, or `_workspaces` payload tree into a
Git checkout. A local checkout or approved `Repos Directory` binding is a
separate physical action and remains subject to the Path Registry and project
workspace owner.

## Project Git Evidence Intake contract

Project Git may expose an explicit terminal receipt for later read-only intake.
Ordinary commits, chat messages, Agent self-reports, and intermediate checkpoints
must not create completion candidates.

```text
Project Git commit
  -> explicit terminal receipt present?
       -> no: NO_ACTION
       -> yes: read-only Evidence Intake candidate
  -> exact Task / Assignment / AgentRun / Work Brief revision binding
  -> artifact manifest, content hash, validator receipt, and blocker review
  -> VERIFIED_COMPLETION_CANDIDATE at most
  -> separate Human Acceptance and sole Linear State Writer gates
```

The minimum candidate binds `project_git_ref`, approved branch/ref, commit SHA,
terminal-receipt digest, Task/Assignment/AgentRun refs, Work Brief revision,
artifact-manifest and validator refs, blocker refs, producer Agent Mark and
Deployment refs, observed time, replay identity, and reconciliation cursor.
Force-push/history rewrite, foreign-project refs, stale Work Briefs, divergent
replay, missed-cursor coverage, raw private path, source body, or secret-bearing
content fail closed.

The following statements remain distinct:

```text
AgentRun succeeded != terminal receipt accepted
terminal receipt accepted != Evidence verified
Evidence verified != ArtifactRevision accepted
ArtifactRevision accepted != Human Acceptance
Human Acceptance != Official Task Done unless the approved sole writer applies it
```

The Evidence Verifier is read-only toward Linear and verifies commit ancestry,
artifact manifest/hash, validators, Work Brief revision, blockers, independent
review, and acceptance requirements. A later Linear State Writer is a separate
sole writer that accepts only an approved transition packet with expected current
state, authority, idempotency, writer epoch, before/after readback, and conflict
receipt. That writer is currently `HOLD`.

## Storage and ledger separation

- Hermes profile, session, memory, local continuity ledger, credentials, cache,
  and process state remain under the Hermes/runtime owner and are never committed
  wholesale to Project Git.
- Actual CAD, PCB, ERP, NAS, mail, voice, large media, and human project payloads
  remain in `_workspaces/<project_code>/**` or an owner-approved worksite. Project
  Git stores only approved lightweight files and references/manifests/hashes.
- Linear remains the Official Task current-state owner. Linear backup is a
  separate recovery lane and is not copied into each Project Git repository.
- AgentRun, Project Decision Ledger, source-capture ledger, Linear backup,
  Artifact/Evidence acceptance, and Project Git intake retain separate owners,
  writer epochs, replay keys, retention, and restore evidence.
- One shared Markdown activity file is not a multi-Agent ledger. Concurrent
  Agents write unique Task/Run receipt paths or isolated branches/worktrees; a
  deterministic projection may later render a human-readable timeline.

## Bounded Project Git pilot

The first physical pilot is one Owner-approved project, one exact private access
channel, one repository/ref, and one or a few low-risk terminal receipts. Public
documents use `<project_code>` only; the actual binding and receipt stay in the
project-private `_workmeta` owner.

Pilot sequence:

1. freeze a public-safe terminal-receipt envelope and owner/authority map;
2. prove read-only intake, replay/dedupe, stale revision, foreign-project, and
   history-rewrite rejection on synthetic Git fixtures;
3. read one actual low-risk Project Git terminal receipt without webhook and
   without Linear mutation;
4. verify commit, artifact pointer/hash, validator, Work Brief, blockers, and
   independent review, then request human review;
5. stop before persistent coordinator, webhook, Pulse automation, Linear writer,
   automatic Done, Artifact acceptance, or accepted-context promotion.

Entry requires exact project/access-channel/repository/ref/Agent bindings and
rollback. Exit requires one non-secret metadata-only readback, no cross-project
or raw-payload copy, duplicate effect zero, and Human Owner review. Any ambiguity,
missing receipt, stale Work Brief, unresolved blocker, or authority drift is a
branch-local `HOLD`.

## Hermes and Buzz resilience boundaries

- Runtime availability is a coarse state: available, unavailable, stale, degraded, unknown, or held. It does not reveal a session body.
- A collaboration recovery requires a source-local backup generation, manifest/hash, isolated restore, and human acceptance before it is called recoverable.
- Deployment bindings use stable public identity/runtime refs and `secret_ref`; key material stays in the OS/secret owner.
- Bot identity/session history must be handed off through explicit binding/supersession/receipt, not inferred from a title or idle process.

## Current status and later build slices

Current public documents and code provide selected adapter/runtime evidence, but this plan does not re-observe a live Buzz or Hermes stack. Treat all deep collaboration data and physical availability as `VERIFY_PHYSICAL`.

Public contract progress (2026-08-31): Backup Controller now has pure,
effect-inert readiness contracts for Buzz and Hermes. Buzz names Postgres,
media, Git, Redis classification, restore, audit, identity recovery and human
backup acceptance separately. Hermes names Agent Mark/Deployment, runtime,
SOUL/capability/session/memory/schedule custody, explicit Bot Chat↔Buzz
crosswalk, backup membership and restore/rollback. These are metadata contract
checks only; they do not re-observe the live stack, create a backup generation,
verify a private key, activate a Bot or make the system recoverable.

The first build order is: (1) define capture-generation schema and source-local backup manifest, (2) prove no-action/dedupe/correction replay on synthetic data, (3) map approved capture to a read-only Vault/ERP projection, (4) connect a single approved Guild deployment in a one-seat test, and only then (5) request a bounded physical pilot.

## OPEN_GRILL — Project Git local placement

The Buzz Project Git integration clone and per-Agent worktrees need one exact
physical class and binding owner. The current recommendation is one project
shared integration clone plus role-scoped isolated worktrees under the registered
Bot execution root. They must not be placed in ERP `_workspaces` or a human
authoring root. No clone, relocation or binding change occurs before the Grill
decision and Path Registry/private-binding gate.

## Related plans

- [Guild runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Watch / 4192](08_WATCH_4192_OPERATIONS.md)
- [External connector backup](10_EXTERNAL_CONNECTORS_AND_BACKUP.md)
- [Operations manuals](16_OPERATIONS_RUNBOOK_CATALOG.md)
