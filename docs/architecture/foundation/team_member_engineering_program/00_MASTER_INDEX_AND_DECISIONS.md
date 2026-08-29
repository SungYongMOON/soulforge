# Team Member Engineering Program — Master Index and Owner Decisions

## Status and use

| Field | Value |
| --- | --- |
| State | `OWNER_REVIEW_DRAFT` / `canon_candidate` at most |
| Scope | Public-safe architecture, implementation, validation, and rollout plan only |
| Effective date | 2026-08-30 |
| Current implementation change | None — this suite does not activate a service, connector, credential, writer, or client |
| Authority | Human Owner accepts product seams, physical activation, credentials, technical acceptance, baseline changes, and Official Done |
| Requested execution profile | `gpt-5.6-terra` / `max` |
| Observed execution profile | `UNKNOWN`; runtime did not expose a verifiable value in this task |

This is the implementation map for the Owner direction that a team member must be able to receive approved work and exact approved material, work on a local PC, and return a reviewable result without turning MCP, a client, a delivery receipt, or an AI completion into an approval.

The suite is intentionally split so a later program builder can open the smallest relevant view. The concise filenames meet the repository path-length policy; each row maps to the requested longer document role.

| # | Plan document | Requested view |
| --- | --- | --- |
| 00 | This file | Master index, owner decisions, requirements trace |
| 01 | [System context and crosswalk](01_SYSTEM_CONTEXT_AND_CROSSWALK.md) | System context, product family, World Bible crosswalk |
| 02 | [Current inventory and gaps](02_CURRENT_INVENTORY_AND_GAPS.md) | Current implementation, folder inventory, audited gaps |
| 03 | [Vault / ERP asset revisions](03_VAULT_ERP_ASSET_REVISIONS.md) | Asset, revision, acceptance, information-owner architecture |
| 04 | [Forge AX/SE work and engine](04_FORGE_AX_SE_WORK_AND_ENGINE.md) | Work generation, TaskIntent, Work Brief, engineering judgment |
| 05 | [Engineering MCP, client, data plane](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md) | Team member journey, MCP minimum v0, binary transfer, WorkSession |
| 06 | [Guild Agent Mark and runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md) | AI workforce, Agent Mark, Deployment, Run |
| 07 | [Buzz / Hermes collaboration](07_BUZZ_HERMES_COLLABORATION.md) | Human-agent collaboration and gateway operations |
| 08 | [Watch / 4192 operations](08_WATCH_4192_OPERATIONS.md) | Coarse read projection and approval-request surface |
| 09 | [Bastion security and recovery](09_BASTION_SECURITY_RECOVERY.md) | Identity, custody, backup, restore, recovery gates |
| 10 | [External connectors and backup](10_EXTERNAL_CONNECTORS_AND_BACKUP.md) | Linear, collaboration, source, storage, and backup seams |
| 11 | [Tool workshops](11_TOOL_WORKSHOPS_AND_JOB_SHOP.md) | Capacity-one specialist tool and resource-job-shop model |
| 12 | [Deployment, rollout, support](12_DEPLOYMENT_ROLLOUT_SUPPORT.md) | Packs, device profile, training, support, update rings |
| 13 | [Test, dogfood, acceptance](13_TEST_DOGFOOD_ACCEPTANCE.md) | Deterministic validation and staged field proof |
| 14 | [Roadmap, gates, DAG](14_ROADMAP_GATES_AND_DAG.md) | Build order, gate register, Fable5 build packet |
| 15 | [Folder compatibility and migration](15_FOLDER_COMPATIBILITY_MIGRATION.md) | Reference-in-place physical path crosswalk and reuse matrix |
| 16 | [Operations manual catalog](16_OPERATIONS_RUNBOOK_CATALOG.md) | Required operator and user manuals |

## Reader order

1. Read this index, then [01](01_SYSTEM_CONTEXT_AND_CROSSWALK.md) and [02](02_CURRENT_INVENTORY_AND_GAPS.md).
2. For an implementation leaf, read its functional owner document plus [13](13_TEST_DOGFOOD_ACCEPTANCE.md), [14](14_ROADMAP_GATES_AND_DAG.md), and [15](15_FOLDER_COMPATIBILITY_MIGRATION.md).
3. Treat any `CURRENT`, `TARGET`, `HOLD`, and `VERIFY_PHYSICAL` labels literally. A documented target is not a deployed service.

