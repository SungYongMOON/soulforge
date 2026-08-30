# Vault / ERP Asset and Revision Architecture

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose

Vault/ERP is the logical asset/catalog/read-model seam for company Engineering assets, records, exact revisions, review state, accepted results, and their relationships. It is not a direct local-folder editor, a replacement for external source truth, or an engineering-judgment engine.

## Five-owner source-of-record matrix

Each important object names five distinct owner dimensions. A physical implementation must not collapse them into one table, directory, receipt, or UI state.

| Object | Logical owner | Byte owner | Revision owner | Acceptance owner | Backup / restore owner |
| --- | --- | --- | --- | --- | --- |
| External source object | Its source-local system | The source system or approved custody copy | Source system revision/history | Source's designated authority | Source-specific backup policy and isolated restore proof |
| Official Task (current) | Linear | N/A or Linear attachment owner | Linear history/comment/revision lane | Human/task authority | External connector backup generation, not a new task writer |
| Logical artifact | Vault/ERP catalog | Approved custody store | Vault ArtifactRevision ledger | Human domain acceptance authority | Bastion policy and actual store recovery proof |
| Accepted input bundle | Assignment + Vault/ERP manifest | Approved immutable source revision stores | Immutable bundle manifest | Assignment/approval authority | Same source store plus bundle-manifest recovery proof |
| Submitted result | Submission record | Staging/custody inbox until promoted | Candidate revision only after project binding | Reviewer then human acceptance | Staging and promoted-store policies separately |
| WorkSession/checkpoint | Assignment-bound execution record | Client durable outbox / service receipt store | Append-only sequence | Completion proposal only; not task acceptance | Client recovery plus service retention/restore policy |
| Agent Mark/Deployment/Run | Guild registry | Mark package / runtime-owned artifacts | Mark and deployment revisions | Human owner of agent policy | Bastion/Agent recovery evidence |

`PROJECT_FILE_ACTIVITY_REVISION_V0.md` contributes logical-file/content/revision/observation lineage. It does not become the byte-recovery or acceptance owner.

## Artifact state machine

```text
catalog candidate
  -> logical artifact registered
  -> custody receipt
  -> scan/quarantine classification
  -> project and assignment binding
  -> ArtifactRevision candidate (parent/head checked)
  -> independent review
  -> human acceptance of exact revision
  -> accepted ArtifactRevision
  -> baseline or release inclusion (separate authority)
  -> protected / restore-tested state
```

The state machine does not imply an automatic move. An upload can be valid while quarantine is pending; a clean scan can be valid while project binding is rejected; a reviewer can accept technical evidence while human acceptance or baseline promotion remains pending.

## Minimum identity and revision model

| Entity | Required stable fields | Core invariant |
| --- | --- | --- |
| `logical_artifact_id` | artifact kind, project ref, logical owner ref | Never infer identity from a filesystem path alone. |
| `content_id` | `sha256:<full-content-digest>`, size, media type | Same bytes do not erase different logical artifacts or ACLs. |
| `artifact_revision_id` | logical artifact, parent revision IDs, content ID, manifest digest | A return to old bytes is a new revision when its parent differs. |
| `submission_id` | actor chain, assignment, ticket, declared content digest | Submission is immutable evidence, not acceptance. |
| `baseline_id` / `release_id` | approved member revision IDs, approval ref, effective time | Baseline/release needs explicit authority and never follows file upload. |
| `source_ref` | source owner, stable external ID, exact revision/time, access classification | It is a pointer; it does not copy source truth into the catalog. |

All IDs are opaque, portable identifiers. UI titles, local filenames, machine paths, and external URLs are mutable display metadata and must never substitute for them.

## ERP Context architecture — research-driven design decision matrix

This is a `PILOT_REQUIRED` design, not a selected database schema. Direct-source comparison supports a provenance/event/revision vocabulary, immutable content descriptors, requirements-to-verification traceability, and explicit release evidence. It does not mandate event sourcing, bitemporal storage, CQRS, a graph database, or a particular vendor/product.

