# Operations Manual and Runbook Catalog

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Rule

Manuals describe a bounded approved procedure. They do not store credentials, raw project payload, actual local paths, or automatic authority. Each manual has owner, entry preconditions, allowed actions, evidence output, rollback/escalation path, and release/compatibility version.

| Manual | Audience | Required contents | Completion evidence |
| --- | --- | --- | --- |
| HPP Server operator | Operator | pack install/start/stop/doctor, health, dependency compatibility, incident boundary, safe upgrade/rollback | versioned install/smoke/rollback receipt |
| Team Client install/use/revoke/recovery | Team member + operator | enroll, identity preflight, bundle use, outbox recovery, revoke/re-enroll, uninstall | one-seat identity/recovery test |
| MCP material receive/result submit | Team member | Work Brief, manifest verification, local workspace, checkpoint, ticket/upload/receipt, hold/error recovery | exact bundle + submission/custody proof |
| Vault artifact revision/promotion | Vault operator/reviewer | candidate, parent/head, scan/quarantine, review, human acceptance, baseline/release separation | accepted/rejected revision record |
| Forge work-generation review | Engineer/reviewer | accepted context, candidate/TaskIntent/Work Brief, role proposal, approval, Linear handoff | decision and no-action/reject trace |
| Agent Mark/Deployment/Run | Guild operator | Mark lifecycle, scope, deployment/run, observation, revoke/rollback/retire | project-isolation and rollback test |
| Buzz/Hermes operations and recovery | Collaboration operator | source-local scope, coarse health, safe pointer, capture/backup/restore, incident escalation | isolated restore/availability receipt |
| 4192 incident response | Watch operator | interpret health/freshness, open safe pointer, request action, validate Bastion receipt | request-to-receipt trace |
| External connector backup/restore | Connector operator | source scope, read-only capture, cursor/dedupe, generation/manifest, isolated restore/reconciliation | human restore acceptance |
| Workshop operator | Tool operator | request/lease/fence, input/output bundle, validator, timeout/retry/rollback, capacity management | lease + validator + custody receipt |
| New-hire training | New team member | work/material distinction, security, HOLD/escalation, submission practice | supervised synthetic task |
| Experienced-hire training | Experienced team member | revision/review/Workshop/tool verification, project isolation | low-risk approved practice loop |
| Manager training | Manager | task/assignment/acceptance separation, packs, approval, incident/rollback, cost/quality | decision simulation / signed acknowledgement |

## Catalog implementation rule

The initial implementation creates a public-safe catalog and templates, then one manual at a time with an owner-approved pilot. An instruction needing secret plaintext, a private project path, excluded external send, or an unavailable account/hardware stops and directs the operator to an unblock packet. Existing-binding read-only collection, isolated/default-OFF service work, backup/restore, and a previously gated canary may proceed only when the standing delegation and that leaf's exact gates both permit them.

## Standing execution and blocked-branch procedure

After the plan/review start gate, an operator or builder uses the Owner decision ledger before asking a question. Settled safe actions proceed under the relevant runbook; the standing defaults are Linear SoR, reference-in-place, no implicit fallback, proposal-only LLM, default-OFF/canary-first, and Watch read/approval-request only.

If a runbook reaches excluded authority, unavailable credential, or missing physical hardware, it records a branch-only unblock packet with the exact gate, evidence, requested Owner action, prohibited workaround, rollback/impact, and safe disjoint continuation. It does not read a secret, bypass a constraint, or pause unrelated safe branches. The program stops only after field-pilot acceptance or when every remaining branch is blocked.

## Related plans

- [Team rollout](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Bastion security/recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Testing/acceptance](13_TEST_DOGFOOD_ACCEPTANCE.md)