## Fixed Owner direction used by this draft

| Decision | Plan treatment |
| --- | --- |
| Forge is distinct from ERP/Vault. | Forge produces engineering work candidates, TaskIntent, Work Brief, and role proposals from accepted facts and engineering knowledge. It does not accept artifacts or write Official Task status. |
| Vault/ERP is the Engineering asset, record, exact-revision, and accepted-result center. | It owns the future asset catalog/read model and revision/acceptance records, while exact byte stores remain separately named custody owners. |
| Linear remains the current Official Task SoR. | No task writer migration, task completion mutation, or new shadow task truth is authorized here. |
| Engineering MCP is a provider-neutral shared interface. | It is a control interface only; it is not a queue, truth owner, approval authority, binary store, or agent runtime. |
| Binary files use an authenticated HTTPS/data plane. | MCP JSON never carries bytes or base64. Manifest, ticket, receipt, and status are control-plane data. |
| Work generation, task, assignment, execution, delivery, review, acceptance, and promotion are distinct. | Every state machine and test gate preserves these separate receipts. |
| Project-specific AI managers and context remain separate. | Guild identity and deployment can be shared only through explicit grants; no implicit cross-project context retrieval exists. |
| 4192 is a projection and approval-request surface. | It has no deep Bot state copy, dispatcher, task writer, or recovery-writer authority. |
| No automatic external send, purchase, technical acceptance, baseline, Official Done, or knowledge promotion. | Those effects require later owner-specific action gates. |

## Explicit contradictions and non-decisions

| Topic | Evidence tension | This draft's treatment |
| --- | --- | --- |
| Forge / Vault / Guild / Watch / Bastion names | The product-family rebaseline calls its names `OWNER_DECISION_DRAFT`; existing package names such as `dev-erp` remain active compatibility paths. | Use the labels as logical seams only. No folder, package, database, route, or runtime rename follows from this suite. |
| Task ownership | The long-range product draft places Task & Decision near ERP, while the Owner direction places engineering work generation in Forge and current Official Task SoR in Linear. | Separate candidate/intent judgment (Forge), current official task/status (Linear), and future Vault/ERP catalog/read model. Do not select a new writer. |
| Engineering Engine `interface_consistency` status | Current tree contains the package, while a retained HOLD row says package creation remains. | Record it as a documentation contradiction. Re-audit before any dependency is taken on it; live/project acceptance remains HOLD either way. |
| Fable5 runtime observations | The advisory audit contains historical and private-runtime claims that are not reproducible from this public worktree. | Retain only its issue hypotheses and compare them to current public files/tests. Do not claim team-PC readiness from the audit. |
| Backup readiness | Public synthetic backup and restore contracts exist; actual connector capture and human restore acceptance are separately held. | Require live capture, isolated restore, reconciliation, and human acceptance before rollout. |

## Owner decision register

These are the only authority choices still needed to move from a plan candidate to bounded implementation. A later builder must stop at the relevant row rather than infer it.

| ID | Decision required | Default proposed for review | Blocking consequence if undecided |
| --- | --- | --- | --- |
| OD-01 / D27 | Per-source custody, quarantine/promoter, retention/legal hold, scan, ACL, backup, delete authority | Pointer/reference first; service inbox is custody only; promotion is a separate sole writer | No physical upload promotion or project byte copy |
| OD-02 / D28 | WorkSession actor chain, node/thread capability, outbox protection/SLA, handoff, completion approver | One active `{assignment_epoch, account}` primary; checkpoints plural; closeout is never Official Done | No team WorkSession activation |
| OD-03 / D29 | Accepted-generation pointer, query ACL/existence policy, exact revision downloads, team candidate authority | ERP UI/MCP read only; explicit project plus approved common revision; no fallback | No canonical input-bundle service or accepted-history query |
| OD-04 / D35 | Client plugin package, trust, active binding, hooks, local outbox lifecycle | Feature-OFF per-PC client with visible binding state and OS-protected credentials | No client install or hook activation |
| OD-05 / D36 | Project context writer and ERP read-model owner | One append writer; ERP/MCP are projection/query only | No persistent accepted-context feedback writer |
| OD-06 | Numeric RPO/RTO and recovery evidence retention by data class | Set after custody and operational constraints are named | No team-wide recovery promise |
| OD-07 | Product/pack names and user-facing labels | Keep logical labels and existing paths until separately approved | No rename or release branding |
| OD-08 | Each physical site, credential, source scope, and low-risk pilot tuple | One seat, one project, bounded file/work item, explicit expiry | No actual network, connector, or team rollout |
| OD-09 | Standing execution delegation after plan/review start gate | Continue all safe in-scope leaves using frozen canon, existing interfaces, and the conservative defaults below; do not repeat settled Owner questions | Only the affected branch blocks when excluded authority, credential, or physical state is genuinely required |