| Context concern | Deterministic first design | LLM role, if any | Decision / gate |
| --- | --- | --- | --- |
| Source occurrence and event | Stable `source_ref + occurrence_id`, event type/schema/version, capture activity, idempotency and source revision refs | Extract a candidate from bounded source text | Source adapter/replay fixture; no LLM event writer |
| Immutable revision/provenance | Logical entity, content/revision ID, Activity/Agent/Plan references, generation/derivation/invalidation relations | Explain or flag ambiguous lineage | Schema/replay proof; source remains local SoR |
| Temporal validity | Preserve `valid_at`, `recorded_at`, observed/known time, correction/supersession | Suggest ambiguity for human review | Bitemporal representation is a pilot choice, not current truth |
| Entity and project binding | Typed project/entity refs, exact source binding, ACL, conflict state | Candidate match only with confidence/reason | Deterministic resolver/approval; no LLM identity authority |
| Evidence / claim / decision | Immutable evidence ref; separate claim, decision, review, acceptance records | Draft candidate/summary | Human/exact policy decides; no LLM promotion |
| Task and artifact relation | External Task ref, Work Brief, assignment, ArtifactRevision refs | Propose links/risk | Current Linear SoR and human acceptance remain separate |
| ACL and invalidation | Per-object/action policy, revocation, invalidation/supersession events, cache keys | None beyond advisory explanation | Deny-by-default and replay/invalidation tests |
| Accepted generation projection | Deterministic projection from approved records/receipts with manifest/digest | Advisory synthesis over already accepted projection | One writer, read-model parity/rollback test, D36 |
| Offline rebuild/replay | Rebuild from accepted source/capture/revision/receipt records | Never sole recovery mechanism | Restore/replay parity and human restore acceptance |

The design deliberately keeps typed deterministic code/rule/schema/index/event projection ahead of LLM use. LLMs may produce candidate extraction, ambiguity questions, or advisory synthesis; they may not be the sole state writer, completion authority, identity resolver, permission evaluator, release gate, or promotion authority.

### Direct-source comparison

