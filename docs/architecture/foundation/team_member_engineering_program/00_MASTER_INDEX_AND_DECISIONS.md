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
| 17 | [Physical architecture, Path Registry, and Storage Map](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md) | Whole-estate root map, source-oriented catalog, migration guard, and 4192 storage view |

## Reader order

1. Read this index, then [01](01_SYSTEM_CONTEXT_AND_CROSSWALK.md) and [02](02_CURRENT_INVENTORY_AND_GAPS.md).
2. For an implementation leaf, read its functional owner document plus [13](13_TEST_DOGFOOD_ACCEPTANCE.md), [14](14_ROADMAP_GATES_AND_DAG.md), [15](15_FOLDER_COMPATIBILITY_MIGRATION.md), and [17](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md) when it creates, resolves, stores, backs up, restores, or moves data.
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
| The whole physical organization is fixed before further provider/product expansion. | Define root classes, Path Registry, source-oriented catalog, write guard, and 4192 Storage Map now; move existing payload only through later bounded migration leaves. |

## Explicit contradictions and non-decisions

| Topic | Evidence tension | This draft's treatment |
| --- | --- | --- |
| Forge / Vault / Guild / Watch / Bastion names | The product-family rebaseline calls its names `OWNER_DECISION_DRAFT`; existing package names such as `dev-erp` remain active compatibility paths. | Use the labels as logical seams only. No folder, package, database, route, or runtime rename follows from this suite. |
| Task ownership | The long-range product draft places Task & Decision near ERP, while the Owner direction places engineering work generation in Forge and current Official Task SoR in Linear. | Separate candidate/intent judgment (Forge), current official task/status (Linear), and future Vault/ERP catalog/read model. Do not select a new writer. |
| Engineering Engine `interface_consistency` status | Current tree contains the package, while a retained HOLD row says package creation remains. | Record it as a documentation contradiction. Re-audit before any dependency is taken on it; live/project acceptance remains HOLD either way. |
| Fable5 runtime observations | The advisory audit contains historical and private-runtime claims that are not reproducible from this public worktree. | Retain only its issue hypotheses and compare them to current public files/tests. Do not claim team-PC readiness from the audit. |
| Backup readiness | Public synthetic backup and restore contracts exist; actual connector capture and human restore acceptance are separately held. | Require live capture, isolated restore, reconciliation, and human acceptance before rollout. |
| Logical product map vs physical folder organization | Product seams and Packs exist, but current operational paths are lifecycle-oriented and the source/asset catalog view is not materialized. | Keep existing paths reference-in-place, add the organization spine in plan 17, and prohibit unregistered new paths. |

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
| OD-10 / R0–R3 | Path Registry schema/logical owner, private-binding writer, resolver runtime owner, operation-aware write-policy owner, exact root enum, materializer canary root, and 4192 projection owner | Owner assignments are settled; the public 41-row contract seed separates ERP `_workspaces` from the Bot execution work root and keeps activation sentinels until private binding/ACL/readback exists | No private binding registration, materializer physical apply, write-guard enforcement, served snapshot, or Storage Map readiness claim |

### OD-09 standing execution defaults and limits

After the plan/review start gate passes, later builders may continue safe, in-scope leaves without intermediate Owner confirmation: bounded public-safe implementation; reversible compatible detail decisions; manifests/schemas/adapters/fixtures/validators/manuals; local/synthetic/integration/E2E tests; isolated/default-OFF service/package install/smoke/upgrade/rollback; approved `secret_ref` use without plaintext inspection; existing-binding read-only collection/backup/isolated restore/reconciliation; and previously gated one-seat/one-project low-risk canaries. Clean accepted public leaves may be committed and non-force pushed by that later loop.

The standing conservative defaults are current Linear Official Task SoR, reference-in-place paths, no implicit fallback, proposal-only LLM, default-OFF/canary-first, and 4192 read/approval-request only. The delegation does not allow secret reading, purchase/contract/external commitment, non-canary outbound message, destructive/reset/force action, automatic Official Done/baseline/final technical acceptance/public release, cross-project private/raw copying, or bypass of missing credentials/hardware. See [13](13_TEST_DOGFOOD_ACCEPTANCE.md), [14](14_ROADMAP_GATES_AND_DAG.md), and [16](16_OPERATIONS_RUNBOOK_CATALOG.md) for the branch protocol.

### Decision ledger — recorded answers

