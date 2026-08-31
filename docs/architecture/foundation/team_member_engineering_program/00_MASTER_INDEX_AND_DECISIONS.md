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

1. Owner·신입·fresh manager는 먼저 [Owner Master Architecture and Release Map](../SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md)을 읽고, 이 index와 [01](01_SYSTEM_CONTEXT_AND_CROSSWALK.md), [02](02_CURRENT_INVENTORY_AND_GAPS.md)로 내려간다.
2. For an implementation leaf, read its functional owner document plus [13](13_TEST_DOGFOOD_ACCEPTANCE.md), [14](14_ROADMAP_GATES_AND_DAG.md), [15](15_FOLDER_COMPATIBILITY_MIGRATION.md), and [17](17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md) when it creates, resolves, stores, backs up, restores, or moves data.
3. Treat any `CURRENT`, `TARGET`, `HOLD`, and `VERIFY_PHYSICAL` labels literally. A documented target is not a deployed service.

## Fixed Owner direction used by this draft

| Decision | Plan treatment |
| --- | --- |
| Shared Candidate Intake is distinct from ERP/Vault. | Model/domain-specific discovery may vary. The shared intake seam (`Forge` compatibility label) normalizes candidate provenance, evidence, dedupe, status and review routing; it does not own discovery strategy, accept artifacts or write Official Task status. |
| Vault/ERP is the Engineering asset, record, exact-revision, and accepted-result center. | It owns the future asset catalog/read model and revision/acceptance records, while exact byte stores remain separately named custody owners. |
| Linear remains the current Official Task SoR. | No task writer migration, task completion mutation, or new shadow task truth is authorized here. |
| Engineering MCP is a provider-neutral shared interface. | It is a control interface only; it is not a queue, truth owner, approval authority, binary store, or agent runtime. |
| Binary files use an authenticated HTTPS/data plane. | MCP JSON never carries bytes or base64. Manifest, ticket, receipt, and status are control-plane data. |
| Work generation, task, assignment, execution, delivery, review, acceptance, and promotion are distinct. | Every state machine and test gate preserves these separate receipts. |
| Project-specific AI managers and context remain separate. | Guild identity and deployment can be shared only through explicit grants; no implicit cross-project context retrieval exists. |
| Soulforge Operations Console (`4192` compatibility handle) is a projection and approval-request surface. | It has no deep Bot state copy, dispatcher, task writer, policy writer, or recovery-writer authority. |
| Human authoring folders are manually managed. | The company may provide a standard folder convention, but people manage it themselves; Agents do not monitor, auto-ingest or enforce it. Managed file truth begins at accepted ERP `_workspaces` materialization. |
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

This register preserves both unresolved authority choices and settled/deferred
Owner directions. A later builder follows the explicit status and blocks only
the remaining consequence; it must not re-ask or infer a settled/deferred row.

