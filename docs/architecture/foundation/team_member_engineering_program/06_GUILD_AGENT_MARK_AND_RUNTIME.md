# Guild AI Workforce, Agent Mark, and Tool Runtime

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose

Guild owns the operational identity and execution lineage of people, agents, deployments, runs, and specialist-tool capacity. Vault/ERP catalogs the resulting workforce assets and their revisions; Guild does not become the Official Task writer or an ArtifactRevision acceptance authority.

## Workforce assets are first-class catalog objects

ERP/Vault must catalog not only human/project files but also organization and project-specific AI workforce assets. The catalog contains public identity/runtime refs and `secret_ref` only; it never copies plaintext keys/tokens or raw private memory by default.

| Asset | Logical / operational owner | Required revisioned fields | Never stored as default catalog payload |
| --- | --- | --- | --- |
| Organization graph | Vault catalog / Guild operations | organization graph revision, effective interval, parent/role relations, project scope | Raw chat or private roster notes |
| Project AI team | Vault catalog / project Guild surface | manager, responsibility, specialist, common-agent topology; project binding; effective dates | Cross-project Deep Context |
| Tool/Workshop team | Vault catalog / Guild + Workshop | capacity, lease/fencing policy, approved tool/library/PC version refs | License secret or unbounded workstation contents |
| Agent Family | Vault catalog / Guild | stable family identity, supported roles, lifecycle state | Runtime credential material |
| Agent Mark | Vault catalog / Guild | SOUL/instruction revision+hash, requested/observed model and effort, skills/workflows/tools allowlist, authority policy, evaluation/rollback refs | Plaintext secret, raw private memory, hidden reasoning |
| Deployment | Guild | Mark ref, runtime/platform binding ref, project/assignment scope, version, health policy | Token/key values |
| Run | Guild | deployment/assignment refs, input/output manifest refs, clock, result/evidence, receipt state | Full prompt/transcript/screens/keystrokes |
| Memory generation | Vault catalog / Guild runtime | generation ID, classification, retention, recovery/rollback ref | Raw memory body unless an approved payload owner explicitly permits it |

## Agent lifecycle

```text
Agent Family
  -> Agent Mark candidate
  -> independent review / Owner approval
  -> approved Mark
  -> Deployment bound to project + runtime
  -> Run bound to assignment + WorkSession
  -> result / evaluation
  -> next-Mark candidate, rollback, or retirement
```

A different model, reasoning effort, SOUL/instruction revision, skill/tool set, authority, project assignment, runtime version, or memory generation creates a new Mark/Deployment candidate rather than silently changing the current one. Requested and observed model/effort are separate fields; when unobservable, `observed_* = UNKNOWN`.

Current implementation (2026-08-31): `guild_hall/agent_observation/agent_mark_lineage.mjs`
implements a public-safe, pure `PREPARED_CONTRACT` for the five-layer lineage
with version/digest, exact binding snapshots, requested/observed model and
effort, project scope, tool/authority policy, memory parent/supersession and
rollback refs. It explicitly rejects `agent_record.v1` as an Agent Mark and
permits no persistence, runtime/config call, authority activation, external
call or raw memory. This closes the contract/schema leaf only; it is not a
durable catalog, approved Mark, Deployment activation or project pilot.

`agent_workforce_revision_catalog.mjs` adds an append-only in-memory revision
catalog contract for that prepared metadata. It records exact replay/conflict,
semver supersession and rollback candidates, but its `approval_claim` carries
only an unverified opaque authority ref. It projects no active Agent or
Deployment until a separate authority-verifier/writer exists; persistence and
project runtime activation therefore remain gated.

## Project isolation and assignment

- Every project manager/deep-context team is distinct. A shared workforce capability does not imply shared project memory or ACL.
- Forge proposes a role; assignment authority chooses a person or exact Agent Mark/Deployment; Guild verifies the binding and capacity.
- A Guild Run begins only from an accepted assignment and an exact Work Brief/input manifest.
- Agent success, worker idle, a Bot receipt, and a WorkSession closeout do not update Official Task status or accept an artifact.

## Tool runtime and Workshop interface

Tool-specific agents and workshops are Guild-operational objects with a separate resource contract:

`tool_request -> capability check -> exclusive lease/fencing -> exact tool/library/PC version -> input bundle -> bounded run -> validator -> result/evidence -> release lease -> review`.

The tool PC may be physically shared, but its role and project binding are separated. A capacity-one license/tool may not be inferred available from a process name or a dashboard's idle state. Workshop detail is specified in [11](11_TOOL_WORKSHOPS_AND_JOB_SHOP.md).

## Current reuse and HOLD

| Current surface | Treatment | Limit |
| --- | --- | --- |
| `.registry`, `.unit`, `.workflow`, `.party`, `.mission` | REUSE as their existing owner-bound structures | They do not by themselves provide a fleet-wide approved Mark/Deployment registry. |
| `guild_hall/agent_observation` | REUSE for observation/usage/receipt projections plus the pure Agent workforce lineage contract | `PREPARED_CONTRACT` is not durable registration, deployment acceptance or task authority. |
| Hermes/Buzz/Codex adapters | REUSE as bounded runtime/collaboration adapters | They do not replace Guild identity/assignment/receipt contracts. |
| Durable Agent Mark/Deployment/Run catalog, persistence and rollback execution | BUILD | Pure lineage + in-memory revision catalog contracts exist; authority verifier, accepted writer/storage and runtime binding remain gated. |
| Cross-project manager merge or autonomous assignment | DEFER / prohibited | Project isolation stays strict. |

## Module independence requirement

Guild components must publish a versioned module manifest with semantic interface version, required/optional dependencies, schema versions, capability discovery, health/readiness, data owner, config/secret refs, startup/shutdown behavior, default-off flag, backup/restore and rollback stance, deprecation policy, synthetic fixtures, validators, and release notes. Guild may upgrade/roll back independently when its published interface remains compatible; unrelated Vault/Forge/Watch modules do not automatically upgrade with it.

## Required evidence before a Guild pilot

1. Mark/Deployment/Run schema and change/rollback tests pass on public synthetic fixtures.
2. A project scope binds exactly one approved deployment and an accepted assignment with a revoke cascade test.
3. A tool/skill allowlist denial and cross-project memory denial both pass.
4. A one-seat run returns bounded receipts only; no raw memory/transcript becomes a catalog asset.
5. A human verifies result/review/acceptance boundaries before the run is used in a task loop.

## Related plans

- [Forge assignments](04_FORGE_AX_SE_WORK_AND_ENGINE.md)
- [Buzz / Hermes operations](07_BUZZ_HERMES_COLLABORATION.md)
- [Tool workshops](11_TOOL_WORKSHOPS_AND_JOB_SHOP.md)
- [Deployment packs](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
