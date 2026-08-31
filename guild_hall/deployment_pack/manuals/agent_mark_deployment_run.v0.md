# Agent Mark, Deployment, and Run lineage — Internal RC candidate

- Artifact ref: `artifact.manual.agent_mark_deployment_run.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or human exercise acceptance is recorded.

## Purpose

Inspect and prepare the durable lineage for an AI worker: Agent Family → Agent Mark → Deployment → Run → Memory Generation. The procedure preserves version, digest, project scope, requested/observed model/effort, tool and policy references. It does not create a live agent, mutate a runtime, or disclose a secret.

## Prerequisites

- The proposed Family, Mark, Deployment, Run, and Memory Generation each have exact references, versions, digests, and project-scope references.
- Requested and observed model/effort fields are both recorded when observed; unobserved values remain `UNKNOWN` rather than inferred.
- Protected runtime credentials are represented only by an approved `secret_ref` in their protected owner surface; secret bytes are never supplied to this manual.

## Allowed and forbidden actions

- Allowed: validate the public-safe lineage contract, compare revision and scope bindings, review tool/policy references, and retain prepared-contract or HOLD results.
- Forbidden: treating a provider identity observation as an Agent Mark, activating a deployment, registering a Bot, opening a runtime session, copying memory/transcript content, rotating keys, changing a tool allowlist, or claiming a result/Official Done.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:agent-observation
npm.cmd run validate:hermes-bot-submit-executor
```

- `guild_hall/agent_observation/agent_mark_lineage.mjs` provides `prepareAgentWorkforceLineageContract` and `computeLineageRecordDigest`.
- `guild_hall/agent_observation/agent_authority_verification.mjs` provides `verifyAgentWorkforceAuthorityClaim`; a prepared lineage is not a verified active binding.
- `guild_hall/agent_observation/run_observation.mjs` and `delivery_evidence.mjs` are observation/receipt seams, not runtime or task writers.

## Expected readback and evidence

- Family/Mark/Deployment/Run/Memory Generation references, versions, digests, lineage/rollback references, and exact project scope.
- Requested and observed model/effort values, or explicit `UNKNOWN` where no observation exists.
- A prepared-contract/verified-binding receipt only when the independently trusted authority pin and revocation/validity inputs are exact.
- A Run result/delivery reference, if observed, kept distinct from consumer acknowledgement, review, human acceptance, knowledge promotion, and Official Task completion.

## HOLD / stop

Stop on missing or conflicting lineage, scope mismatch, stale digest, untrusted approval claim, expired/revoked authority, identity reuse, model/tool/policy drift, secret material, raw memory, or absent exact deployment/session binding. Never substitute a profile name, Bot label, or cached session for a durable identity.

## Rollback and escalation

Do not edit an active-looking record or delete a prior Mark/Deployment/Run to resolve drift. Preserve the public-safe reference and HOLD code, then escalate to the Agent Mark owner, deployment/runtime owner, or protected identity-recovery owner. Rollback references must point to an independently approved prior lineage record.

## Known issues

- Current lineage modules are pure contracts and observation surfaces; they do not operate Hermes, Buzz, Codex, or another provider runtime.
- Agent memory is never automatically promoted into project context or knowledge.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release an Agent deployment workflow.