| ID | Status | Decision or gate | Current Owner direction | Remaining blocking consequence |
| --- | --- | --- | --- | --- |
| OD-01 / D27 | `OPEN` | Per-source custody, quarantine/promoter, retention/legal hold, scan, ACL, backup, delete authority | Pointer/reference first; service inbox is custody only; promotion is a separate sole writer | No physical upload promotion or project byte copy |
| OD-02 / D28 | `OPEN` | WorkSession actor chain, node/thread capability, outbox protection/SLA, handoff, completion approver | One active `{assignment_epoch, account}` primary; checkpoints plural; closeout is never Official Done | No team WorkSession activation |
| OD-03 / D29 | `OPEN` | Accepted-generation pointer, query ACL/existence policy, exact revision downloads, team candidate authority | ERP UI/MCP read only; explicit project plus approved common revision; no fallback | No canonical input-bundle service or accepted-history query |
| OD-04 / D35 | `OPEN` | Client plugin package, trust, active binding, hooks, local outbox lifecycle | Feature-OFF per-PC client with visible binding state and OS-protected credentials | No client install or hook activation |
| OD-05 / D36 | `OPEN` | Project context writer and ERP read-model owner | One append writer; ERP/MCP are projection/query only | No persistent accepted-context feedback writer |
| OD-06 | `CONFIRMED_MEASUREMENT_HOLD` | Numeric RPO/RTO and recovery evidence retention by data class | Restore order and acceptors are settled; measure the first synthetic isolated restore before setting numeric targets | No numeric RPO/RTO or team-wide recovery promise before measurement |
| OD-07 | `OWNER_DEFERRED` | Product/pack names and user-facing labels | Naming fields are separated; actual product/brand/Game UX names wait for the later naming stage | No rename or release branding before the re-entry trigger |
| OD-08 | `CONFIRMED_DIRECTION / HOLD_PHYSICAL_TUPLE` | Each physical site, credential, source scope, and low-risk pilot tuple | First target is Owner PC one-seat with team-equivalent setup | No actual network, connector, or team rollout until the exact site/device/credential/project tuple and expiry pass |
| OD-09 | `CONFIRMED` | Standing execution delegation after plan/review start gate | Continue all safe in-scope leaves using frozen canon, existing interfaces, and the conservative defaults below; do not repeat settled Owner questions | Only the affected branch blocks when excluded authority, credential, or physical state is genuinely required |
| OD-10 / R0–R3 | `CONFIRMED_CONTRACT / HOLD_PHYSICAL_ACTIVATION` | Path Registry schema/logical owner, private-binding writer, resolver runtime owner, operation-aware write-policy owner, exact root enum, materializer canary root, and 4192 projection owner | Owner assignments are settled; the public 41-row contract seed separates ERP `_workspaces` from the Bot execution work root and keeps activation sentinels until private binding/ACL/readback exists | No private binding registration, materializer physical apply, write-guard enforcement, served snapshot, or Storage Map readiness claim |
| OD-11 | `CONFIRMED_V0 / HOLD_LIVE_INTEGRATION` | Authority risk/action class taxonomy, default evidence threshold, rate limit and expiry policy | Reuse exact A0–A6; bind separate `R0~R4` and `EV1~EV3`. R0 effect 0; R1/R2 exact scope, one effect, max four hours; R2 separate Human approval; R3 non-grantable; R4 authoring forbidden; JM/model/effort never grant | Pure contract may validate candidates only. No ERP writer, Bastion runtime, Console mutation, auto-Done, physical dispatch or external effect until their separate Gates pass |

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
| 2026-08-31 | Product source composition and ownership recheck | The Owner directed that ERP, Engineering Engine and Agent Platform each need a visible product source home, while a shared Module keeps one owner/Implementation and is consumed through a versioned Interface rather than copied. Fresh audit found the overnight Fable5 work completed 29 enrolled Module manifests, cycle-free Module operability, five Pack contracts/four tracked specs and plans 00–17, but no three-product `product.manifest` or physical product-first source roots. Plan 15 now owns PC0–PC6: no-move composition manifests first, product/shared classification and release closure next, and an Owner root/migration decision only after compatibility/rollback proof. | Owner direction in this thread; fresh `main@af8f0323` source/manifest/Pack inventory; plan 02 audit and plan 15 product-composition target |
| 2026-08-31 | Owner Master Map M0–M16 working baseline | The Owner accepted the comprehensive explanation as the new one-page navigation baseline. The exact 18-point correction trace is owned by the Master Map instead of being partially repeated here. This historical row is superseded by the later Fresh Grill rows: names are Owner-deferred, product-root placement waits for PC4, release/foldertree/recovery directions are bounded, and authority risk/action taxonomy remains OD-11 `OPEN`. `Master M0`–`M16`, `Roadmap M*`, and ERP BOM `L*` are qualified namespaces. | Owner directive in this thread; `SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md` §Owner 18-point correction trace |
| 2026-08-31 | Owner Master Map Fable 5 continuity review integration | Fable 5 returned `ACCEPT_WITH_REVISIONS` over `28ec185b`. The accepted corrections repair the 18-point trace, sf-p05 name drift, Master/Roadmap ID collision, project RAG/analytics generic-path drift, current/target `_workmeta` ambiguity, manual projection ownership, adjacent-RC roadmap placement and post-Grill lane registration. Alias/Mission/Buzz Git, AuthorityPolicy sole writer, restore acceptor and human-work-root classification remain explicitly registered `OPEN_GRILL` questions. The review does not approve final names, physical bindings, releases or runtime activation. | Owner-provided Fable 5 advisory report; integrated Master Map and owner-plan corrections |
| 2026-08-31 | Fresh Grill naming and Operations Console closure | The Owner separated stable IDs, functional descriptions, software brands, fantasy Skin labels and compatibility handles. `Soulforge Operations Console` is the official functional description, `4192` remains the compatibility handle, and the introduction pattern is `[software name] — Soulforge Operations Console`. Product/portfolio/software brand and Monster/Quest/Mission/Boss/Reward semantics are `OWNER_DEFERRED` until internal structure stabilizes and a separate naming/Game UX stage opens; they must not be rebound to code, paths or authority before then. | Human Owner Fresh Grill over exact public base `c1f2ff453e7e137725924cd1352c5153c472c5ec`; shared-understanding confirmation and explicit Grill exit |
| 2026-08-31 | Fresh Grill source, candidate-intake and authority closure | The long-range source principle is visible product-specific homes plus a Shared area, with no move before manifests, Interface/caller closure, compatibility and rollback evidence. Model/domain discovery remains independent; a product-neutral Shared Candidate Intake seam normalizes candidate evidence and routing before ERP promotion. ERP AuthorityPolicy store is the canonical sole writer, Bastion validates/enforces and owns STOP, and Operations Console is request/read only. Authority risk/action taxonomy remains OD-11 `OPEN`. No source root, schema, writer or runtime is activated by this decision. | Human Owner Fresh Grill; Master Map decision closure |
| 2026-08-31 | Fresh Grill internal RC, SE and recovery closure | The first target is an Owner-PC one-seat RC with team-equivalent setup: install/doctor, binding readback, approved Task/material read, Buzz/MCP delivery, local result/Evidence candidate, review/HOLD and coarse Console status. Linear auto-write, external auto-send, auto Done, final acceptance/release and team rollout are excluded. New `체계개발/LIG 넥스원/A` projects are first for foldertree application; existing projects require per-project dry-run and approval. Recovery starts with a synthetic isolated restore accepted by Owner, then one approved low-risk project accepted by its project owner; the Backup operator cannot self-accept and numeric RPO/RTO wait for measured evidence. | Human Owner Fresh Grill; Master Map M7, M11 and M16 closure |
| 2026-08-31 | Fresh Grill manual and work-surface closure | Manual truth is Markdown plus versioned images, with an interactive HTML book as the default projection and an accessible linear view/print PDF from the same source. Buzz Project Git uses a project-shared integration clone plus role-isolated Agent worktrees under the Bot work root, never ERP `_workspaces` or human authoring folders. Human folders may follow a company convention but remain person-managed and unmonitored; ERP management begins when reviewed/accepted material is materialized in `_workspaces`. No clone, folder, physical binding, monitoring, collection or backup action is authorized. | Human Owner Fresh Grill; Master Map M6 and M15 closure |
| 2026-08-31 | Fresh Grill multi-review integration | Fresh Sol/high and Fable 5/xhigh returned `ACCEPT` after decision-state, sole-writer, detail-owner and Roadmap corrections. GPT Pro returned advisory `ACCEPT_WITH_REVISIONS`: architecture and authority separation stay fixed, while the Master Map needs a shallower first-reader layer. The accepted presentation-only delta adds a five-minute overview, Golden Journey, release banner, cross-product explanation, authority matrix, three-axis status display and plain-language glossary. It does not add a product, Module, owner, writer, root, runtime, authority or release claim. | Exact review branch commits through `e6fe3240`; fresh Sol/Fable read-only verdicts; marker-verified GPT Pro DOM advisory, claim ceiling advisory only |
| 2026-08-31 | OD-11 conservative authority taxonomy v0 | The Owner directed the program to decide OD-11 and continue productization. Existing `A0~A6` remains the effect-shape axis and `JM0~JM6` remains judgment maturity only. New risk `R0~R4` and evidence `EV1~EV3` axes are adopted with stricter-only policy: R0 effect 0; R1/R2 exact project/subject/action scope, one effect and at most four hours; R2 requires a distinct exact Human approval; R3 is non-grantable in v0; R4 external/financial/baseline/final-acceptance/credential-ACL/destructive/promotion/redelegation actions are unrepresentable. STOP is subtract-only. | Owner directive in this thread; `guild_hall/authority_taxonomy` pure/default-OFF contract; Opus 5 read-only ASSIST; focused tests 34/34 |
| 2026-08-31 | Parallel Internal RC contract build | Three no-move product manifests now classify the exact enrolled set as 7 Product-owned + 23 Shared Modules with release/root migration held. Manual code/catalog now match all 16 semantic roles, but every actual manual remains `HOLD/manual_absent`. A temp-only synthetic recovery canary proves create-only backup/readback/isolated restore and rejects self-acceptance; no actual Human acceptance, NAS, RPO/RTO or recovery-ready claim exists. | `validate:product-composition` 4/4 + preflight; `validate:manual-release` 11/11; `validate:synthetic-recovery-canary` 17/17; `validate:module-operability` 8/8 at 30 manifests |
| 2026-09-01 | Owner-PC manual candidates and prephysical readiness | All 16 semantic roles now have public-safe Markdown candidate artifacts and exact digests. Candidate manuals are distinct from release-ready manuals and remain blocked by missing exercise/last-verified receipts. A pure renderer produces deterministic accessible HTML only, and a pure readiness binder reports current public evidence as `HOLD`; only a fully supplied synthetic exact packet can reach `READY_FOR_ONE_PHYSICAL_SEAT_GATE`. | `validate:manual-release` 12/12; `validate:manual-projection` 5/5; `validate:internal-rc-prephysical` 5/5; no physical install, Human acceptance or release effect |
| 2026-09-01 | Main Node and Universal Client correction/canary | Corrected the physical topology: the current high-performance PC is the Main Node; future Owner/team Windows PCs use identical Universal Client bytes with capability-based views. The active runtime was cut over without a PC reboot to versioned server-pack/source-lane roots, with the previous runtime and task/config/state definitions retained in recovery. Universal Client replaced the former 4192-heavy Team Client closure; 4192 remains Main Node operations UI. | HPP `0.1.1` 1,018-file installed smoke/backup-restore PASS; Client source Pack `0.2.0` 19-file installed-copy smoke/backup-restore PASS; three virtual seats E2E PASS; external physical seat/NAS/Human acceptance HOLD |

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
| Team Client Pack and local workspace | 05, 12, 15 | Owner-PC one-seat RC scope confirmed; physical install and exact tuple HOLD |
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
| Deployment, education, support | 12, 16 | Markdown/image manual source and interactive HTML-book projection confirmed; artifact/release implementation TARGET |
| Test/dogfood/field pilot loop | 13, 14 | Required gate sequence |
| Fable5 build packet and dependency DAG | 14 | Copy-ready packet and stop semantics |
| Physical source/runtime/Bot folder packaging | 15 | Reference-in-place and private-alias inventory only |
| Whole physical architecture, source/asset catalog, Path Registry, and 4192 storage map | 17 | R1–R3 public contract implemented with separate ERP `_workspaces` and Bot execution roots; human authoring remains manual-only/unmonitored and private activation/migration remain gated |
| Cross-product Ledger, RAG outbox, project closeout analytics, Process Mining and learning datasets | product rebaseline §26, 02, 14, 15 | Current ledgers/RAG inventoried; integration contract and implementation remain review-gated |
| Independent Fable 5 + Sol Ultra Ledger/RAG review disposition | product rebaseline §27, 00 decision ledger, 14 LR0/LR1 gate | Architecture accepted; LR0 contract correction in progress; runtime/store/index/dataset effects remain HOLD |
| Product-specific source homes plus Shared Modules | 02, 14, 15 | Product-home+Shared principle confirmed; PC0 audit complete; manifests, exact PC4 root and physical migration remain TARGET/HOLD |
| Owner Fresh Grill decision closure | Master Map, 00, 04, 07–09, 12, 14–17 | Decisions and explicit deferrals recorded; implementation, naming, physical binding, recovery-ready and release claims remain 0/HOLD |
| Current RED stabilization: owner scope, topology oracle, renderer writer, workflow symlink, path policy | 02, 13, 14 | Existing facts/contradictions preserved; first leaf selected |