| Date | Decision | Recorded answer | Evidence |
| --- | --- | --- | --- |
| 2026-08-30 | Plan/review start gate + OD-09 activation | The Human Owner issued the `SOULFORGE COMPLETE BUILD-TO-ACCEPTANCE LOOP` directive instructing a Fable5 program builder to freeze this suite and then continue implementation under the OD-09 standing delegation without intermediate confirmation. OD-01–OD-08 remain undecided and keep their blocking consequences. | Owner directive of 2026-08-30 in the Owner's session; fresh non-authoring completeness review verdict `ACCEPT_FOR_FREEZE` (0 blocker / 0 major; 9 draft findings applied in the freeze commit) |
| 2026-08-30 | D27/D28/D29 design-level defaults (for the leaf-2 contract/schema work only) | Under OD-09 and the Owner directive's reversible-decision rule, the build loop adopts each gate's proposed conservative default as the DESIGN decision for contract/schema authoring: D27 — pointer/reference first, service inbox is custody only, promotion is a separate sole writer; D28 — one active `{assignment_epoch, account}` primary, plural checkpoints, closeout is never Official Done; D29 — read-only surfaces, explicit project plus approved common revisions, no fallback. Alternatives (copy-first custody, multi-primary sessions, implicit-fallback queries) were rejected as authority-widening and harder to roll back. These remain schema-level choices: physical custody/promoter activation, team WorkSession activation, and any canonical bundle/accepted-history service still require their original gates (OD-01..03 blocking consequences unchanged) plus OD-08 physical tuples. | `guild_hall/engineering_mcp/` module (`npm run validate:engineering-mcp`), its README authority ceilings, and the leaf's fresh independent review |
| 2026-08-30 | Whole-estate physical organization before expansion | The Owner clarified that the concern is not Linear or Agents alone: every source, project, knowledge, asset, Agent, runtime, backup, receipt, and recovery surface needs a stable physical map so later Agents cannot scatter new paths. Structure/registry/guard/4192 projection are current priority; destructive relocation remains staged. | Owner conversation; plan 17 Owner-review draft; Ultra and Fable5 independent reviews requested before implementation |
| 2026-08-31 | R0 acceptance and OD-10 owner assignment | The Owner directed main integration and continued execution of the reviewed physical-spine plan. `guild_hall/path_registry` owns the public schema/logical entries, resolver runtime, and protected private-binding adapter contract; actual binding bytes stay under the private `control_root` sole writer. `guild_hall/bastion_action` owns operation-aware write-policy validation with Human Owner final authority. `guild_hall/watch_panel_contract` owns the 4192 storage-projection contract and Team Ops Board is the read-only consumer. The materializer canary uses logical ref `pathref:recovery.physical_spine_canary`; its private physical binding and ACL must pass before apply. | Owner directive in this CEO thread; Fable5 and Ultra plan-17 reviews; integrated R1–R3 contract evidence `8ddba7cf` + `dafc4fc3` |
| 2026-08-31 | Shared Ledger/RAG/mining north-star | The Owner directed that every product/portfolio preserve connected work/activity codes and exact time/actor/Agent/Tool/source/result/review/acceptance lineage so project closeout can reconstruct contribution, duration, bottleneck, rework, quality, cost, strengths, weaknesses and improvement candidates. Ledger is a shared plane, RAG is a rebuildable projection, and Process Mining/learning data is a separately approved versioned derivative rather than raw operational surveillance. | Owner directive in this CEO thread; product/ledger/RAG metadata audit at public `main@23be18a7`; fresh Ultra and Fable5 review required before implementation |
| 2026-08-31 | Ledger/RAG independent review integration | Fable 5 returned `ACCEPT_WITH_REVISIONS`; Sol Ultra returned `REVISE`. The integrated decision accepts the three-product/nine-portfolio/shared-plane north star and requires LR0 contract correction before LR1: Ledger Catalog taxonomy; case/activity issuer; assignment/run refs; effective clocks and typed relations; owner-local outbox/reconciliation; scoped Event Stores; project/common RAG and Dataset isolation; deny-by-default mining/learning/people analytics. Catalog rows and the payload-free golden trace are LR1 deliverable/exit gates, not circular pre-LR1 prerequisites. A fresh non-authoring Level-2 review of the corrected documents returned `ACCEPT`; LR1 start remains a Human Owner working-plan decision. | Owner-provided fresh advisory reports over `e283ab9a`; integrated decision in product rebaseline §27 and plan 14; private metadata-only review packet `ledger_rag_rebaseline_20260831_01` |
| 2026-08-31 | Buzz operating model and bounded Project Git Evidence Intake pilot | The Owner accepted Channel as instruction/collaboration source, Pulse as important-status projection, Project as collaboration/access scope, and Project Git as a source-local Agent Evidence submission surface. Linear remains Official Task current-state, Vault/ERP retains Artifact/Evidence acceptance, and AgentRun/Decision/Backup/Hermes memory remain separate. Only an explicit terminal receipt may create a read-only completion candidate; Git commit, AgentRun success, verified candidate, Human Acceptance, and Official Done never substitute for one another. One actual project pilot may create a private Buzz Project and metadata-only binding receipt, but Linear mutation, automatic Done, webhook, persistent coordinator, accepted-context promotion, and raw project payload copy remain `HOLD`. | Owner directive after the 2026-08-31 PLAUD team review; plan 07 operating contract; plan 14 bounded pilot gate; AI-platform CEO read-only owner-path review |

