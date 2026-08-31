# Tool Workshop operator — Internal RC candidate

- Artifact ref: `artifact.manual.workshop_operator.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or operator exercise acceptance is recorded.

## Purpose

Operate the bounded Tool Workshop contract for one approved tool job: check the pack, inspect a capacity-one lease/fence result, and hand a candidate output to the separate ArtifactRevision review path. This procedure does not operate a physical CAD, Office, HWPX, or other specialist tool PC.

## Prerequisites

- The Owner has approved one isolated tool-workshop canary, exact workshop profile/tool-version reference, bounded job scope, and independent reviewer.
- The requested tool capability exactly matches the workshop profile. No general terminal, fallback tool, or inferred capability is permitted.
- A candidate output can be retained as a safe reference; physical bytes, project source, and credentials are outside this manual.

## Allowed and forbidden actions

- Allowed: validate the Tool Workshop and deployment-pack contracts, build/install/smoke an isolated pack candidate, inspect queue/lease/fence/validator readback, and record a candidate custody receipt reference.
- Forbidden: using an unapproved physical tool, running concurrent work in a capacity-one workshop, bypassing a fence token, treating a `done_candidate` result as acceptance, completing a task automatically, changing a host/runtime configuration, or exporting project material.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:tool-workshop
npm.cmd run validate:deployment-pack
node guild_hall/deployment_pack/tools/build_pack.mjs --spec guild_hall/deployment_pack/packs/tool_workshop_pack.spec.json --out APPROVED_STAGING_OUTPUT --install-verify APPROVED_ISOLATED_TARGET --smoke
```

- `guild_hall/tool_workshop/src/tool_workshop_core.mjs` provides `createToolWorkshopCore` for queue, lease, fence, validation, and candidate-output behavior.
- `guild_hall/agent_observation/resource_job_shop.mjs` is the adjacent host/resource observation contract; it is not a physical tool controller.
- `guild_hall/vault_revision/` owns the separate review/acceptance route for any ArtifactRevision candidate.

## Expected readback and evidence

- Pack/version/digest and installed-copy smoke readback for the isolated candidate only.
- Exact workshop profile, capability/tool-version reference, job/lease/fence token, queue state, validator outcome, and candidate custody receipt reference.
- A candidate output state only; independent review and acceptance must occur through their separate owner path.

## HOLD / stop

Stop on capacity conflict, missing/expired lease, stale fence token, capability/version mismatch, validator failure, absent project scope, conflicting writer, missing independent reviewer, or any request for unapproved hardware/software side effects. UI idle, a crashed runner, or an unverified process stop does not free a lease.

## Rollback and escalation

Release a lease only through the exact contract path; an expired takeover invalidates the older fence token. Do not delete a candidate output to resolve a conflict. Preserve the job/lease/receipt references and escalate to the Workshop owner, project reviewer, or isolated-pack operator as appropriate.

## Known issues

- Current Tool Workshop evidence is an in-memory contract plus isolated pack smoke; no physical Tool PC or specialist application binding is proven.
- `done_candidate` is not artifact acceptance, knowledge promotion, project completion, or release.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release the Tool Workshop Pack.