## Source register and claim rule

The principal current source surfaces are `VISION_AND_GOALS.md`, `SOULFORGE_WORLD_BIBLE_V0.md`, `SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md`, `WORKSPACE_PROJECT_MODEL.md`, `PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`, `PROJECT_FILE_ACTIVITY_REVISION_V0.md`, `MULTI_PC_DEVELOPMENT_V0.md`, the Task Engine master plan, `dev-erp-mcp` source, ingress schemas/tests, the Engineering Engine assembly model, and Backup Controller documentation.

The Fable5 re-audit is advisory input only. This suite uses `CURRENT` only for directly inspected files or command output from this task. It uses `HISTORICAL_REPORTED` or `VERIFY_PHYSICAL` where a source asserts runtime facts that this task did not observe. The direct-source research delta is separately mapped in [03](03_VAULT_ERP_ASSET_REVISIONS.md) and [14](14_ROADMAP_GATES_AND_DAG.md); its NotebookLM lane is blocked pending an Owner interactive login and is not treated as corroboration.

## Boundaries

- No raw project material, mail body, transcripts, private bindings, credentials, absolute local paths, or private runtime truth are stored here.
- No new top-level root, schema, workflow, mission, task route, runtime configuration, or external state is created.
- This suite can be accepted as a plan only. It is not production-ready, an authority migration, a deployment approval, or a canon entry.
- Display terms coined here (Work Brief, TaskIntent, Agent Mark, Vault/Forge/Guild/Watch/Bastion and similar) are plan-local labels; at canonization they must be reconciled with `docs/architecture/foundation/SHARED_GLOSSARY_V0.md` rather than silently added as new vocabulary.