### Ledger/RAG review disposition

The reviews are advisory evidence, not authority by themselves. Their common
findings and accepted differences are stored as contract decisions instead of
copying raw prompts or reports into canon.

| Finding | Disposition |
| --- | --- |
| Product/portfolio direction is sound | `ACCEPT` — do not redesign the three products or nine portfolio map |
| Case/activity/assignment/run identity is incomplete | `ACCEPT_REVISION` — define issuer, applicability and wire fields before a writer |
| Activity taxonomy owner was missing from the shorter Fable exit list | `ACCEPT_REVISION` — originating domain owns meaning/version; shared ledger validates format |
| Domain-specific time/relation evidence exists but no cross-product contract exists | `ACCEPT_REVISION` — preserve domain owners and add shared clock/relation mapping |
| One enterprise SQLite is a valid target | `REJECT` — only one bounded project pilot may use SQLite; Catalog is central, stores are scoped |
| Cross-store source capture and central append are one transaction | `REJECT` — use authoritative owner-local transactional outbox plus idempotent relay/reconciliation |
| All Catalog rows and a golden trace must exist before LR1 begins | `REVISE_SEQUENCE` — they are LR1 deliverables and exit evidence; LR0 freezes their contract |
| Existing sufficient seams should be redesigned | `REJECT` — preserve Linear SoR, five-owner, reference-in-place, 4192 read-only and RAG authority separation |

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
| Whole physical architecture, source/asset catalog, Path Registry, and 4192 storage map | 17 | R1–R3 public contract implemented with 41-row held/reference seed, including separate ERP `_workspaces` and Bot execution work-root rows; private activation and migration remain gated |
| Cross-product Ledger, RAG outbox, project closeout analytics, Process Mining and learning datasets | product rebaseline §26, 02, 14, 15 | Current ledgers/RAG inventoried; integration contract and implementation remain review-gated |
| Independent Fable 5 + Sol Ultra Ledger/RAG review disposition | product rebaseline §27, 00 decision ledger, 14 LR0/LR1 gate | Architecture accepted; LR0 contract correction in progress; runtime/store/index/dataset effects remain HOLD |
| Current RED stabilization: owner scope, topology oracle, renderer writer, workflow symlink, path policy | 02, 13, 14 | Existing facts/contradictions preserved; first leaf selected |

## Source register and claim rule

The principal current source surfaces are `VISION_AND_GOALS.md`, `SOULFORGE_WORLD_BIBLE_V0.md`, `SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md`, `WORKSPACE_PROJECT_MODEL.md`, `PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`, `PROJECT_FILE_ACTIVITY_REVISION_V0.md`, `MULTI_PC_DEVELOPMENT_V0.md`, the Task Engine master plan, `dev-erp-mcp` source, ingress schemas/tests, the Engineering Engine assembly model, and Backup Controller documentation.

The Fable5 re-audit is advisory input only. This suite uses `CURRENT` only for directly inspected files or command output from this task. It uses `HISTORICAL_REPORTED` or `VERIFY_PHYSICAL` where a source asserts runtime facts that this task did not observe. The direct-source research delta is separately mapped in [03](03_VAULT_ERP_ASSET_REVISIONS.md) and [14](14_ROADMAP_GATES_AND_DAG.md); its NotebookLM lane is blocked pending an Owner interactive login and is not treated as corroboration.

## Boundaries

- No raw project material, mail body, transcripts, private bindings, credentials, absolute local paths, or private runtime truth are stored here.
- No new top-level root, schema, workflow, mission, task route, runtime configuration, or external state is created.
- This suite can be accepted as a plan only. It is not production-ready, an authority migration, a deployment approval, or a canon entry.
- Display terms coined here (Work Brief, TaskIntent, Agent Mark, Vault/Forge/Guild/Watch/Bastion and similar) are plan-local labels; at canonization they must be reconciled with `docs/architecture/foundation/SHARED_GLOSSARY_V0.md` rather than silently added as new vocabulary.
