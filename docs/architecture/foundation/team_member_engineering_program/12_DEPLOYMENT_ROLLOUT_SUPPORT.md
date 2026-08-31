# Deployment Packs, Team Rollout, Education, and Support

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Pack model

Deployment packs are independently versioned install/release units. They are not product-owner seams and they do not imply a source-tree relocation.

| Pack | What it contains | Must not contain | Initial release gate |
| --- | --- | --- | --- |
| HPP Server Pack | Server modules, control/data-plane services, manifests, operator docs, supported migrations | Project payload, plaintext secrets, team client private keys | Isolated install/start/stop/smoke/upgrade/rollback/restore proof |
| Team Client Pack | MCP client/config templates, UI, local helper/outbox, learning material, safe diagnostics | Embedded credential, raw project data, implicit project grant | One-seat install, identity/revoke/recovery, exact work/bundle/submission loop |
| Tool Workshop Pack | Tool adapter, resource/lease helper, workshop docs and validators | License secret, customer libraries, project context by default | One workstation/tool low-risk canary and output validation |
| Project AI Team Pack | Approved project-specific Mark/Deployment bindings and runtime references | Cross-project memory, plaintext secret, global task authority | One project isolated deployment/run/rollback proof |
| Backup/Recovery extension | Recovery policy/adapter and test fixtures | Secret backup, unapproved source bytes | Capture + isolated restore + human restore acceptance |

Each pack has its own product ID, semantic version, release manifest, package checksum/signature policy, SBOM/dependency audit result, interface compatibility matrix, release note, supported migration, staged channel/ring, telemetry/health policy, support lifecycle, upgrade manual, rollback manual, and restore status. A release is not a folder or artifact existing: it requires build, test, package, install, smoke, upgrade, rollback, and applicable restore evidence.

## Team Member Device Profile

| Profile field | Required behavior |
| --- | --- |
| Account and organization role | Explicit human identity; no identity inferred from a machine name. |
| Device identity | Enrolled device and certificate/binding ref; private key remains OS protected. |
| Project grants | Explicit project/task/object/action scope; no discovery fallback. |
| MCP client | Versioned client and compatibility range; capability discovery before use. |
| Buzz / collaboration | Optional source/deployment adapter, never a required task truth. |
| Codex/Hermes binding | Exact approved Agent Mark/Deployment ref when used; requested/observed runtime fields kept separate. |
| Local workspace | Person-managed company-convention authoring folder; inputs are immutable package-relative bundle material. No Agent monitoring or automatic ingest. |
| Outbox/cache | Client-local bounded state with D28 retention/recovery policy; no raw transcript capture. |
| Allowed tools | Versioned allowlist and Workshop capability/lease requirement. |
| Secret references | `secret_ref` only; provisioning happens outside Git/chat/installer payload. |
| Version/update ring | Current/approved release IDs, compatibility state, staged channel, rollback target. |
| Support/recovery | Doctor, revoke, re-enroll, outbox recovery, uninstall/clean-up rules. |

## Rollout rings and support

```text
synthetic -> integration -> internal developer -> one physical seat
  -> one project / low-risk work item -> repeat 3–5 times
  -> development-team pilot -> broader rollout
```

Each ring has a separate promotion decision, target release manifest, known issue list, support owner, rollback trigger, and evidence bundle. A training completion or a successful installer never automatically grants write, external-action, or task-completion authority.

## Education paths

| Audience | Minimum learning path |
| --- | --- |
| New hire | Find approved work/material, use read-only bundle, submit a result/evidence candidate, recognize HOLD/escalation/security boundaries. |
| Experienced hire | Existing work mapping, exact revision and review practice, specialist Workshop use, verifying agent/tool output. |
| Manager | Task/assignment/acceptance separation, team pack grants, incident/rollback, cost/quality and Agent Mark approval boundaries. |
| Operator | HPP/service health, client enrollment/revoke/recovery, backup/restore evidence, change/incident runbooks. |

## Module and release operability

Every pack and every contained Module publishes a manifest describing owner, semantic/versioned interface, dependencies, schemas, capability discovery, health/readiness, data/config/secret refs, startup/shutdown/default-off, migration compatibility, backup/restore, rollback/deprecation, synthetic fixtures, validators, and release evidence. Dependency-cycle detection and startup preflight happen before installation; compatible modules may upgrade independently without forcing unrelated packs.

## Current state

The Project AI Team Pack still has no tracked spec, but its input-admission
contract now exists. A separately trusted Project Mark approval/current state
and one current verified Agent binding per required
manager/responsibility/specialist/common role are mandatory. It prepares
refs-only future pack input and performs no profile creation, runtime
configuration, pack emission or release.

The multi-PC/bootstrap and skill-sync documentation is reusable guidance, not a deployed Team Client Pack. No client is installed, no update ring is activated, and no physical user/device credential is created by this plan.

## Development Team 1 internal release target

The first audience is Development Team 1 plus the Owner using an equivalent
team-member PC setup. The current time-boxed target is an internal release
candidate, not full-company production.

The Owner-confirmed first target is one Owner-PC seat using the same setup intended
for a team member. The included Slice covers the current validated HPP Server/Backup
Pack baseline, install/doctor, project/authority
readback, approved Task/material read-only access, Buzz or MCP delivery, person-
managed local work, result/Evidence candidate submission, review/HOLD display,
coarse Soulforge Operations Console health, one synthetic isolated-restore
measurement, synchronized install/use/recovery manuals and a known-issue list.

Current pre-physical evidence: HPP 964-file, Team Client 216-file and
Backup-Recovery 72-file tracked specs pass the 37-test deployment suite; product
composition and 16-role manual resolution contracts are green; the synthetic
restore canary is green but has no actual Human acceptance. Actual manual
coverage is partial: eight Owner-PC candidate Markdown artifacts are digest-bound
but unexercised, and eight roles remain absent. The pure readiness binder therefore
returns `HOLD` for current public evidence. Device enrollment, credential/project
tuple, install receipt, Human acceptance and one-seat user exercise remain `HOLD`.

Linear automatic mutation, non-canary external send, automatic Official Done,
final technical acceptance, public release, Project AI Team scale-out, team-wide
rollout, numeric recovery promise and NAS recovery-ready claims remain excluded.
The exact physical device/credential/project tuple still requires the normal
canary Gate; this decision installs or activates nothing.

## Related plans

- [MCP client architecture](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [Physical package layout](15_FOLDER_COMPATIBILITY_MIGRATION.md)
- [Manual catalog](16_OPERATIONS_RUNBOOK_CATALOG.md)
- [Dogfood acceptance](13_TEST_DOGFOOD_ACCEPTANCE.md)