### OD-09 standing execution defaults and limits

After the plan/review start gate passes, later builders may continue safe, in-scope leaves without intermediate Owner confirmation: bounded public-safe implementation; reversible compatible detail decisions; manifests/schemas/adapters/fixtures/validators/manuals; local/synthetic/integration/E2E tests; isolated/default-OFF service/package install/smoke/upgrade/rollback; approved `secret_ref` use without plaintext inspection; existing-binding read-only collection/backup/isolated restore/reconciliation; and previously gated one-seat/one-project low-risk canaries. Clean accepted public leaves may be committed and non-force pushed by that later loop.

The standing conservative defaults are current Linear Official Task SoR, reference-in-place paths, no implicit fallback, proposal-only LLM, default-OFF/canary-first, and 4192 read/approval-request only. The delegation does not allow secret reading, purchase/contract/external commitment, non-canary outbound message, destructive/reset/force action, automatic Official Done/baseline/final technical acceptance/public release, cross-project private/raw copying, or bypass of missing credentials/hardware. See [13](13_TEST_DOGFOOD_ACCEPTANCE.md), [14](14_ROADMAP_GATES_AND_DAG.md), and [16](16_OPERATIONS_RUNBOOK_CATALOG.md) for the branch protocol.

### Decision ledger — recorded answers

| Date | Decision | Recorded answer | Evidence |
| --- | --- | --- | --- |
| 2026-08-30 | Plan/review start gate + OD-09 activation | The Human Owner issued the `SOULFORGE COMPLETE BUILD-TO-ACCEPTANCE LOOP` directive instructing a Fable5 program builder to freeze this suite and then continue implementation under the OD-09 standing delegation without intermediate confirmation. OD-01–OD-08 remain undecided and keep their blocking consequences. | Owner directive of 2026-08-30 in the Owner's session; fresh non-authoring completeness review verdict `ACCEPT_FOR_FREEZE` (0 blocker / 0 major; 9 draft findings applied in the freeze commit) |
| 2026-08-30 | D27/D28/D29 design-level defaults (for the leaf-2 contract/schema work only) | Under OD-09 and the Owner directive's reversible-decision rule, the build loop adopts each gate's proposed conservative default as the DESIGN decision for contract/schema authoring: D27 — pointer/reference first, service inbox is custody only, promotion is a separate sole writer; D28 — one active `{assignment_epoch, account}` primary, plural checkpoints, closeout is never Official Done; D29 — read-only surfaces, explicit project plus approved common revisions, no fallback. Alternatives (copy-first custody, multi-primary sessions, implicit-fallback queries) were rejected as authority-widening and harder to roll back. These remain schema-level choices: physical custody/promoter activation, team WorkSession activation, and any canonical bundle/accepted-history service still require their original gates (OD-01..03 blocking consequences unchanged) plus OD-08 physical tuples. | `guild_hall/engineering_mcp/` module (`npm run validate:engineering-mcp`), its README authority ceilings, and the leaf's fresh independent review |

### Standing decision ledger location

The owner decision register in this document is the standing decision ledger that later builders must consult before asking again. A settled decision appends a dated answer and evidence ref to its `OD-xx` row (or a dated subsection under it) in this file, in the same change that first relies on it. Bounded per-leaf build decisions, alternatives, and reviewer findings live in that leaf's traceability record defined by [13](13_TEST_DOGFOOD_ACCEPTANCE.md); private evidence stays metadata-only on the `_workmeta/system` reporting surface. No separate ledger file or new root is created for this purpose.