| Source | What it supports | What it does not decide for Soulforge |
| --- | --- | --- |
| [W3C PROV-O](https://www.w3.org/TR/prov-o/) and [PROV constraints](https://www.w3.org/TR/prov-constraints/) | Entity/Activity/Agent, plan/bundle/revision/primary-source/invalidation vocabulary and provenance relations | A physical store, acceptance policy, or exact application schema |
| [CloudEvents](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md) | An occurrence/event distinction and `source + id` uniqueness/deduplication pattern | A business event ledger or task lifecycle |
| [NIST digital-thread publication](https://www.nist.gov/publications/testing-digital-thread-support-model-based-manufacturing-and-inspection) and [NASA requirements-verification matrix guidance](https://www.nasa.gov/reference/appendix-d-requirements-verification-matrix/) | Traceability across engineering artifacts and a requirement/source/verification discipline | A claim that any given project is verified or compliant |
| [OCI descriptor](https://github.com/opencontainers/image-spec/blob/main/descriptor.md) | Digest/size/media-type descriptor pattern for immutable release/bundle content | Trust, correctness, or human acceptance from a hash alone |
| [OpenTelemetry](https://opentelemetry.io/docs/specs/otel/) | Correlating traces/metrics/logs with context and versioned observability contracts | Durable business provenance or task truth |

These sources justify a bounded, typed, testable pilot vocabulary. The recommendations to use a modular monolith/control plane first, append-only event/activity records, content-addressed artifacts, and deterministic projections are implementation inferences. Event sourcing increases schema-evolution/privacy/deletion complexity; content hash proves identity but not correctness; telemetry is observation rather than business provenance.

### Research state

Direct primary-source research was compared during this task. The separate NotebookLM CLI lane did not run because login was expired and requires Owner interactive login; therefore no NotebookLM finding is included or treated as corroboration. Any later `research_delta_handoff` must be mapped to a section, or explicitly marked `REJECT/HOLD`, without creating a workflow, registration, canon promotion, or default route.

## Exact canonical material and input bundles

An input bundle is the only client-download unit for a task. It is an immutable manifest, not “the latest project folder.” The manifest must include:

- assignment, task, Work Brief, project, and accepted-context refs;
- each logical artifact and exact accepted/baseline revision ID;
- package-relative normalized path, content digest, size, media type, and required tool/profile declaration;
- permitted action, client/project ACL audience, issue/expiry time, and bundle digest;
- derivation/redaction lineage where a derivative was allowed; and
- no absolute path, raw source fallback, hidden “latest,” or implicit cross-project/common lookup.

The data-plane service may range-resume a particular revision only when ticket, actor chain, manifest digest, and requested byte range all match. A new revision never continues a prior range. The client verifies every object digest before declaring the bundle usable.

## Workspace and editable-copy boundary

The member may choose any local authoring directory allowed by their device policy. The client records only package-relative paths in a local result manifest. Canonical source storage is mounted read-only or copied as an immutable bundle; it is never edited in place.

Actual template, document, spreadsheet, presentation, HWPX, PDF, CAD, EDA, test, and archive payloads stay in an approved workspace/worksite. `_workmeta` holds pointer/hash/status/compact receipt metadata only. An Office/HWPX/CAD package is a compound artifact: its manifest includes every relevant member, dependency, render/readback result, and native validation result rather than treating a friendly filename as a revision.

## Promotion and conflict policy

| Situation | Required outcome |
| --- | --- |
| Parent revision is no longer the current accepted head | `HOLD_CHANGED_HEAD`; create a divergent candidate or explicitly rebase under review. |
| Same submission/ticket and same digest replays | Idempotent receipt; do not duplicate a revision. |
| Same idempotency key and different digest | Conflict and quarantine; no overwrite. |
| Foreign project, ACL, or assignment | `HOLD_FOREIGN_SCOPE`; do not reveal whether another artifact exists. |
| Scan unknown, malware, archive bomb, media/hash/size mismatch | Keep in quarantine or reject; never create an accepted revision. |
| Reviewer absent or authority incomplete | `HOLD_REVIEW_REQUIRED`; no baseline/release or Official Done. |

## Current reuse and deliberate gaps

| Existing surface | Reuse decision | Boundary retained |
| --- | --- | --- |
| `PROJECT_FILE_ACTIVITY_REVISION_V0.md` and `guild_hall/file_activity` | REUSE | Metadata lineage only; no byte custody/recovery claim. |
| `SOULFORGE_ARTIFACT_TEMPLATE_SYSTEM_V0.md` | REUSE | Template/revision/hash binding; not final technical acceptance. |
| Personal ERP artifact upload | REUSE/MODIFY | Current service-owned inbox/pointer is not ArtifactRevision. |
| Project history MCP | REUSE/MODIFY | Attested copied CSV/XLSX history only; no arbitrary canonical bundle. |
| Quarantine/promoter/revision candidate/review projection | BUILD | D27/D29 and policy gates first. |
| Baseline/release promotion and production byte store | DEFER | Human authority and recovery proof first. |

## Acceptance criteria for the first ArtifactRevision vertical

1. A synthetic bundle and candidate revision pass schema, hash, ACL, parent/head, redaction-lineage, and no-fallback tests.
2. A single bounded physical file is uploaded with a declared hash and receives a custody receipt, then a separately recorded scan class.
3. A project/assignment binding creates one candidate revision only after D27/D29 gates pass.
4. A fresh reviewer sees candidate, evidence, and parent/head without raw foreign material.
5. A human accepts one exact revision; only then may the separate current Task SoR receive an authorized status update.
6. Backup capture and isolated restore reproduce the manifest/content hashes before any team promise.

## Related plans

- [Forge Work Brief and assignment](04_FORGE_AX_SE_WORK_AND_ENGINE.md)
- [MCP transfer and WorkSession](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [Bastion recovery](09_BASTION_SECURITY_RECOVERY.md)
- [External sources](10_EXTERNAL_CONNECTORS_AND_BACKUP.md)
- [Physical architecture and Path Registry](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md)
