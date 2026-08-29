# Bastion Security, Identity, Backup, and Recovery

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose

Bastion provides shared identity, custody, transfer, protection, backup, restore, and recovery interfaces. It is not a domain acceptor, a task writer, or an automatic operational executor. Vault/Forge/Guild/Watch use its receipts but retain their own data and authority boundaries.

## Actor and grant chain

Every client effect is bound to:

```text
human/account
  -> enrolled device
  -> optional Agent Mark / deployment
  -> project scope
  -> task + assignment epoch
  -> object/revision/action
  -> expiry + policy revision
```

The effective authority is the intersection of those grants and the earliest expiry. A source text, a prompt, a filename, a client setting, or a stale local record cannot widen it.

## Security baseline

| Control | Required plan behavior |
| --- | --- |
| Device enrollment | Separate public certificate, locally protected private key, and bearer/credential binding; no private-key export to server inventory. |
| Transport | Private-address mTLS/HTTPS data plane, pinned server identity, host/audience checks, request/body/concurrency quotas, no direct central disk/UNC/SQLite/queue access. |
| Least privilege | Scope by project, task, assignment, object/revision/action; query existence behavior is uniform for denied objects. |
| Revocation | Recheck at request/finalization; revoke cascades to unconsumed tickets, delegated grants, and active replay attempts. |
| Secrets | OS/secret-owner protected storage; catalog only `secret_ref`, never plaintext token/key/cookie/session. |
| Prompt injection | Mail, chat, document, filename, tool output, and uploaded data are untrusted data. They cannot alter tool grants or instructions. |
| Audit | Append bounded actor/policy/ref/digest/result records; omit source bodies, secret values, raw transcripts, screen/keystroke capture, and unnecessary paths. |
| Retention | Classify by custody/state; legal hold, delete, archive, and retention owner are explicit per source class. |

The existing mTLS/enrollment code demonstrates synthetic controls only. A physical listener, certificate, firewall, and user/device activation require a separately approved one-seat canary.

## Custody and quarantine

Binary transport is deliberately split:

```text
MCP control request -> ticket -> authenticated bytes -> integrity finalize
  -> custody receipt -> quarantine/scan class -> promoter decision
  -> revision candidate -> review/acceptance
```

Scan status is one of `pending`, `clean`, `rejected`, `malware`, `unscannable`, `policy_hold`, or `unknown`. Extension/size/hash checks cannot be called a malware scan. A scan classification does not grant an ACL, project binding, or revision acceptance.

## Backup / restore model

Every data surface must be classified before it is opened for operational use:

| Class | Examples | Backup/restore stance |
| --- | --- | --- |
| Custodied / authoritative | approved artifact bytes, accepted revision ledger, approved external capture generation | Manifest + per-object hash + durable generation + isolated restore/reconciliation |
| Rebuildable projection | Watch projections, cached derived views, generated indexes | Record rebuild source/version; test rebuild but do not treat cache copy as authoritative backup |
| Runtime-local / recoverable configuration | service state, client outbox, installed package/version bindings | Bound backup policy and recovery test; never mix with source checkout |
| Forbidden from capture | plaintext secrets, transient credentials, raw privacy-restricted data without policy | Explicitly exclude and report only aggregate classification |

RPO and RTO are owner decisions by data class. This plan does not invent a numeric promise. A user-facing recovery statement requires all of:

1. an approved data class, retention and legal-hold policy;
2. a backup generation manifest, object hashes, source/version refs, and access classification;
3. real capture, not a file-exists check;
4. isolated restore to a new target with hash, manifest, ACL, parent/revision, and application readback reconciliation;
5. human restore acceptance; and
6. a documented rollback/incident route.

## Recovery actions and Watch

Watch/4192 may request a restart, isolation, restore, or rollback. Bastion validates exact target, policy, actor, expiry, maintenance/lease conditions, and backup generation before executing. It emits an action receipt, never a fabricated green health state. A restore does not accept a project artifact or complete a task.

## Module operation contract

Bastion modules have explicit startup preflight, health/readiness, shutdown/drain, feature flag default-off, migration/rollback, compatibility range, recovery verification, and deprecation policy. They own no hidden global startup dependency: a compatible Vault/Guild/Watch upgrade must not force an unrelated restore controller upgrade.

## Current reuse and HOLD

| Surface | Treatment | Current limit |
| --- | --- | --- |
| `guild_hall/backup_controller` | REUSE | Its synthetic/feature-gated contracts do not prove actual external captures or restore acceptance. |
| ingress/mTLS schemas and tests | REUSE | No physical team-PC rollout or promoted artifact store. |
| local/private state separation contracts | REUSE | No raw payload copied into public canon. |
| unified custody/promoter/scan/recovery controller | BUILD | D27 policy and physical ownership first. |

## Related plans

- [MCP transfer](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [External connector backup](10_EXTERNAL_CONNECTORS_AND_BACKUP.md)
- [Watch approval requests](08_WATCH_4192_OPERATIONS.md)
- [Test and restore gates](13_TEST_DOGFOOD_ACCEPTANCE.md)