## Requirements trace

| Requirement source | Covered by | Status in this draft |
| --- | --- | --- |
| Owner workflow from accepted material through human acceptance | 03, 04, 05, 13 | Planned; implementation HOLD |
| Five-owner SoR and ArtifactRevision | 03 | Target architecture and gate rules |
| Team Client Pack and local workspace | 05, 12, 15 | Target architecture and deployment rules |
| MCP tool/resource minimum, compatibility, binary plane | 05 | Current reuse and v0 target separated |
| WorkSession, offline/replay, completion separation | 05, 13 | Feature-OFF foundation identified; activation HOLD |
| Security, mTLS, delegated actor chain, revocation | 05, 09 | Synthetic foundation observed; physical activation HOLD |
| AI workforce assets and Agent Mark lineage | 03, 06 | Vault catalog and Guild operational owner separated |
| Chat-created ledgers and scheduled operations | 03, 07, 10 | Immutable capture generation before accepted projection |
| Research-driven ERP Context architecture | 03, 04, 14 | Direct source comparison mapped; NotebookLM lane blocked |
| Detachable modules, packs, release train, SBOM, rollback | 12, 15 | Target contract; no pack deployment claimed |
| Fable5 build/review/release traceability | 13, 14 | Required for every later build leaf |
| Standing no-intermediate-wait delegation and branch-block protocol | 00, 13, 14, 16 | Safe leaves continue; excluded authority blocks only its branch |
| Linear, communications, Drive, Git, NAS integration | 10 | Source-by-source plan; real connection HOLD |
| 4192 scope correction | 08 | Read projection only; deep Buzz pointer boundary preserved |
| Specialist tools and capacity-one execution | 06, 11 | Target; no workshop runtime claim |
| Deployment, education, support | 12, 16 | Target manuals and rollout gates |
| Test/dogfood/field pilot loop | 13, 14 | Required gate sequence |
| Fable5 build packet and dependency DAG | 14 | Copy-ready packet and stop semantics |
| Physical source/runtime/Bot folder packaging | 15 | Reference-in-place and private-alias inventory only |
| Current RED stabilization: owner scope, topology oracle, renderer writer, workflow symlink, path policy | 02, 13, 14 | Existing facts/contradictions preserved; first leaf selected |

## Source register and claim rule

The principal current source surfaces are `VISION_AND_GOALS.md`, `SOULFORGE_WORLD_BIBLE_V0.md`, `SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md`, `WORKSPACE_PROJECT_MODEL.md`, `PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`, `PROJECT_FILE_ACTIVITY_REVISION_V0.md`, `MULTI_PC_DEVELOPMENT_V0.md`, the Task Engine master plan, `dev-erp-mcp` source, ingress schemas/tests, the Engineering Engine assembly model, and Backup Controller documentation.

The Fable5 re-audit is advisory input only. This suite uses `CURRENT` only for directly inspected files or command output from this task. It uses `HISTORICAL_REPORTED` or `VERIFY_PHYSICAL` where a source asserts runtime facts that this task did not observe. The direct-source research delta is separately mapped in [03](03_VAULT_ERP_ASSET_REVISIONS.md) and [14](14_ROADMAP_GATES_AND_DAG.md); its NotebookLM lane is blocked pending an Owner interactive login and is not treated as corroboration.

## Boundaries

- No raw project material, mail body, transcripts, private bindings, credentials, absolute local paths, or private runtime truth are stored here.
- No new top-level root, schema, workflow, mission, task route, runtime configuration, or external state is created.
- This suite can be accepted as a plan only. It is not production-ready, an authority migration, a deployment approval, or a canon entry.
- Display terms coined here (Work Brief, TaskIntent, Agent Mark, Vault/Forge/Guild/Watch/Bastion and similar) are plan-local labels; at canonization they must be reconciled with `docs/architecture/foundation/SHARED_GLOSSARY_V0.md` rather than silently added as new vocabulary.
