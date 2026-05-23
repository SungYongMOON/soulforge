# CHANGELOG

## 2026-05-23

### Revision `working` - Grill Me candidate skill added

- Added `.registry/skills/grill_me/` as a tracked candidate Codex skill for `/grill-me` style plan pressure-testing and design-decision interviews.
- Kept the package as a Soulforge implementation of the interview pattern rather than copying external product runtime content.
- Documented the installed mirror target as `soulforge-grill-me` through the existing skill sync flow.

## 2026-05-22

### Revision `working` - P26-014 masked KVDS mail routing added

- Updated gateway mail priority routing so KVDS/기뢰탐색음탐기 exact matches route to official `P26-014`, including masked `기X탐` subject prefixes such as `기0탐` and `기ㅇ탐`.
- Updated the mail work status contract sample and P26-014 private routing rule to keep the former P26-030 working label from capturing new KVDS 체계개발 mail.

### Revision `working` - HWP normalization-first rule added

- Added `HWP_NORMALIZATION_V0.md` as the public-safe rule that HWP source files are not body-analysis targets until re-saved/exported as HWPX derivatives.
- Clarified workspace/workmeta contracts so HWP originals, HWPX exports, and optional PDF/text companions stay in `_workspaces` or owner-approved shared worksite storage while `_workmeta` records only inventory, queue, hash, status, extraction summary, and comparison metadata.
- Kept password entry owner-controlled, NAS/source originals read-only, and P25/reference examples below official/current/approved/accepted authority claims.

### Revision `working` - Workspace root junction exclusion rule clarified

- Clarified that shared cloud/company roots are external link targets, not `_workspaces/company` direct-child materialization roots.
- Updated `_workspaces`, workspace model, installation, and multi-PC docs so other PCs remove stale root junction pointers locally while preserving the shared worksite target.
- Kept project payloads, host-local absolute paths, private binding values, and real workspace contents out of public canon.

### Revision `working` - Recurring project ledger update canon added

- Added `PROJECT_LEDGER_UPDATE_V0.md` as the public-safe procedure for treating owner-provided recurring company PJT ledger workbooks as private project-registration source inputs.
- Clarified that workbook payloads, real project lists, actual project codes, project names, 담당자 values, customer names, row dumps, and host-local OneDrive paths stay out of public repo.
- Extended the workmeta contract schema with optional ledger, workspace materialization, responsibility, schedule, and status hint fields for private metadata projection.
- Linked the recurring ledger rule from workspace onboarding, workspace project model, workspace docs index, and `_workspaces/README.md`.

### Revision `working` - `_workmeta` raw payload storage boundary clarified

- Clarified that `_workmeta` stores metadata, run records, evidence summaries, pointers, sizes, hashes, source notes, and relocation manifests, not actual source/reference files.
- Routed HWP/HWPX, Word, Excel, PowerPoint, PDF, archive, and mail payload files to `_workspaces` or owner-approved shared worksite storage.
- Updated workspace/workmeta contracts and procedure-capture rules so future SE reference packets keep raw files out of `_workmeta`.

### Revision `working` - Knowledge graph view v0 added

- Added a metadata-only knowledge graph view model for one-variable/one-meaning visual encoding, source trace, graph scope, layout presets, and the Obsidian canon read view versus operations graph view split.
- Added `guild_hall/knowledge_graph` to generate local `_workspaces/system/knowledge_view/**` graph JSON, adjustable HTML preview, and Obsidian-readable read-only notes from public canon metadata plus explicit knowledge-access ledger refs.
- Upgraded the default generated HTML preview to a bundled Three.js 3D graph while keeping `graph_preview_2d.html` as the SVG fallback view.
- Added generated connectivity diagnostics to `graph.json`, the 3D preview sidebar, and the Obsidian graph index so sparse layouts can be checked by component count, isolated nodes, relation counts, and extraction-scope gaps.
- Fixed generated graph tooltip positioning so hover cards use graph-panel-relative coordinates and stay near the hovered node instead of drifting by the sidebar offset.
- Added workflow profile policy extraction so `.workflow/*/profile_policy.yaml` primary species/class recommendations render as `recommends` edges, and added 3D node double-click focus with adjustable chain depth plus background double-click reset.
- Updated the 3D preview so connectivity counters follow the currently selected node/relation filters, node and relation controls use Korean labels, and the active palette appears as a top-right legend.
- Separated the default relation-color palette into higher-contrast hues so common edge types such as chain, routing, use, class, species, and recommendation lines are easier to distinguish on the dark 3D canvas.
- Added short connectivity metric definitions and optional component halos so large visible connected components can be read as subtle grouped outlines without changing node-type colors.
- Increased knowledge graph node-size thresholds, added a 3D node-size basis selector that defaults to visible connection count, and slightly reduced/repositioned arrowheads so usage or hub differences read more clearly against directed edges.
- Added an in-preview collapsible visual-rules panel explaining node size, node color, border, opacity, edge width/color/style, arrows, and component outlines directly in the 3D graph UI.
- Added 3D preview sliders for overall node scale and relative node-size spread so circle size can be tuned interactively without changing graph data.
- Added selectable component halo styles so the owner can switch between visible multi-angle component outlines and restrained single-line outlines.
- Replaced the 3D default component halo from a lime multi-ring outline with a softer `연두 글로우` cloud so component grouping is visible without large crossing bands.
- Brightened the 3D `연두 글로우`, fixed the preview to scroll only the sidebar instead of clipping the canvas, and grouped sidebar settings into collapsible sections.
- Refined the 3D `연두 글로우` particles from sparse square points into denser soft round points so component clouds read less like pixel noise.
- Spread the 3D `연두 글로우` particles across the full component cloud instead of concentrating them near the center.
- Tightened the 3D candidate-edge dash spacing and clarified the visual rules panel so candidate relations read as short dotted lines rather than broken geometry.
- Hid unrelated component glows during node focus so only the selected focus range keeps its `연두 글로우`.
- Changed the default component glow into a boundary-oriented `연두 윤곽 글로우` with a dotted spherical cloud so groups are wrapped by adjustable round points instead of filled from the center.
- Scaled `연두 윤곽 글로우` shell point count from component radius so large components keep visible point spacing instead of disappearing into sparse dots.
- Replaced the shell's spiral-like point placement with seeded 3D sphere-volume sampling so close zoom reads as a sphere instead of filled orbit lines.
- Added in-preview controls for `연두 윤곽 글로우` point spacing, point size, brightness, depth, inner radius, and jitter so the owner can tune the component cloud directly.
- Set the owner's tuned `연두 윤곽 글로우` values as the new 3D preview defaults and added a single `현재 설정 저장` button that persists the full local view configuration in browser storage.
- Explicitly added `Knowledge` to the foundation ontology relation matrix so graph nodes align with `.registry/knowledge/**` canon entries and class-local `knowledge_refs.yaml` bindings.
- Kept graph weights, usage counts, recency, Obsidian links, and generated previews as navigation signals only, not source truth, ontology acceptance, owner approval, archive/retire execution, or canon promotion.

### Revision `working` - SE current-authority route wording tightened

- Tightened Systems Engineering Cell party and launcher wording so official/current source questions and accepted review/action/verification claims route to source acquisition, sufficiency review, review/action closure, or accepted-result workflows before stronger claims.
- Reflected the private current-source and claim-specific evidence route pilots as route posture only, without embedding private evidence paths, raw source payloads, project truth, official artifact authority, review approval, action closure, or verification acceptance.

### Revision `working` - SE cross-stage governance workflow registered

- Registered `se_cross_stage_mapping_governance_v0` as a governance-only workflow after private pilot review across the primary SE artifact-family rows.
- Added it as an optional Systems Engineering Cell route for cross-stage artifact coverage, claim ceilings, source gaps, owner-decision needs, and downstream rerun aggregation.
- Kept source truth, official artifact authority, stage readiness, review approval, verification acceptance, private evidence, and raw reference payloads outside the public route.

### Revision `working` - SE requirements traceability route pilot added

- Added a private `requirements_traceability_set` source acquisition and lookup pilot that keeps DAPA public sources at general-context scope, P25 examples at reference-only scope, and project-specific requirement/RTM/test/acceptance sources as explicit gaps.
- Added `page_module_trace_matrix_v0` as an optional Systems Engineering Cell route for trace-governance rows, missing evidence rows, and review/verification seed rows after source-intake state is known.
- Kept the route below final RTM authority, review approval, verification completion, production-ready behavior, and official artifact authority.

### Revision `working` - Systems Engineering Cell reference lookup route added

- Added party-owned `reference_lookup_route_candidates` to `systems_engineering_cell` so source-sensitive SE requests first consider official source packs and registered reference-example lookup hints.
- Kept `se_authority_example_bridge_agentic_lookup_v0` at `pilot_executed_private_candidate` posture: route hint only, not public canon, production-ready behavior, or official artifact authority.
- Thinly synced the Systems Engineering Cell launcher skill so it can notice party-declared private lookup candidates without embedding private evidence paths, source excerpts, or raw reference content.
- Recorded next pilot families as `requirements_traceability_set` and `quality_qgate_forms`.

## 2026-05-21

### Revision `working` - Project mail history private writer added

- Added a `_workmeta/<project_code>/reports/메일_이력/` private writer for mail-derived monster create/update/filing events.
- Added candidate-stage `_workmeta/P00-000_INBOX/reports/메일_이력/` history so received work-like mail is recorded before and even without monster creation.
- The writer now refreshes Korean-named `메일_이력.csv`, `메일_이력.xlsx`, and `메일_일정이벤트.ics` outputs with `이력키` upsert dedupe.
- Wired mail fetch candidate queue, gateway intake/update, and dungeon assignment filing to the writers without copying raw mail body, HTML, raw payload, attachment names, URLs, or local paths.

### Revision `working` - Always-on healer seven checks added

- Added a reusable healer check module for snapshot/map freshness, launchd liveness, stray development-file placement, report freshness, repo sync, secret/raw path leakage, and restore readiness.
- Integrated the seven checks into `guild-hall:healer:run`, with warning checks carried forward in activity context without marking the whole run failed.
- Documented the 24-hour PC check set and kept the mail-candidate-to-monster resolver classified as later work outside the healer success criteria.
- Added the concrete 24-hour PC pull, snapshot refresh, launchd install/verify, and healer light/full smoke rollout checklist.

### Revision `working` - Development intake storage rule clarified

- Added a roadmap-owned storage rule for development candidates, backlog, and future work so agents do not create ad hoc TODO or plan files.
- Routed unclear work to roadmap-level candidates, concrete owner work to existing owner surfaces, and unapproved agent-discovered implementation work to `_workmeta/**/dev_worker_candidate_queue`.
- Added a short `AGENTS.md` pointer so future development-intent capture checks the roadmap rule before writing files.

### Revision `working` - Mail notify attachment count excludes body links

- Updated gateway mail notification and mail candidate summaries so body links discovered in message HTML/text are not counted as user-visible attached files.
- Kept `body_link` entries in the event attachment array for link handling, while reporting attachment counts from actual message attachment parts only.

### Revision `working` - PCB Revision Library Cell launcher skill added

- Added `.registry/skills/pcb_revision_library_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/pcb_revision_library_cell` loadout.
- Framed the launcher around the practical route `allegro_pcb_dbdoctor_uprev_batch_v0` before `allegro_pcb_dlib_export_organize_v0`.
- Kept party chains, workflow procedures, optimizer profile policies, PCB payloads, Cadence paths, generated scripts, tool logs, owner mutation approvals, electrical/manufacturing claims, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-pcb-revision-library-cell-launcher`.

### Revision `working` - PCB revision/library party registered

- Added `.party/pcb_revision_library_cell/` as the reusable party for chaining `allegro_pcb_dbdoctor_uprev_batch_v0` into `allegro_pcb_dlib_export_organize_v0`.
- Registered the party in `.party/index.yaml`, updated party docs, and added compatibility hints to both Allegro workflow packages.
- Kept runtime board roots, Cadence executable paths, generated scripts, PCB payloads, tool logs, owner mutation approvals, and workflow profile choices outside party canon.
- Preserved non-claims for electrical correctness, manufacturing readiness, symbol geometry correctness, padstack engineering approval, and unattended archive-wide mutation.

### Revision `working` - Systems Engineering Cell launcher skill added

- Added `.registry/skills/systems_engineering_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/systems_engineering_cell` loadout.
- Framed the launcher around the practical request "find where this SE project is blocked and route the next workflow" rather than design automation.
- Kept party chains, workflow procedures, optimizer profile policies, project payloads, design authority, review approval, verification acceptance, owner decisions, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-systems-engineering-cell-launcher`.

### Revision `working` - Allegro DB Doctor workflow profile calibrated

- Added public-safe synthetic CLI calibration archive `cal_20260521_cli_quality_equiv_001` for `.workflow/allegro_pcb_dbdoctor_uprev_batch_v0/`.
- Updated the workflow profile policy to prefer `gpt-5.4-mini` / `medium` / `dwarf` / `auditor`, with `gpt-5.4` / `medium` and `gpt-5.5` / `medium` shadows for quality-sensitive reruns.
- Kept DB Doctor runtime paths, real PCB payloads, private run truth, and secrets out of the public archive; the calibration remains a profile recommendation, not an unattended full-archive conversion claim.

### Revision `working` - Knowledge Wiki Cell launcher skill added

- Added `.registry/skills/knowledge_wiki_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/knowledge_wiki_cell` loadout.
- Kept party chains, workflow procedures, optimizer profile policies, source truth, owner decisions, archive authority, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-knowledge-wiki-cell-launcher`.

### Revision `working` - Sample party templates retired

- Removed the sample `vanguard_strike` and `lineage_strike` party packages from active `.party` canon.
- Updated the party catalog, party README, naming draft docs, workflow compatibility notes, and sample species bias so no active reference points at the retired party ids.
- Kept the underlying sample workflows as unbound workflow entries rather than deleting additional workflow canon in the same cleanup.

### Revision `working` - Korean knowledge closeout wording clarified

- Clarified that bounded Soulforge completion reports should show user-facing Korean knowledge trigger and claim-ceiling labels first, such as `지식 트리거 확인: 책임자 판단 필요` and `주장 한계: 관찰됨`.
- Kept internal enum values for ledger, CLI, review packet, and template compatibility, while treating enum-only final wording as legacy/compatibility rather than the preferred user surface.
- Updated the knowledge trigger stop guard to accept `책임자 판단 필요` while preserving the older `오너 판단 필요` and English compatibility lines.

### Revision `working` - Knowledge pass-to-registration rule clarified

- Clarified that knowledge, source, candidate, and canon criteria that pass must be registered in the matching owner surface during the same bounded task.
- Split the 5-question knowledge trigger check from public canon registration: trigger pass records candidate, metadata, follow-up, sourcebound review, or owner-decision evidence; canon pass records the canon entry or package.
- Required concrete hold reasons when passed registration is deferred, such as owner hold, unclear owner surface, validator blockage, missing access, or public/private boundary risk.

### Revision `working` - Party launcher skill author added

- Added `.registry/skills/party_launcher_skill_author/` as the tracked Codex authoring aid for turning an existing `.party/<party_id>` loadout into a thin callable launcher skill.
- Kept party chains, workflow procedures, optimizer profile policy, runtime bindings, project payloads, and default-route authority outside the generated launcher skill.
- Documented the Codex app bridge shape with lean `codex/SKILL.md`, `codex/agents/openai.yaml`, and on-demand `codex/references/mapping.md`, so the installed mirror can be synced as `soulforge-party-launcher-skill-author`.

### Revision `working` - Drive warehouse and NotebookLM bookshelf rules clarified

- Added `KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md` to separate Google Drive as the source warehouse, NotebookLM notebooks as query bookshelves, `_workmeta` as the source catalog, and ontology candidates as review-gated metadata.
- Updated the knowledge operating model, workflow stack, curation runbook, and public LLM wiki example templates so Drive folders are no longer described as NotebookLM bookshelves.
- Linked the same warehouse/bookshelf rule from `knowledge_wiki_cell` so party execution inherits the terminology without duplicating the rule body.
- Preserved the existing `Soulforge_LLM_Wiki_Bookshelf/` Drive root as a compatibility label while clarifying that its role is warehouse/archive storage, not query authority or canon.

### Revision `working` - Allegro DB Doctor uprev workflow added

- Added `.workflow/allegro_pcb_dbdoctor_uprev_batch_v0/` as a registered workflow for owner-gated Cadence DB Doctor legacy PCB database uprev batches.
- Kept sample folders and installed Cadence executable paths out of the public workflow package; operators supply absolute runtime paths through the batch scope packet.
- Captured the old/new packet shape, DB Doctor `-outfile` route, log-based warning-bearing completion classifier, and non-claims for electrical correctness, manufacturing readiness, and unattended full-archive mutation.

### Revision `working` - Allegro dlib export organize workflow added

- Added `.workflow/allegro_pcb_dlib_export_organize_v0/` as a registered workflow for owner-gated Cadence Allegro `dlib` board library export and library folder organization.
- Kept board roots, installed Allegro paths, generated scripts, and raw PCB payloads out of the public workflow package; operators supply absolute runtime paths through the library export scope packet.
- Captured the `padpath`, `psmpath`, `devpath`, and `logs` folder classification rules, `dump_libraries.log` zero-error success check, transient export folder cleanup check, and non-claims for electrical correctness, symbol geometry correctness, manufacturing readiness, and unattended full-archive mutation.

### Revision `working` - Allegro dlib workflow profile calibrated

- Added public-safe staged CLI calibration archive `.workflow/allegro_pcb_dlib_export_organize_v0/calibrations/cal_20260521_dlib_public_fixture_001/`.
- Promoted the workflow profile policy to `gpt-5.5` / `medium` / `dwarf` / `archivist` after semantic quality-gate review on a synthetic fixture.
- Recorded calibration limitations: no real Allegro execution, raw PCB payload, installed Cadence path, private-state data, `_workspaces` output, or `_workmeta` run truth was used.

## 2026-05-20

### Revision `working` - SE assistant operating loop registered

- Added `.workflow/se_assistant_operating_loop_v0/` as a structure-only request router for systems-engineering assistant work across scaffold, stage-gap, source/wiki, readiness, owner-decision, review, and closeout workflows.
- Added `.party/systems_engineering_cell/` as the reusable party/loadout for SE assistant routing, while keeping workflow profile choices and project-local run truth outside party canon.
- Added `docs/architecture/workspace/SE_ASSISTANT_OPERATING_MODEL_V0.md` and tightened Boss Clear wording so stage completion cannot be inferred from folder/output presence alone.
- Kept the new route below production-ready or pilot-executed claims; it is registered public-safe orchestration structure, not design authority, source truth, review approval, or verification acceptance.

### Revision `working` - Mail work priority queue projection added

- Added metadata-only `mail_work_priority` refresh/list command surfaces on top of `mail_work_status`, writing local priority output to `guild_hall/state/gateway/mail_work_status/priority_latest.json`.
- Added deterministic subject-only routing rules for exact `P26-030`, unresolved work review inbox, duplicate thread grouping, personal/admin holds, and promo/non-work holds without reading raw mail payloads.
- Documented the priority projection contract and added gateway tests for exact routing, duplicate threads, personal/admin, promo non-work, raw boundary false, and list filtering.

### Revision `working` - Long-thread handoff Codex wrapper added

- Added `.registry/skills/long_thread_handoff/` as the tracked Codex wrapper for explicit long-thread contamination-free handoff requests.
- Kept the launcher opt-in only, so normal short tasks do not automatically inherit the fresh-subagent manager mode.
- Preserved Telegram delivery as a safe closeout handoff unless a configured sender and explicit authorization are available.

### Revision `working` - GitHub up/down Codex wrappers added

- Added `.registry/skills/github_down/` as the tracked Codex wrapper for GitHub down/latest-update/download requests.
- Added `.registry/skills/github_up/` as the tracked Codex wrapper for GitHub up/upload/publish requests.
- Bound the wrappers to the existing `.workflow/latest_update_sync_and_followup_v0/` and `.workflow/github_upload_publish_v0/` procedures instead of moving GitHub policy into skills.
- Documented that `skill sync` only materializes repo-tracked `.registry/skills/**/codex` wrappers and cannot infer local-only skills from another PC.

### Revision `working` - Mail work status projection and gateway sync-back added

- Added `docs/architecture/workspace/MAIL_WORK_STATUS_V0.md` and `guild_hall/gateway/mail_work_status.mjs` so local-only `mail_work_status/latest.json` can reconcile mail candidate, gateway intake, project monster, private mission index, and battle event metadata into one status projection.
- Added `guild-hall:gateway:mail-work:refresh` and `guild-hall:gateway:mail-work:list` command surfaces plus gateway projection tests.
- Updated dungeon assignment filing so gateway-origin monsters sync back to `transferred` current state, populate `project_monster_ref` and private `mission_ref` when available, and append matching gateway history / global event rows without copying raw mail payload.

### Revision `working` - GitHub upload workflow added

- Added `.workflow/github_upload_publish_v0/` as a reusable upload workflow for validating, committing, and pushing public Soulforge changes together with `_workmeta` and `private-state` metadata repo changes.
- Registered the workflow in `.workflow/index.yaml`, added it to `guild_master_cell` allowed workflows, and recorded the Korean global-name candidate `운영_깃허브업로드_v0`.
- Kept public/private Git roots separate and required validation plus boundary review before claiming upload completion.

### Revision `working` - Latest update follow-up workflow added

- Added `.workflow/latest_update_sync_and_followup_v0/` as a draft event-driven workflow for checking latest GitHub/upstream updates, companion repo freshness, project material completeness, workspace junction state, and follow-up routes.
- Registered the workflow in `.workflow/index.yaml` and linked it from `.workflow/README.md`.
- Ran a report-only private pilot, moved the workflow to active report-only maturity, added it to `guild_master_cell` allowed workflows, and recorded the Korean global-name candidate `운영_최신업데이트후속점검_v0`.
- Added Codex skill mirror drift handling so latest-update runs can compare `.registry/skills/**/codex` against the local installed skill mirror and sync missing or stale skills through `npm run skills:sync`.
- Kept junction repair authority owner-gated: public workflow canon references `_workmeta/system/bindings/workspace_junctions.yaml` as portable intent only and does not store host-local cloud roots, secrets, source payloads, or automatic mutation authority.

### Revision `working` - Workspace shared-link rule clarified

- Clarified that project payloads shared across owner PCs should live in an owner-approved shared worksite, with `_workspaces/<project_code>/` materialized as a local junction or symlink view.
- Updated onboarding, workspace model, installation, and multi-PC docs to keep host-local shared target paths out of public tracked files.
- Kept public Git scope limited to generic workspace rules; raw project media and measurement payloads remain outside public tracking.

## 2026-05-19

### Revision `working` - 21 workflow optimizer gap batch closed

- Applied workflow-check and workflow-optimizer follow-through to the 21 workflows listed in the 2026-05-19 optimizer gap scan.
- Added or replaced `profile_policy.yaml` calibration state, public-safe `calibrations/cal_20260519_quality_equiv_001/` archives, and `history/2026-05-19_quality_equiv_001.md` notes across the affected workflow packages.
- Added missing workflow package READMEs for `frontline_assault` and `build_lineage_map`, while keeping readiness labels conservative and leaving `post_development_review_gate_v0` locked to its strongest review profile.

### Revision `working` - Workflow check skill registered

- Added `.registry/skills/workflow_check/` as the tracked canonical skill package for the installed `soulforge-workflow-check` Codex skill.
- Added the Codex bridge and UI metadata so other PCs can materialize it with `npm run skills:sync -- workflow_check` or the bootstrap `--all` sync.
- Linked the skill from `.registry/skills/README.md` and kept registration/default-route authority outside the checker itself.

## 2026-05-18

### Revision `working` - Knowledge wiki Obsidian contract and synthetic pilot smoke

- Added an Obsidian export decision surface to `se_knowledge_wiki_pipeline_v0` so the composite candidate now records when a generated read-only view is requested and blocks export unless the source is canon-backed.
- Fixed the default Obsidian posture to `_workspaces/system/knowledge_view/obsidian_export/` as a local generated runtime surface, not a canon owner root and not a Drive-synced primary vault.
- Clarified in `knowledge_wiki_cell` party docs that Obsidian consumes canon-backed `.registry/knowledge` entries or approved canon packages only; `_workmeta` payloads, Drive candidate files, and NotebookLM answers remain outside the vault body.
- Expanded `KNOWLEDGE_WIKI_WORLDVIEW_V0.md` with concrete Obsidian file naming, frontmatter, link, metadata-ref, read-only, and regen/drift rules.
- Recorded a latest-policy synthetic manifest-only smoke under `_workmeta/system/runs/knowledge_wiki_cell_latest_policy_smoke_20260518/` and kept `se_knowledge_wiki_pipeline_v0` unregistered even after the pilot.

### Revision `working` - SE knowledge wiki composite registered and selected

- Registered `se_knowledge_wiki_pipeline_v0` in `.workflow/index.yaml`.
- Switched `knowledge_wiki_cell` to use `se_knowledge_wiki_pipeline_v0` as the default party entry by owner direction.
- Kept the older four-stage lane as the composite workflow's downstream execution chain rather than removing those registered workflows.

### Revision `working` - Workflow knowledge preflight added

- Removed the mistaken `knowledge_investigation_cell` party surface because the intended abstraction is a cross-cutting pre-start investigation workflow, not a reusable party chain.
- Added `.workflow/workflow_knowledge_preflight_v0/` as the generic workflow that checks `.registry/knowledge`, canon-backed Obsidian export, NotebookLM bindings, `_workmeta` evidence, and Drive refs before a target workflow starts.
- Kept the result metadata-only so the preflight seeds claim ceilings and next routes without becoming source truth, owner approval, or canon authority.

### Revision `working` - Knowledge wiki worldview overview added

- Added a teammate-facing Markdown and standalone HTML overview for the Soulforge knowledge wiki worldview.
- Explained source truth, private projection, concept candidates, review gates, canon knowledge, access ledger, current development status, and the SE wikiization next steps in public-safe language.
- Added the workspace map for local PC, `_workmeta`, Google Drive, NotebookLM, `.workflow`, `.party`, `.registry/knowledge`, and access ledger roles.
- Revised the workspace map so Google Drive is the owner-held file archive and backup for inbox candidates, source files, working bundles, and canon packages; `_workmeta` remains the Karpathy-style data-work location, NotebookLM remains the canon-package query interface, and Obsidian remains a canon-only read view.
- Threaded the Drive archive model into the wiki party/workflow surfaces by adding owner-held archive manifest fields to source intake, sourcebound projection, and the draft SE knowledge wiki pipeline.
- Added `codex_skill_auto_sync` archive authority so approved Codex skills or the Google Drive connector may upload/sync bounded archive files without per-file owner confirmation while preserving source/canon/secret boundaries.
- Linked the overview from the guild hall architecture README.

### Revision `working` - Knowledge wiki party registered

- Registered `.party/knowledge_wiki_cell` as the reusable Karpathy-style sourcebound wikiization party.
- Linked source intake, private sourcebound projection, metadata-only knowledge access capture, and post-development review into one party-level workflow chain.
- Kept workflow execution profiles, model/reasoning/species/class/unit optimization, source payloads, extracted text, and private wiki projections outside party canon.

### Revision `working` - Party model re-scoped to workflow chains

- Re-scoped `.party` from reusable unit/team composition to reusable workflow-chain/loadout orchestration.
- Clarified that workflow optimizer outputs for model, reasoning effort, species, class, and unit/profile choices belong under each `.workflow` profile/calibration surface.
- Updated party, mission, runner, autohunt, ontology, UI source-map, and workspace docs to treat party as a higher-level workflow sequence that prevents agents from re-expanding every lower workflow by default.

## 2026-05-17

### Revision `working` - Knowledge workflow stack and missing layers added

- Added `monster_knowledge_preflight_v0` as the query-first front gate for source-heavy or ambiguity-heavy monsters so project wiki, NotebookLM bindings, and source ledgers can be inspected before the main workflow runs.
- Added `knowledge_candidate_triage_v0` as the explicit filter between candidate material and reusable wiki state, covering bookshelf placement, packet eligibility, owner review routing, and metadata-only boundary review.
- Added `wiki_curation_maintenance_v0` as the executable metadata-only curation layer and `llm_wiki_builder_v0` as the end-to-end stack orchestrator that ties preflight, triage, optional sourcebound deepening, curation, usage capture, and governance into one bounded route.
- Added `KNOWLEDGE_WORKFLOW_STACK_V0.md` and `WIKI_CURATION_MAINTENANCE_V0.md` to document the usable six-layer knowledge stack, the current-default project operating loop, and the human-readable curation runbook that sits beside the executable curation layer.
- Clarified in `KNOWLEDGE_OPERATING_MODEL_V0.md` and `AUTOHUNT_MODEL.md` that source-heavy monsters may use a knowledge preflight front gate and that curation remains a separate metadata-only maintenance layer.

## 2026-05-18

### Revision `working` - Workflow lane and party service lane boundary added

- Added workflow `classification_lane` guidance so workflow lanes are discovery/indexing metadata only, not owner or execution authority.
- Added party `service_lane` guidance and fields to the three current party templates so party fit can be described without owning workflow steps.
- Extended the workflow draft template with `classification_lane` and `execution_binding` placeholders, keeping actual execution binding in party allowed-workflows or mission assignment.
- Updated the canonical `workflow_generator` skill and installed `soulforge-workflow-generator` mirror so future generated workflows preserve the same lane and party-binding boundary.
- Added a draft lane taxonomy and Korean display-name fields for workflow classification lanes and party service lanes.

### Revision `working` - Workflow and party name mapping drafts added

- Added `.workflow/docs/WORKFLOW_NAME_MAPPING_TABLE_V0.md` with draft Korean alias/display-name candidates for all 44 workflows currently registered in `.workflow/index.yaml`, without renaming ids, folders, or index entries.
- Added `.party/docs/PARTY_NAMING_CONTRACT_V0.md` and `.party/docs/PARTY_NAME_MAPPING_TABLE_V0.md` to separate stable `party_id`, slash-free Korean `global_name_ko` alias candidates, and descriptive `display_name_ko` values for the 3 current party entries.
- Added derived static HTML review pages at `.workflow/docs/WORKFLOW_NAMING_DRAFT_V0.html` and `.party/docs/PARTY_NAMING_DRAFT_V0.html` so humans can review the draft naming layers and full mapping tables without treating HTML as canon.
- Clarified the draft resolve chain `global_name_ko -> workflow_id -> party_id -> path` while keeping alias catalog placement, namespace policy, and any future rename/deprecation as follow-up owner decisions.
- Linked the new draft mapping documents from `.workflow/README.md` and `.party/README.md`.

### Revision `working` - Workflow naming contract draft added

- Added `.workflow/docs/WORKFLOW_NAMING_CONTRACT_V0.md` as a draft authoring contract for separating slash-free Korean invocation aliases, descriptive Korean display names, and canonical English `snake_case` workflow ids.
- Linked the draft from `.workflow/README.md`, `.workflow/authoring/README.md`, and the workflow draft template, including draft-only `global_name_ko` and `display_name_ko` fields, so new workflow authoring can reference it without adding validator enforcement.
- Clarified that Codex official feature constraints do not define Soulforge workflow global names, and that Korean invocation aliases must resolve to canonical `workflow_id` entries in `.workflow/index.yaml`.
- Documented a conservative migration posture for the 44 registered workflows observed on 2026-05-18, including mixed `_v0` usage and legacy short ids.

### Revision `working` - Knowledge stack made runnable and practiced

- Raised `monster_knowledge_preflight_v0`, `knowledge_candidate_triage_v0`, `wiki_curation_maintenance_v0`, and `llm_wiki_builder_v0` to `pilot_executed_private_evidence` after a bounded private P24 practice run.
- Recorded that the stack can now execute `query-first preflight -> candidate triage -> known-gap stop -> curation packet -> final builder handoff` without rereading raw sources or overclaiming technical authority.
- Kept the remaining gaps narrow: per-source Drive-backed source rows still need to be populated over time, and scheduled maintenance binding is still weaker than the manual/review-driven path.

### Revision `working` - LLM wiki bookshelf public example added

- Added a public-safe `llm_wiki_bookshelf/` example package with an offline/manual canonical-source intake checklist, metadata-only source ledger template, and NotebookLM packet map template.
- Linked the example from the workspace examples index and knowledge operating model while keeping source payloads, live Drive or NotebookLM IDs, account state, runtime absolute paths, and NotebookLM answers out of public canon.
- Kept Google Drive bookshelf and NotebookLM packet claims at manual/advisory metadata level without requiring live external state.

### Revision `working` - Google Drive LLM wiki bookshelf boundary added

- Documented Google Drive `Soulforge_LLM_Wiki_Bookshelf/` as the owner-held source bookshelf model for LLM wiki material across PCs.
- Clarified that NotebookLM should use approved CANON bookshelf sources while OneDrive remains for active work files and `_workmeta` remains the metadata ledger.
- Kept Drive folder placement, NotebookLM output, drafts, raw mail, local-only working files, and uncertain versions out of canon authority without source approval, review evidence, and owner records.
- Added the planned development direction for metadata-only source ledgers, NotebookLM packet maps, knowledge-use records, review packets, and promotion candidates.

### Revision `working` - Mac mini and MacBook role split clarified

- Clarified the current owner device split: MacBook Air as `portable_dev_pc`, Mac mini operations clone as `always_on_node`, and Mac mini development worktree as a separate `dev_worker_pc`-style surface.
- Updated always-on and dev-worker bootstrap prompts so the Mac mini can run long-lived development tasks without dirtying the clean operations clone.
- Documented that OneDrive/cloud workspaces may hold actual project files only, while public repos, `_workmeta`, `private-state`, `guild_hall/state` runtime, env files, sessions, and tokens stay outside cloud sync.

### Revision `working` - Local absolute path upload guard added

- Added `validate:path-policy` to block concrete local absolute paths in changed tracked/upload candidates before root validation proceeds.
- Added `validate:path-policy:all` and `validate:path-policy:state` for full tracked audits and companion repo changed-file audits.
- Fixed registry knowledge YAML notes that became invalid once the canon validator started parsing knowledge entries.

### Revision `working` - End-of-task knowledge trigger check added

- Added an end-of-task Knowledge Trigger Check to the Soulforge execution contract so bounded work closes with `no_trigger`, `metadata_only_record`, `sourcebound_review_candidate`, or `owner_decision_needed`.
- Extended `post_development_review_gate_v0` and its review packet template to record the trigger result before supervisor acceptance without granting source-truth, ontology, owner-approval, graph, archive/retire, or canon authority.
- Clarified that existing `knowledge_access_event.accumulation_delta_hint` can carry lightweight trigger signals for already-used refs, while new unregistered patterns should route through procedure capture, daily sweep, sourcebound review, or owner decision.
- Added `guild-hall:knowledge-access record` trigger flags so end-of-task checks can append metadata-only `accumulation_delta_hint` rows from the CLI, with validation coverage for allowed trigger results, routes, and claim ceilings.
- Defined task end as bounded completion reporting rather than thread closure, and added a low-noise Codex Stop hook guard helper that only catches missing `Knowledge trigger check:` lines without judging or storing knowledge.
- Localized the user-facing Stop hook closeout to Korean `지식 트리거 확인: 없음` while keeping legacy English closeout lines accepted for compatibility.

### Revision `working` - Renderer Knowledge Lane review fixes

- Whitelisted renderer Knowledge Lane owner-gated states, the `observed` claim ceiling, and known private/local `evidence_counts` keys before display.
- Suppressed Knowledge Lane state/claim rendering unless the loaded snapshot is fresh, so stale or invalid stored lanes degrade instead of looking current.
- Added the snapshot contract presence fields `helper_present`, `notebooklm_bridge_present`, `workflow_present_count`, and `fixture_present` to the renderer display.

### Revision `working` - Renderer Knowledge Lane slice added

- Added renderer-web consumption of `operation_board.sections.knowledge_lane` as a metadata-only Operation Board section.
- Rendered only sanitized owner-gated state, claim ceiling, evidence counts, blockers, and next owner-review action without validation, ontology acceptance, owner decision, or canon promotion authority.

### Revision `working` - Snapshot knowledge lane review fixes

- Enforced snapshot v0 `knowledge_lane` state/blocker/evidence support and claim-ceiling validation in freshness comparison so manually strengthened stored lanes fail instead of passing as fresh.
- Kept public helper/docs/workflows/fixtures out of `knowledge_lane.evidence` counts; private/local metadata evidence is counted separately from public metadata surfaces.
- Excluded auth/session-shaped knowledge access files from entry counts while continuing to avoid reading or exposing their contents/names.

### Revision `working` - Snapshot knowledge lane status added

- Added a metadata-only `knowledge_lane` snapshot surface and Operation Board section for knowledge/NotebookLM/ontology lane status.
- Summarized only owner-gated state, helper/workflow/fixture presence, evidence presence/counts, claim ceiling, blockers, and next owner-review action.
- Kept NotebookLM auth/session data, query/answer/source payloads, private report prose/filenames, ontology candidate statements, owner decisions, graph mutations, and registry promotion claims out of the snapshot.

### Revision `working` - NotebookLM metadata bridge helper promoted

- Added `guild_hall/knowledge_access/notebooklm_bridge.mjs` plus `notebooklm-bridge`/`notebooklm-import` CLI commands for importing explicit NotebookLM-like binding/source-ledger/query-log metadata into `imported_log_entry` ledger rows.
- Kept the bridge metadata-only and advisory: no `nlm` calls, no auth/session file reads, no source payload or free-form query-log reason copying, no no-query event fabrication, and no canon/ontology mutation.
- Blocked malformed `timestamp_utc` rows, unsafe `entry_ref` auth/session/runtime paths, and invalid event enum cells before deriving imported ledger refs or emitting bridge summaries.
- Extended the public synthetic NotebookLM fixture with a blocked no-query case and validation coverage for positive imports, CLI import, and no-query/no-fabrication behavior.

### Revision `working` - Synthetic NotebookLM bridge fixture added

- Added a public-safe synthetic NotebookLM bridge fixture under `docs/architecture/workspace/examples/notebooklm_bridge/`.
- Covered NotebookLM-like `imported_log_entry` advisory rows in the knowledge access analyzer test without changing helper code.

### Revision `working` - Test/evaluation result ingest workflow registered

- Registered `.workflow/test_evaluation_execution_result_ingest_v0` as a contract-level/private-evidence workflow for packaging non-simulation-specific execution or result-ingest evidence into candidate result rows, blockers, owner follow-up, and downstream acceptance-review handoffs.
- Kept the claim ceiling at `registered_contract_private_evidence`: this registers the reusable package only, not accepted verification, owner acceptance, TRR/DT/FCA/OT/PCA approval, usable status, production readiness, or profile optimization.
- Recorded private registration governance under `_workmeta/system/runs/test_evaluation_execution_result_ingest_registration_20260517_014107/` and left controlled pilot execution plus accepted-result handoff verification as future strengthening gates.

### Revision `working` - Knowledge validation guardrails tightened

- Added shared knowledge claim states for `observed`, `source_supported`, `validated_private`, `canon_candidate`, `canon_entry`, and `rejected_or_blocked` knowledge.
- Clarified that NotebookLM, LLM advice, ledgers, and analysis labels are advisory signals only, not validation, ontology acceptance, owner approval, or canon-promotion authority.
- Added minimal canon entry guards for registry knowledge entries and public canon promotion.

### Revision `working` - SE stage artifact gap scan workflow registered

- Registered `.workflow/se_stage_artifact_gap_scan_v0` as the reusable controller package for one-stage SE artifact/gap scanning, owner/source queueing, blocker preservation, draftable/diagram lane surfacing, and downstream route mapping.
- Kept the claim ceiling at `registered_controller_private_evidence`: this registers the controller package only, not PDR/CDR/TRR/FCA/OT readiness, approval, test execution, verification completion, production readiness, or profile optimization.
- Recorded private registration governance under `_workmeta/system/runs/se_stage_gap_scan_registration_20260517_013027/` and linked later-stage route vocabulary to already registered generic workflows such as verification planning, harness planning, accepted result packets, FCA, and PCA lanes.

### Revision `working` - Knowledge operating model documented

- Added `docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md` to explain how the knowledge access ledger, manual candidate capture, LLM suggestion approval, end-of-work sweep, sourcebound packet loop, and access-event analysis workflow combine without crossing public/private owner boundaries.
- Linked the operating model from the guild_hall architecture index and the knowledge access helper README, including the rule that normal file reads are not automatically observed unless the helper/read wrapper or explicit record is used.

### Revision `working` - HTML outbound mail runner added

- Added `guild-hall:gateway:send-mail` as a local SMTP outbound runner under `guild_hall/gateway/mail_send/`.
- Enabled `multipart/alternative` HTML report emails with plain-text fallback while keeping SMTP credentials in local-only `guild_hall/state/gateway/mailbox/state/mail_send.env`.
- Updated the mail send owner docs so outbound snapshots and append-only send logs remain under ignored `guild_hall/state/gateway/**` local state.

### Revision `working` - AI output format policy added

- Added `AI_OUTPUT_FORMAT_POLICY_V0.md` to keep durable source-of-truth records in Markdown/YAML/JSON while allowing self-contained HTML as derived human-review artifacts.
- Required HTML review artifacts to preserve public/private/secret boundaries and export durable decisions back to text or structured data.
- Added a dedicated validator/test surface for the output-format policy.

### Revision `working` - Dev worker candidate promotion lane added

- Added a `dev_worker_candidate_queue` lane for agent-discovered work so self-generated tasks can be recorded as candidates without being immediately claimable by high-performance worker PCs.
- Added `guild-hall:dev-worker:candidates` to list candidates and promote owner-approved candidates into `_workmeta/<project_code>/dev_worker_queue/*.yaml`.
- Tightened `dev_worker` claim eligibility so `origin.kind: agent_generated` ready packets require `owner_approval.approved: true`.
- Added a low-risk `auto_approval` policy so eligible agent-generated candidates can be policy-approved and promoted without manual owner approval.
- Updated the local dev-worker automation prompt to run auto-promotion before claiming one ready task.
- Updated daily work packets to show candidate, promotable candidate, and auto-approvable candidate counts.
- Documented high-performance PC setup, candidate approval, promotion, and worker activation boundaries.
- Added a self-contained HTML next-steps review artifact for owner-facing setup and operation handoff.

## 2026-05-16

### Revision `working` - Repository line ending policy pinned

- Added root `.gitattributes` and `.editorconfig` to keep text files normalized to LF across Windows, editors, and GitHub workflows while preserving common binary artifact formats.

- Documented the always-on Mac mini strategic review stack, separating deterministic `healer`, daily `night_watch`, and weekly `ouroboros_strategic_review_harness_v0` responsibilities.
- Strengthened `ouroboros_strategic_review_harness_v0` with a Socratic question router, ambiguity ledger, owner-question option shape, and closure restatement gate so strategic gaps become answerable decisions instead of broad meta-questions.

### Revision `working` - Knowledge access ledger operating model clarified

- Clarified that ordinary knowledge use creates lightweight metadata-only ledger/register rows, while `knowledge_access_event_capture_v0` is the later normalization, rollup, analysis, and routing workflow rather than a required per-access run.
- Added minimal capture-mode, manual-note, reason-used, output-ref, and ledger/register refs to the public-safe event and binding templates while keeping source truth, payload truth, ontology acceptance, archive/retire decisions, and owner decisions out of scope.

### Revision `working` - Knowledge access ledger helper added

- Added `guild_hall/knowledge_access` as a minimal helper for appending metadata-only knowledge access JSONL rows from explicit `read` and `record` commands.
- Blocked secret-like, private/runtime, absolute, and traversal knowledge refs before ledger append, and added focused `validate:knowledge-access` coverage to the root acceptance harness.

### Revision `working` - Knowledge access event capture workflow registered

- Added `.workflow/knowledge_access_event_capture_v0` as a reviewed public-safe draft workflow for capturing metadata-only knowledge access events across workflows, skills, missions, user tasks, tools, and advisory handoffs.
- Defined actor, target knowledge ref, access type, work context, timestamp, outcome/usefulness, relation hints, usage rollups, hot/warm/cold/stale/archive/retire candidate labels, strong/weak/orphan/redundant link candidates, and graph update packets.
- Linked the workflow as an optional downstream usage-lineage lane from `sourcebound_knowledge_packet_operating_loop_v0` while keeping source truth, private payloads, advisory answers, archive/retire execution, owner decisions, and profile optimization out of scope.

### Revision `working` - Sourcebound knowledge packet loop registered

- Registered `.workflow/sourcebound_knowledge_packet_operating_loop_v0` as a pilot-executed private-evidence workflow for Karpathy-style source intake, private source-bound projection/index/log generation, contradiction/gap lint, concept-candidate extraction, claim-ceiling routing, optional advisory NotebookLM handoff, and workflowization review packets.
- Kept source truth in source packets or owner-held sources, kept projection outputs private and derivative, and left profile policy draft/conservative with no production-ready or profile-optimized claim.

### Revision `working` - Ouroboros strategic review harness drafted

- Added `.workflow/ouroboros_strategic_review_harness_v0` as a reviewed public-safe draft workflow for periodic vision alignment review and owner-intent gap probing.
- Added templates for `vision_alignment_report`, `owner_intent_gap_register`, `owner_question_queue`, `canon_constraint_candidate_register`, `next_focus_recommendation`, and `ouroboros_loop_ledger`.
- Recorded a private Ouroboros harness study/adoption packet under `_workmeta/system` and kept external runtime installation, ontology convergence claims, and automatic canon mutation out of scope.
- Allowed `guild_master_cell` to route strategic review and owner-intent gap requests through the new harness.
- Documented the harness as a weekly or owner-triggered `night_watch` candidate rather than a replacement for nightly boundary, portability, and context-drift checks.

### Revision `working` - SE assistant program direction documented

- Added an SE assistant north-star to `VISION_AND_GOALS.md` while keeping `se_foldertree_generate` limited to folder and plan-tracking scaffold generation.
- Added an SE assistant program lane to `DEVELOPMENT_ROADMAP_V0.md` without replacing the current `snapshot_to_operation_board_v0` active slice.
- Fixed the owner split so proactive orchestration lives in `.workflow`, `.mission`, `_workmeta`, and `guild_hall/night_watch`, while missing design content stays as owner questions or blockers instead of agent inference.

### Revision `working` - SE assistant widened to design-support artifact scope

- Sharpened the SE assistant wording toward a systems-engineering design-support aide rather than a narrow document helper.
- Clarified that `artifact` in the SE assistant lane includes documents, diagrams, traceability matrices, analysis packets, review evidence, owner-decision records, open-question registers, and verification-planning artifacts.
- Kept `se_stage_artifact_gap_scan_v0` as the first safe workflow name while broadening its private draft outputs to cover design-support queues such as `draftable_artifact_queue`, `diagram_need_register`, and `stage_readiness_summary`.

### Revision `working` - Post-development review gate and Windows acceptance portability

- Added a risk-tiered post-development independent review gate to the agent execution contract, from Level 0 self-check through Level 3 full B/V verification.
- Added a public-safe post-development review packet template for reusable review evidence.
- Added the immediate repository improvement plan for independent review routing, LLM Wiki-style sandbox evaluation, and daily/weekly review boundaries.
- Registered `.workflow/post_development_review_gate_v0` as the generic closing workflow for applying the new review gate to bounded development work.
- Added public-safe templates for all declared post-development review gate outputs, including boundary review, judge decision, B/V handoff, and follow-up register packets.
- Allowed `guild_master_cell` to route post-development review requests through the new gate workflow.
- Added `.registry/skills/post_development_review_gate` plus the installed Codex bridge `soulforge-post-development-review-gate` for consistent task-closing invocation.
- Locked the review gate workflow profile policy to conservative `gpt-5.5 / xhigh / auditor` final acceptance review instead of cost optimization.
- Made root UI lint/done-check scripts set the canonical root through a Node wrapper instead of Unix-only environment assignment.
- Updated the UI theme package smoke test and UI workspace wrapper so `npm pack` / UI scripts run through direct `npm.cmd` on Windows and direct `npm` elsewhere, avoiding shell quoting drift.

## 2026-05-14

### Revision `working` - SE foldertree exploratory and operational basic variants added

- Added two dry-runable bundled specs to `se_foldertree_generate`: `탐색개발 / 공통 / 없음` and `운용연구개발 / 공통 / 없음`.
- Updated `generate_tree.py` to bind each supported input combination to an explicit default spec, allow `--spec` omission for supported variants, and validate that a chosen spec matches the requested input combination.
- Added production-bound variant metadata for the new basic variants and tightened `preview_variants.py` so production-enabled variants must declare explicit supported inputs and spec assets.
- Kept the existing `체계개발 / LIG 넥스원 / A` behavior as the current system-development/LIG overlay path without folding its Q-gates into the new common basic variants.

## 2026-05-15

### Revision `working` - Dev worker branch lane added

- Added `guild_hall/dev_worker` as a bounded task-packet-to-branch automation lane for worker PCs.
- Defined the `dev_worker` policy surface, bootstrap prompt, task packet shape, local automation render, preflight, claim helper, and validation test.
- Updated multi-PC and guild_hall docs so worker PCs may push review branches while `main` merge authority remains with the reviewer/supervisor lane.

### Revision `working` - Dev worker preflight doctor scoped

- Scoped the dev-worker preflight default doctor command to `public-only --remote`, leaving `_workmeta` and `private-state` readiness to the lane-specific companion repo sync checks.
- Added `dev_worker_pc` to the local node identity role allow-list and updated the bootstrap prompt so branch-worker setup does not require gateway, mailbox, or town-crier operator env files.

### Revision `working` - Always-on Codex token budget lowered

- Lowered the tracked `Soulforge Night Watch Pipeline` default from `gpt-5.4`/`xhigh` to `gpt-5.2`/`medium` so future local renders do not default to the more expensive frontier model for advisory checks.
- Updated the always-on healer rollout plan to reflect the 4-hour Codex heartbeat cadence and low-reasoning activity sync fallback.
- Kept short-interval mail fetch, mail healthcheck, and town-crier monitoring in deterministic launchd jobs without LLM usage.

### Revision `working` - Simulation source collection profile calibrated

- Calibrated `.workflow/simulation_source_collect_v0/` against a public-safe synthetic mixed model-source fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.3-codex / low / dwarf / auditor` as the primary profile.
- Archived the calibration under `.workflow/simulation_source_collect_v0/calibrations/20260515T000000Z_staged_public_fixture/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, account-bound downloads, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Verification plan from page contracts profile calibrated

- Calibrated `.workflow/verification_plan_from_page_contracts_v0/` against a public-safe synthetic verification-planning fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / human / auditor` as the primary profile.
- Archived the staged calibration under `.workflow/verification_plan_from_page_contracts_v0/calibrations/cal_20260515T121105_public_fixture/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Simulation deck prepare profile calibrated

- Calibrated `.workflow/simulation_deck_prepare_v0/` against a public-safe synthetic LTspice deck-prepare fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4-mini / medium / dwarf / auditor` as the primary profile and `gpt-5.4 / medium / dwarf / auditor` as the quality shadow.
- Archived the staged calibration under `.workflow/simulation_deck_prepare_v0/calibrations/20260515T120213KST/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, model payloads, simulator outputs, and runtime absolute paths out of public workflow canon.

### Revision `working` - Review gate evidence pack profile calibrated

- Calibrated `.workflow/review_gate_evidence_pack_v0/` against a public-safe synthetic TRR-like/PDR-like review fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / medium / darkelf / auditor` as the primary profile and `gpt-5.4 / low / darkelf / auditor` as the smoke shadow.
- Archived the staged calibration under `.workflow/review_gate_evidence_pack_v0/calibrations/cal_20260515_public_synthetic_staged_v0/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Interface control and harness readiness profile calibrated

- Calibrated `.workflow/interface_control_and_harness_readiness_v0/` against a public-safe synthetic interface/harness readiness fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.3-codex-spark / high / dwarf / auditor` as the primary profile and `gpt-5.4 / medium / elf / auditor` as the quality shadow.
- Archived the staged calibration under `.workflow/interface_control_and_harness_readiness_v0/calibrations/cal_20260515_public_synthetic_staged_v0/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, and private payloads out of public workflow canon.

### Revision `working` - Simulation run verify profile calibrated

- Calibrated `.workflow/simulation_run_verify_v0/` against a public-safe synthetic blocked-run and synthetic-stub fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / human / auditor` as the primary profile.
- Archived the calibration under `.workflow/simulation_run_verify_v0/calibrations/cal_20260515_public_synthetic/`, including fixture, quality gate, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, waveforms, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Page quantitative enrichment profile calibrated

- Calibrated `.workflow/page_quantitative_enrichment_v0/` against a public-safe synthetic quantitative-enrichment fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / elf / auditor` as the primary profile and `gpt-5.4 / medium / dwarf / auditor` as the stability shadow.
- Archived the calibration under `.workflow/page_quantitative_enrichment_v0/calibrations/cal_20260515_synth_qe_001/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note for the profile decision while keeping raw project truth, `_workspaces` material, credentials, and private payloads out of public workflow canon.

### Revision `working` - Quality-equivalence follow-up archives integrated

- Added follow-up public-safe `quality_equiv` calibration archives for page quantitative enrichment, interface control, verification planning, review gate, simulation source collection, and simulation run verify where later candidate comparisons were preserved as public-safe synthetic evidence.
- Recalibrated `.workflow/interface_control_and_harness_readiness_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.3-codex-spark / high / dwarf / auditor` to `gpt-5.5 / medium / elf / auditor`, while keeping the previous spark profile as a latency shadow and preserving the local-internal / no-connect / source-supported join ceilings.
- Recalibrated `.workflow/verification_plan_from_page_contracts_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / low / human / auditor` to `gpt-5.5 / medium / human / auditor`, while keeping `gpt-5.5 / xhigh` as the fuller quality shadow and demoting the old low-effort profile to minimum-viable planning output.
- Recalibrated `.workflow/review_gate_evidence_pack_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / medium / darkelf / auditor` to `gpt-5.5 / medium / darkelf / auditor`, while preserving source/checksum propagation, CAN/reset gap handling, blocker/action structure, and owner-decision non-claim boundaries.
- Recalibrated `.workflow/simulation_source_collect_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.3-codex / low / dwarf / auditor` to `gpt-5.5 / medium / dwarf / auditor`, while demoting the old low-cost primary to minimum-viable because it lost model manifest, compatibility, and per-need handoff detail against the `gpt-5.5 / xhigh` anchor.
- Recalibrated `.workflow/simulation_deck_prepare_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4-mini / medium / dwarf / auditor` to the previous shadow `gpt-5.4 / medium / dwarf / auditor`, after required `gpt-5.5` low/medium/xhigh comparison showed all required profiles were quality-equivalent but the previous shadow had the best CLI proxy value.
- Recalibrated `.workflow/simulation_run_verify_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / low / human / auditor` to `gpt-5.5 / low / human / auditor`, while keeping `gpt-5.5 / xhigh` as the evaluator ceiling and preserving the blocked-vs-failed / execution-vs-acceptance boundaries.
- Recalibrated `.workflow/page_quantitative_enrichment_v0/` after tightening the local `workflow-optimizer` skill's quality-equivalence policy: demoted the cheap `gpt-5.4 / low / elf / auditor` recommendation, selected `gpt-5.4 / medium / dwarf / auditor` as the quality-equivalent primary, and kept `gpt-5.5 / low / elf / auditor` as the quality shadow.

### Revision `working` - Additional safe workflow profiles quality-equivalence calibrated

- Integrated only the lane-relevant, integration-complete, public-safe recalibrations from the later `workflow-optimizer` sweep after screening out pending, out-of-lane, or not-yet-safe archive variants.
- Promoted stronger quality-equivalent `gpt-5.5` primaries for `whole_xml_page_split_v0`, `page_xml_normalize_spec_v0`, and `capture_xml_intake_library_v0`.
- Activated or refreshed safe workflow defaults for `official_source_packet_collect_v0`, `asset_patch_attach_mdd_v0`, `simulator_policy_packet_v0`, `simulation_stimulus_measurement_packet_v0`, `xml_harness_composition_v0`, `source_gap_followup_packet_v0`, `review_action_item_closure_loop_v0`, `configuration_baseline_and_change_control_v0`, `project_readiness_digest_v0`, `accepted_verification_result_packet_v0`, and `owner_decision_packet_v0`.
- Archived each adopted recalibration under `calibrations/cal_20260515_quality_equiv_001/` inside the target workflow and labeled these runs as CLI-only fallbacks where isolated subagent/candidate-runner telemetry was unavailable.

### Revision `working` - Review gate evidence pack workflow added

- Added `.workflow/review_gate_evidence_pack_v0/` as a public-safe review-readiness workflow over trace, interface-control, verification-plan, source-gap, harness, configuration, owner-decision, and open-question refs.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the verification planning lane.
- Defined explicit outputs for `review_gate_packet`, `source_index`, `evidence_matrix`, `entrance_criteria_checklist`, `success_criteria_checklist`, `review_blockers`, `action_item_register`, `decision_summary`, `review_gate_provenance`, `readiness_summary`, and `boundary_review_note`.
- Mapped the packet shape lightly to SRR/SFR/PDR/CDR/TRR/FCA/SVR/PCA-style review conversations while keeping review families as local readiness lenses, not heavyweight ceremony or automatic gate closure.
- Required decisions to stay separate from proposed decisions and deferred decisions, with actual decisions needing scoped owner decision evidence.
- Kept the package evidence-packaging-only: it does not approve a review gate, certify verification completion, replace owner judgment, make missing sources true, mutate upstream packets, or make private evidence public-safe.
- Kept source XML, normalized sidecars, upstream packets, verification results, test logs, simulation outputs, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-tailored review-readiness pilot that consumed trace, interface-control, verification-plan, source-gap, and harness packet refs and produced a `ready_with_named_caveats` review packet with explicit blockers, action items, proposed decisions, and carry-forward routes.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Review action item closure loop workflow added

- Added `.workflow/review_action_item_closure_loop_v0/` as a public-safe downstream governance workflow after review packets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `review_gate_evidence_pack_v0`.
- Defined explicit closure-loop outputs for `action_closure_packet`, `action_closure_ledger`, `closure_status_matrix`, `unresolved_action_items`, `closure_ready_reruns`, `closure_blockers`, `carry_forward_register`, `owner_decision_request_queue`, `closure_provenance`, and `boundary_review_note`.
- Kept the first version contract-only: it tracks action status, closure evidence refs, rerun-ready routes, and carry-forward state, but it does not approve decisions, auto-close actions, execute reruns, or mutate upstream packets.
- Executed a first controlled private closure-loop pilot over the representative review gate action register, writing closure rows, unresolved-action tracking, carry-forward routes, owner decision requests, and rerun-ready logic without claiming action closure or owner approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Verification plan from page contracts workflow added

- Added `.workflow/verification_plan_from_page_contracts_v0/` as a public-safe verification planning workflow over trace rows, quantitative gaps, simulation-source readiness, interface-control ceilings, harness blockers, source gaps, configuration refs, and scoped owner decisions.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the source-gap follow-up lane.
- Defined explicit planning outputs for `verification_plan`, `verification_requirements_matrix`, `method_map`, `evidence_need_register`, `verification_gap_register`, `test_or_simulation_readiness`, `owner_followup_needed`, `trr_readiness_handoff`, and `fca_svr_handoff_index`.
- Required inspection, analysis, simulation, test, demonstration, owner-review, and not-ready methods to remain distinct, with missing evidence preserved as blockers or review-needed actions.
- Kept the package planning-only: it does not run tests or simulations, accept verification results, approve TRR, accept FCA/SVR evidence, promote harness connections, or claim pass/fail outcomes.
- Kept source XML, normalized sidecars, upstream packets, model payloads, simulation outputs, test logs, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private representative-item pilot that turned trace/source/quantitative/interface/harness evidence into distinct `inspection`, `analysis`, `simulation`, and `owner_review` planning items with TRR/FCA-SVR handoff seeds.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation source collection workflow added

- Added `.workflow/simulation_source_collect_v0/` as a public-safe pre-deck and pre-run/verify workflow for collecting or indexing official, owner-approved local, and tool-library simulation source assets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after quantitative enrichment and before harness composition.
- Defined explicit outputs for `simulation_source_packet`, `model_inventory`, `model_file_manifest`, `demo_circuit_manifest`, `simulator_compatibility_matrix`, `missing_models`, `access_blockers`, `owner_followup_needed`, and `downstream_handoff`.
- Required PSpice, LTspice, generic SPICE, IBIS, IBIS-AMI, S-parameter, and demo-circuit source families to preserve provenance, dependency, license/terms, and compatibility basis instead of guessing readiness from names or file extensions.
- Made missing models, blocked access, unclear license/tool dependency, unapproved third-party mirrors, and owner follow-up first-class outputs so downstream deck, run, quantitative, and harness workflows can block safely.
- Kept model payloads, raw project data, vendor text, simulator outputs, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed model-source pilot that separated an available official LTspice demo-circuit source, a missing page_02 major-IC model set, and a missing connector-facing SI model need into explicit downstream readiness states.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation deck prepare workflow added

- Added `.workflow/simulation_deck_prepare_v0/` as a public-safe pre-run workflow for staging simulation deck inputs from approved model packets, demo circuits, stimuli, measurements, and simulator policy.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_source_collect_v0`.
- Defined explicit outputs for `simulation_deck_packet`, `deck_input_manifest`, `model_dependency_map`, `unresolved_deck_inputs`, `deck_prepare_blockers`, `owner_followup_needed`, `downstream_handoff`, and `boundary_review_note`.
- Kept the first version conservative: it prepares or blocks deck inputs, but it does not execute simulations, verify results, or invent missing models.
- Executed a first controlled private representative deck-prepare pilot that separated one prepared LTspice demo-circuit input from unresolved policy/measurement prerequisites and missing-model blockers.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation run verify workflow added

- Added `.workflow/simulation_run_verify_v0/` as a public-safe run/verify workflow for executing a bounded simulation or recording why execution is blocked.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_deck_prepare_v0`.
- Defined explicit outputs for `simulation_run_packet`, `run_manifest`, `measurement_results`, `result_verdicts`, `run_blockers`, `owner_followup_needed`, `downstream_handoff`, and `boundary_review_note`.
- Executed a first controlled private blocked-run pilot that wrote run metadata, blocker rows, and a blocked verdict without inventing measurement or waveform results.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Configuration baseline and change control workflow added

- Added `.workflow/configuration_baseline_and_change_control_v0/` as a public-safe governance workflow for inventorying baseline refs, tracking change requests, and routing baseline-affecting reruns or carry-forward actions without approving baselines or mutating upstream artifacts.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `review_action_item_closure_loop_v0`.
- Defined explicit outputs for `configuration_baseline_packet`, `baseline_inventory`, `change_request_register`, `impact_matrix`, `baseline_gap_register`, `rerun_routing`, `owner_followup_needed`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative baseline/change-control pilot that inventoried pre-baseline evidence packets, derived change requests from the review lane, and routed reruns or owner follow-up without claiming baseline approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Test harness asset planning workflow added

- Added `.workflow/test_harness_asset_planning_v0/` as a public-safe planning workflow for the physical, simulation, or software harness assets needed to verify page modules and composed harness candidates.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `functional_configuration_audit_page_library_v0`.
- Defined explicit outputs for `test_harness_manifest`, `test_interface_list`, `simulation_fixture_needs`, `instrumentation_resource_list`, `trr_readiness_checklist`, `planning_blockers`, `owner_followup_needed`, and `boundary_review_note`.
- Executed a first controlled private representative planning pilot that turned verification-plan TRR seeds into test-interface, simulation-fixture, instrumentation-resource, and planning-blocker packets.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Source packet sufficiency review workflow added

- Added `.workflow/source_packet_sufficiency_review_v0/` as a public-safe governance workflow for deciding whether current source/material/layout/simulation packets are sufficient for a bounded claim family.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `test_harness_asset_planning_v0`.
- Defined explicit outputs for `source_sufficiency_packet`, `evidence_coverage_table`, `blocked_fields_register`, `owner_followup_needed`, `allowed_claim_ceiling`, `rerun_routes`, and `boundary_review_note`.
- Executed a first controlled private representative sufficiency-review pilot that classified LT8624S power evidence, EXT_IO boundary evidence, page_02 rail semantics, and page_02 simulation evidence into source-supported, review-required, or blocked claim ceilings.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Owner decision packet workflow added

- Added `.workflow/owner_decision_packet_v0/` as a public-safe workflow for recording scoped owner decisions and their downstream effect.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `accepted_verification_result_packet_v0`.
- Defined explicit outputs for `owner_decision_packet`, `decision_effect_register`, `downstream_effect_map`, and `boundary_review_note`.
- Executed a first controlled private representative pilot that recorded architecture-policy owner decisions for immutable source XML, sidecar-first module contracts, and harness-as-derived-layer boundaries.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Accepted verification result packet workflow added

- Added `.workflow/accepted_verification_result_packet_v0/` as a public-safe workflow for recording accepted verification results, blocked/inconclusive result rows, and acceptance provenance.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` before `owner_decision_packet_v0`.
- Defined explicit outputs for `accepted_verification_result_packet`, `result_summary`, `accepted_result_rows`, `blocked_or_inconclusive_rows`, `acceptance_provenance`, and `boundary_review_note`.
- Executed a first controlled private representative blocked-result pilot using the device-name-fix integrity report as candidate evidence, while keeping `accepted_result_rows` empty pending scoped owner acceptance and tool-flow confirmation.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulator policy packet workflow added

- Added `.workflow/simulator_policy_packet_v0/` as a public-safe workflow for recording trusted local simulator runtime identity or probe evidence, owner execution authorization posture, and runtime blockers.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_run_verify_v0`.
- Defined explicit outputs for `simulator_policy_packet`, `runtime_probe_summary`, `execution_authorization_state`, `runtime_blockers`, and `boundary_review_note`.
- Executed a first controlled private representative blocked-runtime pilot using the local simulation-runtime probe and LT3045 demo candidate context, while keeping execution authorization blocked pending trusted runtime and owner approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.
- Later private runtime-refresh evidence confirmed that local `psp_cmd.exe` is callable, so the main remaining blocker is now scoped execution approval and runnable input completeness rather than total runtime absence.

### Revision `working` - Simulation stimulus measurement packet workflow added

- Added `.workflow/simulation_stimulus_measurement_packet_v0/` as a public-safe workflow for recording bounded stimuli or operating conditions, measurement definitions, execution-scope notes, and missing-input blockers.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulator_policy_packet_v0`.
- Defined explicit outputs for `stimuli_or_operating_conditions_packet`, `measurement_definition_packet`, `execution_scope_note`, `input_packet_blockers`, and `boundary_review_note`.
- Executed a first controlled private representative seed-input pilot using the LT3045 demo template example, while keeping owner approval and execution readiness out of scope.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation run verify positive example added

- Added a second private representative `simulation_run_verify_v0` example using a local vendor `OPA197` PSpice example staged into a bounded run-local workspace.
- Confirmed callable `psp_cmd.exe` execution and captured a positive executed-run packet with observed output data.
- Kept the result verdict `inconclusive` because no approved pass/fail rule was bound, preserving the boundary between execution success and accepted verification.

### Revision `working` - Technical risk open question burndown workflow added

- Added `.workflow/technical_risk_open_question_burndown_v0/` as a public-safe governance workflow for packaging current technical risks and open questions into a bounded burndown register.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `physical_configuration_audit_asset_package_v0`.
- Defined explicit outputs for `technical_risk_register`, `open_question_register`, `burndown_summary`, `closure_criteria_register`, `owner_followup_needed`, `rerun_routes`, and `boundary_review_note`.
- Executed a first controlled private representative risk/open-question pilot that grouped source, interface, quantitative, and simulation uncertainty into one burndown packet with closure criteria and rerun routes.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Functional configuration audit page library workflow added

- Added `.workflow/functional_configuration_audit_page_library_v0/` as a public-safe governance consumer for later FCA/SVR-style functional claim auditing.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `configuration_baseline_and_change_control_v0`.
- Defined explicit outputs for `functional_audit_packet`, `verified_claim_register`, `unverified_claim_register`, `discrepancy_register`, `residual_risk_register`, `audit_readiness`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative audit pilot that packaged unverified, discrepancy, and residual-risk rows without claiming accepted verification evidence or owner acceptance.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Physical configuration audit asset package workflow added

- Added `.workflow/physical_configuration_audit_asset_package_v0/` as a public-safe governance consumer for later PCA-style package alignment auditing.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `source_packet_sufficiency_review_v0`.
- Defined explicit outputs for `physical_audit_packet`, `artifact_inventory_report`, `checksum_report`, `missing_or_mismatched_artifacts`, `release_blocking_discrepancies`, `owner_followup_needed`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative physical audit pilot that verified LT8624S package artifacts and checksum rows while keeping missing formal baseline approval as a release-blocking discrepancy.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Interface control and harness readiness workflow added

- Added `.workflow/interface_control_and_harness_readiness_v0/` as a public-safe governance bridge before or alongside harness composition.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `page_module_trace_matrix_v0` and before source-gap follow-up aggregation.
- Defined explicit outputs for `interface_control_ledger`, `harness_readiness_matrix`, `blocked_interface_items`, `review_required_interface_items`, `candidate_safe_possible_items`, `source_supported_possible_items`, `owner_followup_needed`, and `interface_open_questions`.
- Required `local_internal_candidates` to remain non-external by default and to block harness endpoint use unless scoped reclassification evidence exists.
- Kept readiness statuses as ceilings for downstream `xml_harness_composition_v0`; the package does not mutate upstream packets, replace harness composition, or overclaim source support.
- Kept source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, trace matrices, harness packets, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private pilot over the representative power/interface/ambiguous page trio plus an existing blocked/review-required harness packet, writing full readiness-ceiling, blocker, follow-up, and harness-input-delta outputs.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page module trace matrix workflow added

- Added `.workflow/page_module_trace_matrix_v0/` as a public-safe governance workflow for row-level traceability across page, source, materials, layout, quantitative, and harness packets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `xml_harness_composition_v0` and before source-gap follow-up aggregation.
- Defined explicit outputs for `trace_matrix`, `evidence_authority_map`, `trace_gap_register`, `harness_trace_delta`, `verification_seed_matrix`, `review_gate_evidence_index`, `trace_provenance`, and `boundary_review_note`.
- Required row-level `source_confirmed`, `derived`, `review_required`, and `missing` evidence states to remain distinct from harness claim status and review decisions.
- Kept source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, harness contracts, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Extended the contract so trace runs may also consume `interface_control_and_harness_readiness_v0` packet refs and write `interface_readiness_ceiling` rows.
- Executed a first controlled private representative-row pilot that linked page identity, source coverage, quantitative fills/gaps, interface readiness ceilings, blocked/review-required harness claims, open questions, and verification seeds into one trace spine.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Source gap follow-up packet workflow added

- Added `.workflow/source_gap_followup_packet_v0/` as a public-safe follow-up workflow for aggregating source/evidence gaps from source, materials, layout, quantitative, and harness lanes.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `xml_harness_composition_v0`.
- Defined explicit outputs for `source_gap_followup_packet`, `gap_dedup_index`, `owner_action_queue`, `owner_source_batch_manifest.template`, `download_or_reuse_batch_manifest`, `retry_trigger_register`, and `downstream_unblock_map`.
- Required owner-provided files and manual downloads to be re-indexed by the narrowest owning source/evidence workflow before any source-supported, quantitative, layout, material, or harness claim can change.
- Kept raw project payloads, source files, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-gap pilot that aggregated 19 upstream gap refs into 14 stable aggregate gaps, deduplicated repeated Analog public-source failures, wrote concrete owner-action batches, and produced narrow retry triggers without changing source authority.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Official source packet collection workflow added

- Added `.workflow/official_source_packet_collect_v0/` as a public-safe source-bootstrap workflow for official, owner-approved local, missing, blocked, and not-applicable source states.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` as an upstream/sidecar source packet lane for materials, layout, simulation, ECAD, and harness workflows.
- Defined provenance-first outputs for `source_packet_manifest`, `source_inventory`, `source_gap_report`, `owner_followup_needed`, `download_or_reuse_manifest`, and `downstream_ready_refs`.
- Kept raw project payloads, vendor document text, downloaded binaries, model payloads, runtime absolute paths, credentials, cookies, sessions, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-state pilot that combined owner-approved local official LT8624S collateral, reachable official public URLs for AD8338/AD7380-4/ADG1634 source families, rejected third-party Mouser mirrors, and missing simulation/ECAD source kinds into one downstream-ready packet.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page quantitative enrichment workflow added

- Added `.workflow/page_quantitative_enrichment_v0/` as a public-safe overlay workflow for source-backed quantitative enrichment of `page_module_spec_v0` sidecars.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after optional source/material/layout evidence workflows and before harness composition.
- Defined explicit outputs for `quantitative_claims`, `enriched_sidecar_overlay`, `source_gap_report`, `owner_followup_needed`, `harness_readiness_delta`, and enrichment provenance.
- Required every quantitative value to be `source_confirmed`, transparently `derived`, `review_required`, or `missing`; forbidden label/default/memory/harness-pressure guessing.
- Kept the original sidecar, source XML, intake packets, source packets, materials packets, layout guides, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, and private run truth out of public workflow canon.
- Completed controlled private helper-card pilots across power (`lt8624s`), interface (`ext_io_conn`), and ambiguous/channelized (`02_4ch_vga_ch5_8`) pages, including an ambiguous-page run that consumed an upstream official-source packet and wrote device-scope fills plus page-scope gaps.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - SE foldertree pre-study basic variant added

- Added a dry-runable `선행연구 / 공통 / 없음` bundled basic spec to `se_foldertree_generate`.
- Updated the supported input matrix and references so pre-study can be selected as its own explicit variant instead of overloading `탐색개발`.
- Kept the new pre-study spec contractor-neutral and public-safe, with task surfaces focused on background definition, prior-art review, concept options, transition judgment, and next-stage recommendation.

### Revision `working` - SE foldertree draft variant preview lane added

- Added a non-materializing draft variant preview lane to `se_foldertree_generate`, separating `common_se_base_v0`, `lig_grade_a_overlay_v0`, and `operational_rd_no_grade_candidate_v0`.
- Added `preview_variants.py` so draft variant metadata can be checked without changing the production `generate_tree.py` path or creating project folders.
- Documented that current production support remains `체계개발 / LIG 넥스원 / A` and that operational-R&D/no-quality-grade remains blocked until source or owner policy evidence exists.

### Revision `working` - workmeta always-on merge guard clarified

- Clarified that the 24-hour PC only auto-syncs `_workmeta/main` by fast-forward and must not auto-merge stale work branches or PC-specific branches into `main`.
- Documented that bounded metadata from another PC should be promoted by cherry-pick, rebase, or manual port after `main` is current.
- Added conflict handling guidance for shared `_workmeta` policy/log surfaces so `README.md`, `CHANGELOG.md`, worklogs, and promotion registers preserve latest `main` policy and append new records.
## 2026-05-15

### Revision `working` - Page XML normalization profile refreshed

- Re-ran `.workflow/page_xml_normalize_spec_v0/` profile calibration after the workflow contract added stronger `system_contract`, interface-group, annotation-variant, and harness-readiness expectations.
- Kept the primary profile as `gpt-5.4` `medium` with `elf` + `auditor` after repeat Top-K subagent quality runs and CLI proxy telemetry for pass candidates.
- Archived the public-safe repeat calibration under `.workflow/page_xml_normalize_spec_v0/calibrations/20260515-021140_repeat_topk_contract_refresh/`.
- Rejected `gpt-5.4-mini` shadows under the refreshed gate because they altered source identity, left `system_contract` too empty, or collapsed required per-page sidecar blocks.
- Kept raw XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - XML harness composition workflow added

- Added `.workflow/xml_harness_composition_v0/` as a public-safe derived harness-layer workflow for composing prepared page-level XML assets into a project-local harness packet.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the page split, normalize, intake, materials, and layout-guide preparation chain.
- Defined explicit `blocked`, `review_required`, `candidate_safe`, and `source_supported` lanes, including missing-source, source-gap, missing-quantitative, local/internal misuse, no-connect, and ambiguity handling.
- Kept source XML, normalized sidecars, intake packets, materials packets, layout guides, raw project payloads, vendor text, runtime paths, credentials, cookies, `_workspaces`, and private run truth out of public workflow canon.
- Marked the package `pilot_ready_contract_only`; a controlled project-local harness pilot and independent review are still required before claiming pilot-executed or usable behavior.
- After the private harness pilot landed, updated the profile-policy gate from `pending_pilot_and_calibration` to `pending_profile_calibration` so the public execution-profile note matches the actual pilot state.

## 2026-05-14

### Revision `working` - EXP XML materials quality profile promoted

- Promoted `.workflow/exp_xml_component_materials/profile_policy.yaml` from `gpt-5.4-mini` `medium` to `gpt-5.5` `medium` with `orc` + `archivist` after a quality-first scoped contract probe.
- Archived the public-safe page-fragment/local-reuse probe under `.workflow/exp_xml_component_materials/calibrations/20260514-2155_quality_priority_contract_probe/`.
- Selected the cleaner `gpt-5.5` profile because it preserved page-level scope, context-only handoff boundaries, owner-approved local official collateral evidence, and explicit `DATA Sheet`/`EVAL` destination placement.
- Kept real EXP.xml bodies, downloaded vendor binaries, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public archive.

### Revision `working` - Page XML normalization profile calibrated

- Calibrated `.workflow/page_xml_normalize_spec_v0/` with public-safe structural metadata derived from the already public-safe `whole_xml_page_split_v0` calibration archive, covering 11 ordered page sidecars, source checksums, immutable source XML policy, blank normalized refs, review-required semantics, local/internal candidate separation, and downstream `capture_xml_intake_library_v0` handoff.
- Set the workflow primary profile to `gpt-5.4` `medium` with `elf` + `auditor`, retaining faster `gpt-5.4-mini` shadows after their Stage C reruns stayed `pass_with_gaps` or failed coverage.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, manual gate review, final ranking, and recommendation under `.workflow/page_xml_normalize_spec_v0/calibrations/20260514-205331_staged_cli_public_structural/`.
- Kept raw XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - Capture/materials page-fragment contracts clarified

- Clarified `.workflow/capture_xml_intake_library_v0/` so whole-export inputs and page-fragment XML inputs have distinct expectations: page fragments produce page-level intake only, with normalize sidecars/handoffs accepted only as non-authoritative review context.
- Clarified `.workflow/exp_xml_component_materials/` so page-fragment `exp_xml_source` inputs can produce bounded page-level source packets without implying full-design material coverage.
- Allowed owner-approved local official collateral reuse in `exp_xml_component_materials` when provenance and checksum/file evidence are preserved, while keeping `exp_xml_source` authoritative and downstream handoff context-only.

### Revision `working` - Layout guide source-gap fallback clarified

- Clarified `.workflow/component_pcb_layout_guide_extraction/` so missing official layout guidance no longer means the workflow must silently stall or fabricate guidance.
- Added a bounded degraded path where the workflow writes a `Layout Guide/` source-gap packet that records attempted sources, blocker reasons, unresolved gaps, and owner follow-up needs when official layout guidance cannot be acquired.
- Kept source-bound output requirements intact: no unsupported layout claims, no public-canon vendor text, and no runtime project payload leakage.

### Revision `working` - Page normalize system-contract slots expanded

- Expanded `.workflow/page_xml_normalize_spec_v0/` so `page_module_spec_v0` now includes a required `system_contract` block for harness-facing electrical, signal, quantitative, and readiness/source-gap slots.
- Added support for interface groups, electrical domains, signal families, quantitative placeholder slots, and explicit `harness_ready` / `source_gap` / `owner_followup` contract fields while keeping all of them conservative and review-oriented.
- Kept normalization source-safe: the workflow still does not infer confirmed topology, perform harness composition, or promote unsupported quantitative values to truth.

### Revision `working` - Harness composition first private pilot executed

- Executed the first private pilot of `.workflow/xml_harness_composition_v0/` against representative power, interface, and ambiguous/channelized prepared page assets.
- The resulting derived harness packet produced explicit `blocked` and `review_required` joins, with no `candidate_safe` or `source_supported` promotions, confirming the intended conservative behavior.
- Updated the workflow package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page module sidecar refinement hints

- Refined `.workflow/page_xml_normalize_spec_v0/` with optional `module_scope`, `channelization`, `classification_basis`, and `interfaces.local_internal_candidates` fields for conservative page-module sidecars.
- Kept required external interface containers unchanged and preserved the sidecar-first, immutable-source-page contract.
- Aligned the private `page_module_spec_v0` first-draft note and example YAML with the new review-hint fields.

### Revision `working` - Page XML normalization sidecar alignment

- Realigned `.workflow/page_xml_normalize_spec_v0/` with the fixed `page_module_spec_v0` first draft so per-page `page_module_spec_v0.yaml` sidecars and manifests are the primary outputs.
- Recentered the workflow on immutable source page XML, metadata-first identity/provenance/interface/review fields, and optional derived annotated XML variants that remain review-only.
- Kept the existing `.workflow/index.yaml` registration in place and updated the workflow catalog wording to describe the sidecar-first package.
- Followed the alignment with a private 11-page split-fixture pilot matrix, lifting the workflow package from `pilot_ready_contract_only` to `pilot_executed_private_fixture` while keeping ambiguous semantics as review-required.

### Revision `working` - Page XML normalization workflow added

- Added `.workflow/page_xml_normalize_spec_v0/` as a public-safe bridge workflow for turning page XML assets from `whole_xml_page_split_v0` into project-local normalized page assets, registration-prep units, manifests, provenance updates, warnings, and downstream handoff packets.
- Registered the workflow in `.workflow/index.yaml` between `whole_xml_page_split_v0` and XML-first asset registration, and listed it in `.workflow/README.md`.
- Kept raw page XML bodies, generated normalized page payloads, runtime absolute paths, `_workspaces` output data, `_workmeta` raw truth, credentials, cookies, secret material, material collection, MDD attachment, and harness composition out of the public workflow package.
- Marked the workflow as `pilot_ready_contract_only`; a controlled normalization pilot is still required before claiming pilot-executed behavior.

### Revision `working` - Whole XML page split workflow added

- Added `.workflow/whole_xml_page_split_v0/` as a public-safe first-step workflow for splitting one project-bound large multi-page XML source into project-local page XML assets, manifest, index, provenance, and readiness notes.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` as upstream of planned `page_xml_normalize_spec_v0`.
- Kept source XML read-only and kept normalization, XML-first asset registration, material collection, MDD attachment, raw XML bodies, runtime paths, project-local output payloads, credentials, cookies, and private run truth out of the public workflow package.
- Completed a controlled private real-sample pilot that split one large multi-page XML source into 11 page XML assets and downstream manifest/index/provenance/readiness outputs consumed by the page-normalization lane.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Whole XML page split profile calibrated

- Calibrated `.workflow/whole_xml_page_split_v0/` with public-safe structural metadata derived from the supplied real sample XML, covering 11 `Page` boundaries, titleblock `Page Count = 8` conflict handling, missing/non-contiguous page-number signals, source-order page ids, manifest/index/provenance shape, and downstream `page_xml_normalize_spec_v0` handoff.
- Set the workflow primary profile to `gpt-5.4` `high` with `dwarf` + `archivist`, retaining `gpt-5.5` shadows and a downgraded `gpt-5.4-mini` fallback note after Stage C instability.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, shortlist review, final ranking, and recommendation under `.workflow/whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/`.
- Kept real XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - XML-first asset registration and later MDD patch workflows

- Extended `.workflow/capture_xml_intake_library_v0/` so XML-first intake now creates `asset_identity` and `pcb_pairing_placeholder` metadata, and can record an optional owner-supplied initial MDD attachment without overclaiming XML↔MDD pairing proof.
- Added `.workflow/asset_patch_attach_mdd_v0/` as a follow-on workflow for later owner-supplied MDD attachment and asset-version bump after the initial XML-first registration already exists.
- Kept raw XML, raw MDD payloads, runtime absolute paths, `_workspaces` output data, credentials, cookies, and private run truth out of public workflow canon.
- Executed a first controlled private LT8624S attachment pilot using a real owner-supplied `.mdd` file and updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Capture XML intake profile calibrated

- Calibrated `.workflow/capture_xml_intake_library_v0/` with a public-safe synthetic Capture XML fixture covering PartInst-vs-Package separation, explicit net extraction, connector confidence, power/no-connect review, provenance, and downstream handoff.
- Set the workflow primary profile to `gpt-5.4` `medium` with `elf` + `administrator`, retaining `gpt-5.5` shadows and lower-cost fallback notes.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, finalist review, final ranking, and recommendation under `.workflow/capture_xml_intake_library_v0/calibrations/20260514-135122_staged_cli_matrix/`.
- Kept real EXP.xml bodies, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - EXP XML materials handoff profile recalibrated

- Re-ran `.workflow/exp_xml_component_materials/` profile optimization against a public-safe synthetic fixture that includes optional `capture_xml_intake_library_v0` `downstream_handoff` context.
- Archived the repeat Top-K calibration under `.workflow/exp_xml_component_materials/calibrations/20260514-1401_repeat_intake_handoff_topk/`.
- Updated `.workflow/exp_xml_component_materials/profile_policy.yaml` from `gpt-5.4-mini` `low` to `gpt-5.4-mini` `medium` while keeping `orc` + `archivist`, because the previous low-effort primary did not pass the richer handoff-context quality gate.

### Revision `working` - Capture XML intake library workflow added

- Added `.workflow/capture_xml_intake_library_v0/` as an upstream read-only intake workflow for turning a project-bound Capture `EXP.xml` into block, net, connector, power, open-question, provenance, and downstream handoff artifacts.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` before `exp_xml_component_materials`.
- Recorded the first package as pilot-executed from a bounded private system-lab fixture while keeping raw XML, fixture values, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, and cookies out of public canon.

### Revision `working` - EXP XML materials intake handoff context linked

- Updated `.workflow/exp_xml_component_materials/` so it can optionally read `capture_xml_intake_library_v0` `downstream_handoff` context without making the handoff mandatory.
- Kept `exp_xml_source` authoritative for component identity, placed inventory, manufacturer part number, and connectivity while allowing intake context to prioritize connector/interface refs, power-sensitive refs, and open topology review items.
- Documented candidate-only intake observations as review context, not confirmed material-collection truth.

## 2026-05-13

### Revision `working` - workmeta shared metadata plane clarified

- Clarified current-default `_workmeta` policy as the owner-only shared metadata plane across PCs, including project metadata, run truth, logs, analytics, and artifact metadata when they are part of cross-PC handoff.
- Clarified that non-metadata state such as actual `_workspaces` files, machine-local temp/cache, secrets, raw mail bodies, and attachment binaries stay outside `_workmeta` shared history.
- Added a deterministic `guild-hall:workmeta:sync` command and updated always-on/update/handoff docs so a 24-hour PC can periodically pull/push `_workmeta` metadata alongside activity continuity handling.

### Revision `working` - always-on short fixes added

- Removed tracked Python bytecode artifacts from gateway mail-fetch and town-crier so runtime commands stop dirtying the public worktree.
- Added healer failure queueing via `--notify-on-failure`, keeping the Telegram brief body-safe with only failed check ids, summary, and report ref.
- Added a public-safe launchd deployment surface with render/install/verify helpers for mail-fetch, healthcheck, town-crier, and healer light/full jobs.

### Revision `working` - always-on sync retry policy clarified

- Added a bounded retry policy for always-on public pull and activity sync failures that look like transient GitHub, DNS, or network issues.
- Limited retries to three total attempts with 60-second and 180-second waits, while keeping dirty worktree, non-main branch, and merge-required states as immediate blockers.
- Kept raw mail, attachment, mailbox payload, `_workmeta`, `_workspaces`, and secret reads out of retry handling.

### Revision `working` - always-on heartbeat pull preflight clarified

- Clarified that the hourly Codex `Soulforge 운영 감시` heartbeat should fast-forward pull clean public `main` before health checks and activity sync.
- Kept the 09:00/18:00 `always-on activity sync` automation as a dedicated fallback path for activity mirror sync.
- Documented that GitHub/DNS/network failures should be reported as stale/blocker conditions without reading raw mail, attachments, mailbox payloads, or secrets.

### Revision `working` - workflow_optimizer default execution gate clarified

- Clarified that a full `workflow_optimizer` run request covers the skill's default isolated quality matrix and CLI telemetry probes without requiring separate user wording for subagents or CLI.
- Preserved the guard that CLI-only full-matrix calibration is an explicit fallback and must not be mislabeled as `subagent_quality_first`.
- Kept the default candidate set excluding the `gpt-5.3-*` family unless the user explicitly asks for 5.3 comparison.

### Revision `working` - workflow lab owner and maturity ladder clarified

- Clarified `_workmeta/system/` as the reserved private reusable-workflow lab owner for project-agnostic run evidence and procedure-capture notes.
- Clarified reserved `_workspaces/system/` usage for local-only workflow pilot outputs and fixture materialization that are not owned by a delivery project.
- Added a human-facing workflow maturity ladder of `draft -> pilot -> usable -> canon` and documented that canon registration in `.workflow/index.yaml` is separate from runtime validation/readiness notes.
- Corrected the project map so the top-level root list no longer advertises a `scripts/` directory that is not part of the current repo tree.

### Revision `working` - component PCB layout guide profile calibration

- Calibrated `.workflow/component_pcb_layout_guide_extraction/` with a public-safe synthetic component-material fixture covering source-bound layout spans, supplemental source handling, cited-page figures, table promotion/rejection, and unresolved component review.
- Set the workflow primary profile to `gpt-5.4-mini | medium | elf | archivist`, with `gpt-5.4 | low | elf | archivist` and `gpt-5.4 | medium | elf | archivist` retained as quality-passing shadows.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, semantic shortlist evaluation, final ranking, and recommendation under `.workflow/component_pcb_layout_guide_extraction/calibrations/20260513-204517_staged_cli_matrix/`.
- Kept real PDFs, copied vendor text, runtime Layout Guide outputs, project-local paths, credentials, cookies, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - device system diagram profile calibration

- Calibrated `.workflow/device_system_diagram_generation/` with a public-safe synthetic wearable gateway fixture.
- Set the workflow primary profile to `gpt-5.4-mini | low | human | administrator`, with `gpt-5.4 | low | human | administrator` retained as the quality-upgrade shadow.
- Archived staged CLI candidate outputs, telemetry, quality-gate criteria, finalist ranking, and recommendation under `.workflow/device_system_diagram_generation/calibrations/20260513-202816_staged_cli_matrix/`.
- Kept project raw input, REF packets, accepted outputs, verifier reports, credentials, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - exp XML materials profile calibration

- Calibrated `.workflow/exp_xml_component_materials/` with a public-safe synthetic EXP.xml fixture and mocked official-source/download evidence.
- Set the workflow primary profile to `gpt-5.4-mini | low | orc | archivist`, with `gpt-5.5` and `gpt-5.4-mini|medium` profiles preserved as shadows.
- Archived CLI JSONL telemetry, candidate outputs, quality-gate criteria, final ranking, and recommendation under `.workflow/exp_xml_component_materials/calibrations/20260513-183307_staged_matrix/`.
- Kept real EXP.xml contents, downloaded vendor binaries, credentials, cookies, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - workflow_optimizer Codex bridge refactor

- Refactored `.registry/skills/workflow_optimizer/codex/SKILL.md` into a lean operating router and moved detailed run flow, candidate matrix, telemetry/evaluation, and archive/policy contracts into `codex/references/`.
- Clarified that isolated subagent matrix execution requires available tools plus user/developer policy authorization, and that CLI-only calibration must be explicit rather than silent fallback.
- Tightened workflow policy write boundaries so public `.workflow/**` updates happen only when the user requested or confirmed calibration archive/profile policy writes.

### Revision `working` - sample workflow canon cleanup

- Removed the old `frontline_assault` and `build_lineage_map` sample workflows from active workflow canon to avoid presenting test scaffolds as current operating workflows.
- Removed the matching `vanguard_strike` and `lineage_strike` sample party templates and retired their demo unit surfaces from `.unit/`.
- Updated species recommendation biases and UI fixtures to use the current guild-master authoring lane instead of the retired sample workflow/party.
- Fixed guild-master party slot references to the actual `guild_master` unit id.
- Fixed Windows validation execution for the UI done-check and theme package smoke paths.

### Revision `working` - PCB layout guide extraction workflow added

- Added `.workflow/component_pcb_layout_guide_extraction/` as a follow-on workflow for turning per-component `DATA Sheet` and `EVAL` materials into project-local `Layout Guide` Markdown, source maps, extraction manifests, and checksum-keyed caches.
- Registered the workflow in `.workflow/index.yaml` while keeping runtime part folders, extracted vendor text, figures, tables, and supplemental downloads outside public canon.
- Added token-control gates so PDF files are indexed and filtered into layout candidate spans before AI synthesis reads them.
- Added official supplemental-source download gates for missing layout guidance, with PDF/ZIP magic validation, source URL, byte size, and SHA256 requirements.
- Evolved the figure/table stage to use separate extraction tools by signal type: PyMuPDF for layout-candidate page/context PNG renders, Camelot strict quality-filtered Markdown tables, and pdfplumber only as a raw fallback candidate extractor.
- Clarified figure/table source-map and manifest records, including strict-vs-raw table counts, tool versions, output checksums, extraction warnings, and separate raw candidate folders.
- Added a layout-only promotion stage so PCB-layout-relevant visuals and tables are copied into dedicated `layout_only/` folders while software/setup/noisy candidates remain as context evidence with rejection reasons.
- Reworked figure capture policy so layout-only images must come from `layout_guide.md` cited evidence rather than earlier keyword-only candidate pages.
- Updated cited figure capture so `layout_only/` stores one full-page PNG per unique `layout_guide.md` cited source page, with repeated citations deduplicated and older cited-region crops retained only as runtime context evidence.
- Corrected cited figure output placement so current full-page PNGs live directly under `Layout Guide/figures/`; `figures/layout_only/` is no longer the figure output folder.
- Registered `component_pcb_layout_guide_extraction` as an owner-accepted usable workflow canon entry, with runtime vendor content and generated figures remaining project-local.

### Revision `working` - EXP XML component materials workflow added

- Added `.workflow/exp_xml_component_materials/` as a pilot-ready workflow for parsing a project-provided `EXP.xml` and collecting official datasheets plus EVAL/reference-design files into per-component `DATA Sheet` and `EVAL` folders.
- Registered the workflow in `.workflow/index.yaml` while keeping real EXP.xml contents, downloaded PDFs, PCB archives, credentials, and project-local run truth outside public canon.
- Added a project binding template for output folder shape, official-source download policy, checksum/source manifests, and review queues for ambiguous part identities or gated vendor material.
- Piloted the workflow against a concrete Cadence Capture EXP.xml, confirmed `PartInst` as the placed-component extraction node, and saved official Analog Devices PDF/ZIP materials into the project-local material tree.
- Tightened the workflow completion gate so source links and `.url` shortcuts are not accepted as downloads; actual files with byte size, content type or magic check, and SHA256 are required.
- Evolved the workflow with a larger Cadence Capture fixture, adding DOM-failure parser fallback, Package/SymbolUserProp identity recovery for placeholder part values, generic-passive review queue handling, and strict PDF/ZIP payload validation.

## 2026-05-11

### Revision `working` - device system diagram workflow canon entry added

- Added `.workflow/device_system_diagram_generation/` as an owner-accepted usable workflow for generating editable draw.io device system diagrams from one Markdown input and deriving SVG, PPTX, and PNG outputs.
- Registered the workflow in `.workflow/index.yaml` while keeping project-local paths, REF packets, raw candidates, and run evidence outside the public workflow canon.
- Marked the workflow as usable for project execution and timing checks, not strict REF canon-ready; future REF matching requires a non-oracle schema/source packet or owner-approved acceptance contract update.

Soulforge public repo 의 구조/기능/운영 문서 변경을 버전 대신 revision 단위로 기록한다.
Git log 는 원문 이력을 남기고, 이 문서는 사람이 읽는 patch note 와 운영 영향만 요약한다.

## 기록 원칙

- public repo changelog 는 기능 코드, 구조 문서, bootstrap/doctor/update/handoff 규칙 변경을 기록한다.
- 보호 대상 업무 데이터와 continuity record 는 여기 적지 않고 nested `private-state/CHANGELOG.md` 에 적는다.
- secret 값, credential, token, password 는 절대 기록하지 않는다.

## 2026-05-09

### Revision `working` - workflow_generator portable path policy

- `workflow_generator` Codex bridge now requires reusable workflow/canon outputs to use Soulforge-root-relative POSIX paths instead of host-specific absolute paths.
- Runtime-only absolute paths are explicitly limited to local/private run evidence or subagent prompts with `*_runtime_path` fields paired to portable `*_repo_path` identities.
- Updated workflow generator manifest and evaluation templates to prevent installed skill paths, drive-letter paths, and local run paths from being promoted into `.workflow/**` packages.

### Revision `working` - workflow_generator Codex bridge refactor

- Refactored `.registry/skills/workflow_generator/codex/SKILL.md` into a lean operating router and moved detailed goal/run-state/reporting governance into `codex/references/run-governance.md`.
- Added table-of-contents navigation to long workflow generator references so Codex can load specific details progressively.
- Updated the installed skill UI display name to a human-facing title while preserving the `soulforge-workflow-generator` skill id.

### Revision `working` - mail candidate activity projection 추가

- `guild-hall:activity:project-mail-candidates` 를 추가해 local-only `mail_candidate` queue 의 body-safe 후보 요약을 activity event 로 투영할 수 있게 했다.
- `guild-hall:activity:sync` 가 기본적으로 pending mail candidate 를 `mail_candidate_summary` event 로 투영한 뒤 private-state activity mirror 를 병합/commit/push 하도록 연결했다.
- private-state 로 넘어가는 것은 candidate id, subject, sender, attachment count, received_at, local ref 수준의 summary 이며 raw mail body/html/attachment filename/URL/local path/provider payload/secret 값은 제외한다고 문서화했다.

### Revision `working` - workflow_generator 누적 artifact chain 규칙 보강

- `workflow_generator` Codex bridge가 warm artifact transformation 라운드에서 B1 이후 `EXPn-1 -> EXPn` 누적 후보 체인을 필수로 쓰도록 보강했다.
- fresh subagent와 fresh artifact를 분리해, S는 현재 후보를 검증하고 직전 후보는 delta/regression 기준으로만 사용하며 V는 현재 후보만 REF와 비교하도록 명시했다.
- chain을 사용할 수 없는 warm transformation run은 `blocked_invalid_artifact_chain_policy`로 중단하고, baseline 재시작은 baseline-fixed 평가와 cold/final replay에만 남겼다.

### Revision `working` - always-on healer rollout 기준 추가

- 24시간 PC 감시를 Codex heartbeat 중심이 아니라 launchd + deterministic healer/doctor script 중심으로 늘리는 rollout plan 을 추가했다.
- MacBook Air 는 repo 코드/문서/test/commit/push 를 맡고, 실제 LaunchAgent 설치와 secret/env 연결은 24시간 PC 에서 수행하는 역할 분리를 문서화했다.
- mail fetch, mail healthcheck, town_crier 는 LLM 을 쓰지 않고, LLM 은 morning report 또는 장애 triage 같은 낮은 빈도 advisory 계층에 둔다는 운영 기준을 명시했다.

### Revision `working` - workflow optimizer skill package 등록

- local Codex `workflow-optimizer` 를 `.registry/skills/workflow_optimizer/` canon package 로 등록해 public Git sync 후 다른 PC 에서 `npm run skills:sync -- workflow_optimizer` 또는 `--all` 로 설치할 수 있게 했다.
- tracked Codex bridge 는 현재 workflow profile calibration 규칙을 포함하며, 기본 후보에서 `gpt-5.3-*` 계열을 제외하고 최초 full quality matrix 는 subagent, 품질 통과 후보 telemetry 는 CLI 로 분리한다.

### Revision `working` - author_skill_package profile calibration

- `author_skill_package` workflow 의 public-safe staged subagent calibration archive 를 추가하고, `profile_policy.yaml` 의 active primary profile 을 `gpt-5.4-mini|low|darkelf|archivist` 로 설정했다.
- calibration 은 synthetic `api_contract_drift_check` skill authoring fixture 를 사용했으며, 실제 API spec, customer endpoint, production log, credential, `_workspaces`, `_workmeta`, `private-state` material 은 archive 에 포함하지 않았다.
- Spark 후보는 quality-pass 및 speed shadow 로 보존하되, 공식 Codex rate card 에서 research preview 로 표시되어 primary cost recommendation 에서는 제외했다.
- 후속 분석에서 `gpt-5.3-*` 계열은 active/default 후보에서 제외했다.

### Revision `working` - workflow calibration archive 경계 추가

- `.workflow/<workflow_id>/profile_policy.yaml` 과 `.workflow/<workflow_id>/calibrations/<calibration_id>/` 를 workflow-level profile optimizer 결과의 public-safe 저장 위치로 명시했다.
- 300개 후보 같은 전체 calibration archive 는 public-safe synthetic/redacted artifact 일 때만 workflow 아래에 둘 수 있고, 실제 프로젝트 원문, private transcript, secret, project-local raw run truth 는 계속 제외하도록 owner 경계를 좁혔다.
- profile optimizer 는 추천만 보고하는 것이 아니라 workflow profile policy 와 shadow Top-K 운영 기준을 업데이트하는 흐름으로 정렬했다.
- workflow authoring template 에 `profile_policy.yaml` 과 `calibrations/` scaffold 를 추가해, workflow creator 가 만든 canon entry 를 profile optimizer 가 바로 갱신할 수 있게 했다.
- 실제 앱 운영 품질과 맞추기 위해 기본 calibration mode 를 subagent quality full matrix 로 두고, 비용/토큰 telemetry 는 품질 통과 후보만 CLI proxy 로 측정하도록 profile policy template 을 보강했다.
- `meeting_followup` workflow canon 을 추가하고, 기존 public-safe CLI 300개 후보 matrix 를 workflow-local calibration archive 로 이관할 수 있게 했다.

### Revision `working` - activity sync 명령 추가

- `guild-hall:activity:sync` 를 추가해 24시간 PC 가 local activity event ledger 와 `private-state` activity mirror 를 `entry_id` 기준으로 병합하고 양쪽 `latest_context.json` 을 재생성할 수 있게 했다.
- sync 는 nested `private-state` 의 `main` branch 만 대상으로 fast-forward pull 한 뒤 변경이 있으면 activity surface 만 commit/push 하며, `_workspaces`, `_workmeta`, mailbox raw, attachment payload, secret file 은 읽지 않도록 경계를 고정했다.
- sync 는 allowlist 된 activity event field 만 mirror 하고, malformed JSONL row 는 원본에 보존하되 다른 surface 로 복제하지 않는다. `log/**` markdown/report file 은 별도 sanitizer 가 생길 때까지 mirror 하지 않는다.
- `--json` 결과에서 private git command 의 stdout/stderr 원문을 숨겨 remote URL/credential 이 터미널 출력에 섞이지 않게 했다.
- 복사/붙여넣기가 어려운 24시간 PC 용 `ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md` 를 추가했다.

### Revision `working` - always-on harness 설치 prompt 추가

- 복사/붙여넣기가 어려운 24시간 PC 에서 파일명 한 줄로 workflow evolution harness dependency 설치 확인을 실행할 수 있도록 always-on 전용 prompt source 를 추가했다.
- prompt 는 Codex `/goal`, promptfoo, OpenAI SDK, DSPy 설치 확인까지만 수행하고 gateway/healer/night_watch 설정과 workflow evolution 실험 실행은 건드리지 않도록 경계를 명시했다.
### Revision `working` - workflow_generator skill package added

- Added `.registry/skills/workflow_generator/` as the tracked canon and Codex bridge package for the source-bound workflow generation skill.
- The package materializes to the installed `soulforge-workflow-generator` skill through `npm run skills:sync -- workflow_generator`.
- Kept runtime run evidence, local artifact paths, candidates, and verifier outputs outside the tracked skill package.

### Revision `working` - Windows doctor harness 확인 보정

- bootstrap doctor 가 Windows 에서 `npm`, `codex`, `promptfoo` 같은 `.cmd` shim 기반 CLI 를 확인할 수 있도록 command check 실행을 보정했다.
- workflow evolution venv 확인이 Windows venv 의 `Scripts/python.exe` 경로도 인식하도록 local path 판정을 보강했다.
- mail candidate queue 가 public-safe source path 를 Windows 에서도 POSIX-style repo path 로 기록하도록 보정했다.

### Revision `working` - workflow evolution harness 설치 계획 추가

- B skill 제작 흐름을 단일 skill 제작이 아니라 `workflow_evolution` discovery/slimming 실험으로 다루는 authoring plan 을 추가했다.
- Codex `/goal`, Ralph-style loop, promptfoo, OpenAI SDK, DSPy, class/species compression 을 public-safe harness 후보로 분리하고, 다른 owner PC 에 반복 설치할 수 있는 runbook 을 추가했다.
- bootstrap checklist 에 Codex CLI, promptfoo, workflow evolution venv optional 확인을 추가하고, MacBook Air baseline 으로 Codex CLI `0.129.0` + `goals=true`, promptfoo `0.121.11`, OpenAI SDK `2.36.0`, DSPy `3.2.1` 을 확인했다.

### Revision `working` - battle_event 최소 schema 추가

- `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl` 에 append 되는 mission-level battle outcome 의 public-safe schema anchor 를 추가했다.
- battle log chain sample 과 play loop 문서를 schema 의 필수 `bottleneck_reason` 및 monthly event stream 위치에 맞게 정렬했다.

### Revision `working` - UI Operation Board projection 소비

- renderer-web Dungeon Map 이 snapshot 의 `operation_board` projection 을 우선 소비해 Dungeon Map, Mission Board, Monster Gate, Next Actions 섹션을 표시하게 했다.
- legacy snapshot field fallback 은 유지하되, UI 가 pending monster group 을 직접 재분류하는 경로는 projection 이 없을 때만 사용하도록 좁혔다.

### Revision `working` - Operation Board projection 추가

- snapshot 에 `operation_board` top-level projection 을 추가해 작전판이 Dungeon Map, Mission Board, Monster Gate, Next Actions 섹션을 원본 재분류 없이 읽을 수 있게 했다.
- projection 은 기존 `projects`, `missions`, `gateway.pending_monsters`, `next_actions`, `diagnostics` 의 sanitized field 만 재조립하며 raw mail body/html/source quote/raw ref/attachment/provider id/secret 값은 계속 제외한다.

## 2026-05-08

### Revision `working` - 작전판 pending monster 분류 표시

- snapshot pending monster projection 에 `display_group` 분류와 `by_display_group` count 를 추가해 Monster Gate 가 blocked/due/routing/identification/open intake 기준으로 묶어 볼 수 있게 했다.
- pending monster display sample cap 을 24건으로 올려 현재 18건 규모의 작전판 표시가 truncation 없이 가능하게 했다.
- UI Dungeon Map 은 snapshot 의 sanitized pending monster item 만 사용해 group별 섹션으로 표시하며 raw mail body/html/source quote/raw ref/attachment 값은 계속 제외한다.

### Revision `working` - 작전판 pending monster snapshot 요약 추가

- snapshot gateway projection 이 `intake_inbox/*/monsters.json` 의 pending/blocked monster 를 제한된 summary 로 집계하게 했다.
- UI Dungeon Map 의 Monster Gate 에 pending monster count 와 sample card 를 표시하게 했다.
- snapshot 과 UI 응답은 body/html/source quote/raw ref/attachment ref/provider id 원문을 복제하지 않고 fixture 기반 test 로 비노출을 고정했다.

### Revision `working` - mail_candidate 승격 명령 추가

- `guild-hall:gateway:mail-candidate:list` 와 `guild-hall:gateway:mail-candidate:promote` 를 추가해 local-only mail candidate 를 `mail_intake_request` payload 로 승격할 수 있게 했다.
- promotion output 은 mailbox event/raw pointer 와 기본 `unknown_monster` 1건을 포함하되 body/html/raw provider payload/첨부명/첨부 URL/secret 은 포함하지 않도록 했다.
- mail candidate promotion 계약과 public-safe request sample 을 문서화했다.

### Revision `working` - mail_candidate 후보 큐 추가

- gateway mail fetch 가 fresh mail event 를 mailbox event JSONL 에 저장한 뒤, `mail` bucket event 를 local-only `mail_candidate` queue 에 적재하게 했다.
- 후보 queue item 은 source event pointer, subject, sender, 수신자/첨부 count, classification summary 만 담고 body/html/raw/첨부명/첨부 URL/secret 은 제외한다.
- `MAIL_CANDIDATE_QUEUE_V0.md` 와 public-safe sample 을 추가해 다른 PC 가 실제 `guild_hall/state/**` 운영 데이터 없이 queue shape 를 재현할 수 있게 했다.

### Revision `working` - gateway index stale 판정 보강

- `intake_inbox` monster index manifest 가 `monsters.json` 의 mtime millisecond 만 보지 않고 size/sha256 fingerprint 도 확인하게 했다.
- 같은 tick 안에서 monster 파일이 갱신돼도 stale manifest 를 재사용하지 않도록 gateway validation flake 를 줄였다.

### Revision `working` - node role public contract guard 추가

- 모든 PC clone 에서 local `node_identity.yaml` 의 `primary_writer.public_repo` 를 기준으로 protected public contract 문서 변경을 검사하는 `validate:role-boundary` 를 추가했다.
- root `validate` / `done:check` 가 role-boundary guard 를 먼저 실행해, public repo primary 가 아닌 node 의 전역 계약 문서 승격 변경을 기본 차단하게 했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 protected public contract 경로와 owner 승인 override 규칙을 명시했다.

### Revision `working` - skill first-build 검증 게이트 명시

- Soulforge 에서 skill 을 새로 만들거나 수정할 때 파일 생성만으로 완료 보고하지 않고, validator 와 fresh-context evaluator review 를 거친 뒤 보고하도록 project-level 실행 계약에 명시했다.
- subagent 는 현재 실행 환경에서 허용되고 사용 가능한 경우에만 쓰며, 불가능한 경우에는 별도 새 컨텍스트 evaluator session 또는 수동 evaluator checklist 로 대체하고 한계를 보고하도록 했다.

### Revision `working` - private-state changelog 링크 검사 보정

- `CHANGELOG_POLICY_V0.md` 의 private repo changelog 참조를 public CI 가 따라가야 하는 상대 링크가 아니라 local path 리터럴로 표시하게 했다.
- `private-state/CHANGELOG.md` 는 owner-only nested private repo 표면이므로 public docs link check 대상에 넣지 않는 경계를 명확히 했다.

### Revision `working` - mail_received Telegram brief v0 추가

- gateway notify event set 에 `mail_received` 를 추가하고, mail fetch 가 fresh event 를 materialize 한 뒤 `town_crier` queue 에 한국어 Telegram brief request 를 적재할 수 있게 했다.
- `mail_received` brief 는 source, subject, 첫 발신자, 첨부 개수, 수신 시각, 다음 행동만 담고 body/html/첨부 원문/URL/secret 은 포함하지 않도록 formatter 와 테스트를 추가했다.
- Telegram brief format 문서에 한국어/Siri 친화 공통 원칙과 `mail_received` 표시 규칙을 추가했다.

### Revision `working` - workmeta system surface 제외

- snapshot project scan 이 `_workmeta/system/**` 같은 private metadata repo 내부 운영 기록을 project 후보로 오인하지 않도록 제외했다.
- `WORKMETA_RESOLVE_CONTRACT_V0.md` 에 `_workmeta/system/` 은 node/system smoke 기록용 non-project support surface 라고 명시했다.

### Revision `working` - tool PC owner-with-state 역할 보강

- 고성능 `tool_pc` 를 skill 제작 전용이 아니라 project metadata 를 읽고 쓰는 tool-bound 설계 작업 node 로 명시했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 `tool_pc` 의 `_workspaces` / `_workmeta` writer 경계와 중복 방지 규칙을 추가했다.
- `TOOL_PC_BOOTSTRAP_PROMPT_V0.md` 를 추가해 고성능 PC 를 `owner-with-state` 로 재설정하고 회로설계/PCBArtwork/tool run evidence 를 기록할 수 있게 했다.

### Revision `working` - gateway env 상대 경로 해석 보강

- `gateway:fetch:healthcheck`, state backup/restore, retention cleanup 이 `EMAIL_FETCH_RUNTIME_DIR` 와 `EMAIL_FETCH_INBOX_ROOT` 의 상대 경로를 env 파일 위치 기준으로 해석하게 했다.
- always-on node 의 post-review smoke 에서 상대 runtime 경로가 repo 밖으로 해석되어 healthcheck/healer 가 중단되는 문제를 재현 테스트로 고정했다.
- gateway mail fetch 문서와 env example 에 운영 node 는 절대 경로를 권장하되, 상대 경로는 env 파일 기준이라는 규칙을 명시했다.

### Revision `working` - always-on next action prompt 추가

- `ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md` 를 추가해 복사/붙여넣기가 어려운 24시간 PC 에서 짧은 파일명 지시만으로 post-review gateway 점검과 activity mirror 를 수행할 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 항상 켜 두는 PC 가 pull 후 다음 운영 작업을 파일 기반으로 찾게 했다.

### Revision `working` - gateway healthcheck/healer 판정 보강

- `guild-hall:healer:run` 이 gateway fetch healthcheck JSON 의 `WARN`/`CRITICAL` 상태를 실패 점검으로 기록해 activity carry-forward 에 남기도록 했다.
- `gateway:fetch:healthcheck` 가 `EMAIL_FETCH_ALERT_TELEGRAM_ENABLED` 와 `EMAIL_FETCH_ALERT_TELEGRAM_*` env 설정을 실제 alert decision 에 반영하게 했다.
- Hiworks POP3 fetch 가 `last_uidl` 이후 메시지부터 진행하고, 중복 이벤트의 raw row 를 반복 append 하지 않도록 보강했다.

### Revision `working` - activity logger 와 healer run 구현

- `guild-hall:activity:log` / `guild-hall:activity:refresh` 를 추가해 모든 PC 가 public-safe summary event 를 공용 activity surface 에 남길 수 있게 했다.
- `guild-hall:healer:run` 을 추가해 24시간 PC 가 repo 상태, root validation, gateway fetch healthcheck 결과를 report/event/latest_context 로 기록하게 했다.
- activity/healer 단위 테스트를 root validation harness 에 연결하고, 관련 README 와 activity/multi-PC 문서에 실행 경계를 반영했다.

### Revision `working` - multi-PC node employee model 추가

- `MULTI_PC_DEVELOPMENT_V0.md` 에 각 PC 가 bounded hotfix 를 맡을 수 있는 node employee model 을 추가했다.
- 24시간 운영용 clone 은 clean `main` 으로 유지하고, 간단 수정은 같은 PC 의 별도 worktree/branch 에서 처리한 뒤 운영용 clone 이 pull 받는 구조로 정리했다.

## 2026-05-07

### Revision `working` - play loop 병목 원인 기록 추가

- `PLAY_LOOP_V0` 에 agent 가 stop condition 까지 진행할 수 있는 최소 packet 기준을 추가해 사용자가 다음 prompt 병목이 되는 지점을 기록하게 했다.
- battle event 에 `bottleneck_reason` 을 추가해 `intervention_count` 가 왜 발생했는지 집계할 수 있게 했다.
- runner execution packet 과 snapshot next action 에 anti-bottleneck loop 를 연결해 반복 병목을 workflow/mission handoff 개선 후보로 올리게 했다.

### Revision `working` - Hiworks POP3 long line 수신 보강

- Hiworks POP3 `RETR` 수신에서 Python `poplib` 기본 2048 byte line limit 에 걸리지 않도록 connector-local long-line reader 를 추가했다.
- `HIWORKS_POP3_MAX_LINE_BYTES` env 설정과 synthetic long-line 테스트를 추가해 raw mail body 없이 긴 라인 수신 경로를 검증하게 했다.

### Revision `working` - gateway mail fetch operator 출력 redaction

- `gateway:fetch` run summary/debug/CLI error output 에 raw mail body, HTML, URL, token-like cursor 가 섞여도 operator terminal 에 그대로 노출되지 않도록 sanitize 경로를 추가했다.
- 24시간 PC `email -> monster` smoke prompt 는 live fetch 에서 `--json` 을 사용하지 않고 count/status 중심으로 확인하도록 조정했다.

## 2026-05-04

### Revision `working` - always-on email monster smoke prompt 추가

- `docs/architecture/bootstrap/ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md` 를 추가해 원격 24시간 PC 에서 긴 붙여넣기 없이 파일 기반 `email -> monster` smoke test 를 실행할 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 `always_on_node` 가 public repo 수정 없이 `doctor`, `gateway:fetch`, `gateway:intake` smoke 를 순서대로 확인하게 했다.

### Revision `working` - multi-PC primary writer map 추가

- `MULTI_PC_DEVELOPMENT_V0.md` 에 색상 Mermaid 기반 PC별 primary writer map 을 추가해 `always_on_node`, `work_pc`, `portable_dev_pc` 가 쓰는 영역과 blocked 작업을 한눈에 볼 수 있게 했다.
- 같은 repo 를 여러 PC 가 clone 해도 `guild_hall/state/**`, `_workspaces/**`, `_workmeta/**`, `private-state/**`, public `Soulforge` 의 primary writer 가 겹치지 않도록 표와 중복 방지 규칙을 보강했다.

### Revision `working` - doctor local node identity 점검 추가

- `guild-hall:doctor` 가 `guild_hall/state/local/node_identity.yaml` 을 읽어 현재 PC 의 `node_role`, `bootstrap_profile`, active Soulforge root, public Git 비추적 상태를 먼저 보고하도록 했다.
- `operator`, `owner-with-state` 프로필에서는 local node identity 를 필수로 보고, `public-only` 에서는 missing 을 허용하되 결과에 표시한다.

### Revision `working` - work PC bootstrap prompt 추가

- `docs/architecture/bootstrap/WORK_PC_BOOTSTRAP_PROMPT_V0.md` 를 추가해 업무 PC 가 Git pull 후 Codex 에게 파일 기반 `work_pc` bootstrap 지시를 받을 수 있게 했다.
- prompt 는 실제 프로젝트 파일과 `_workmeta` 기록을 다루는 업무 PC 역할을 설정하되, always-on scheduler 와 고성능 tool 작업은 기본 차단하도록 정리했다.

### Revision `working` - always-on node bootstrap prompt 추가

- `docs/architecture/bootstrap/ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md` 를 추가해 24시간 운영 PC 가 Git pull 후 Codex 에게 파일 기반 bootstrap 지시를 받을 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 긴 화면공유 붙여넣기 없이 `always_on_node` local identity, doctor, snapshot, night_watch preflight 절차를 찾게 했다.

### Revision `working` - 문서 색인과 multi-PC node 역할 정리

- `docs/architecture/**/README.md` 의 단순 포함 목록을 문서 역할 색인으로 보강해 AI 와 사람이 각 문서를 왜 읽어야 하는지 찾을 수 있게 했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 `work_pc`, `tool_pc`, `portable_dev_pc`, `always_on_node` 역할과 local-only `node_identity.yaml` 기준을 추가했다.
- `AUTOHUNT_MODEL.md`, `NIGHT_WATCH_AUTOMATION_V0.md`, `PROJECT_MAP_V0.md` 를 기존 owner 체계 안에서 연결해 새 최상위 덤프 문서 없이 node capability / 24시간 운영 / 자동사냥 확장선을 찾게 했다.

### Revision `working` - Soulforge game UI 방향 문서화

- `SOULFORGE_GAME_UI_INFORMATION_ARCHITECTURE_V0.md` 를 추가해 UI 중심을 file editor 가 아니라 `Guild Hall / Dungeon Map` 작전판으로 고정했다.
- `SOULFORGE_2D_DUNGEON_UI_DIRECTION_V0.md` 를 추가해 3D 가 아닌 2D/2.5D 판타지 업무 작전판 방향과 v0/v1 경계를 정리했다.
- `SE_DUNGEON_STAGE_MODEL_V0.md` 를 추가해 project 를 dungeon, 체계공학 단계를 stage/floor, 단계 완료를 boss clear 로 읽는 public-safe UI 모델을 연결했다.

### Revision `working` - agent 실행 계약 추가

- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 추가해 Karpathy-style coding agent 원칙을 Soulforge의 canon/public-private/secret 경계에 맞게 흡수했다.
- `AGENTS.md` 에 코드, 문서, 구조, 검토, 적용성 판단, 변경 계획, 파일 편집 작업 전 실행 계약을 읽는 라우팅 규칙을 추가했다.
- root README 와 foundation README 에 새 실행 계약 문서를 연결했다.

## 2026-05-02

### Revision `working` - Dungeon Map v0 read-only pane 추가

- `renderer-web` control center 에 `GET /__control_center_api/snapshot` dev API 와 `Dungeon Map` pane 을 추가했다.
- 새 pane 은 local snapshot projection 인 `guild_hall/state/snapshot/soulforge_snapshot.json` 의 summary 만 읽고, raw workspace/workmeta/private-state/gateway source 내용은 표시하지 않는다.

### Revision `working` - snapshot freshness 계약 추가

- `soulforge_snapshot.json` 에 `source_observations` 를 추가해 UI 가 보는 snapshot 이 어떤 원본 metadata 기준인지 판정할 수 있게 했다.
- `npm run guild-hall:snapshot:check-fresh` 를 추가해 저장된 local snapshot 과 현재 원본 surface 의 fingerprint mismatch 를 감지하게 했다.
- freshness 관측 범위는 repo metadata, roadmap, mission index, `_workspaces`, `_workmeta`, gateway state, private-state surface 로 제한하고 원본 업무 내용은 읽지 않는다.

### Revision `working` - read-only Soulforge snapshot producer 추가

- `guild_hall/snapshot/` 을 추가해 owner root, project surface, mission summary, gateway status 를 sanitized metadata JSON 으로 투영하게 했다.
- 기본 출력은 local-only `guild_hall/state/snapshot/soulforge_snapshot.json` 으로 두고, raw mailbox, attachment, token, `_workspaces` 파일 내용은 snapshot 에 포함하지 않도록 경계를 고정했다.
- `validate:snapshot` 을 root acceptance 에 연결해 snapshot shape 와 private content 비노출 최소 test 를 함께 돌리게 했다.

### Revision `working` - 큰 개발 방향 단일 정본 추가

- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` 를 추가해 Soulforge의 큰 개발 방향, active slice, 구체화 규칙을 한곳에서 관리하게 했다.
- `PROJECT_MAP_V0.md` 는 탐색 지도 역할로 좁히고, active backlog 와 세부 구현 checklist 는 roadmap 또는 각 owner 문서로 내려가도록 경계를 명시했다.
- `AGENTS.md` 에 큰 개발 방향과 우선순위 판단 시 roadmap 을 먼저 확인하는 짧은 라우팅 규칙을 추가했다.

### Revision `working` - 현재 구조 파악용 project map 추가

- `docs/architecture/foundation/PROJECT_MAP_V0.md` 를 추가해 Soulforge owner roots, 업무 RPG 루프, UI/gateway 상태, local/private 경계를 한 장에서 다시 볼 수 있게 했다.
- root README 와 architecture index 에 새 지도 문서를 연결해 멈춘 뒤 재개할 때 첫 읽기 순서를 분명히 했다.

## 2026-03-27

### Revision `working` - bootstrap 프로필을 public-only/operator/owner-with-state 3단으로 정리

- `public-only` 가 operator env 없이도 성립하도록 bootstrap profile 문서, checklist, doctor 계약을 정리했다.
- 새 `operator` 프로필을 추가해 private repo 없이도 gateway/town_crier local env 와 smoke/live 를 다룰 수 있게 했다.
- `owner-with-state` 는 계속 `_workmeta/`, `private-state/` 와 continuity restore 를 요구하는 owner 전용 프로필로 유지했다.

### Revision `working` - root canon validator 첫 버전 추가

- `guild_hall/validate/canon_validate.mjs` 를 추가해 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces/README.md` 의 최소 path/ref/readiness 무결성을 점검하게 했다.
- canonical entrypoint 는 `npm run guild-hall:validate:canon` 으로 두고, convenience alias 로 `npm run canon:validate` 를 함께 제공한다.
- mission 의 `workflow_id: null` 예외가 readiness blocked 규칙과 맞는지도 첫 validator 범위에 포함했다.

### Revision `working` - root validate/done-check 와 GitHub Actions 최소 게이트 추가

- root `validate`, `done:check`, `validate:gateway` entrypoint 를 추가해 canon validator, UI acceptance, `mail_fetch` pytest harness 를 한 surface 로 묶었다.
- `.github/workflows/validate.yml` 을 추가해 PR 과 `main` push 에서 `npm run done:check` 를 돌리는 최소 public CI gate 를 열었다.
- `CONTRIBUTING.md`, `SECURITY.md` 를 추가해 public contribution 기준선과 비공개 보안 제보 원칙을 정리했다.

### Revision `working` - update manual 에 operator 프로필 절차 추가

- `UPDATE_MANUAL_V0.md` 에 `operator` update 절차를 추가해 `public-only`, `operator`, `owner-with-state` 3단 프로필이 bootstrap 과 update 문서에서 같은 구조를 갖도록 맞췄다.
- `operator` 는 public repo pull + local operator env 유지까지만 다루고, private repo pull 은 하지 않는다고 다시 고정했다.

### Revision `working` - night_watch Stage 0 preflight 를 script owner 로 분리 시작

- `guild_hall/night_watch/preflight_repo_sync.mjs` 와 `npm run guild-hall:night-watch:preflight` 를 추가해 repo sync, retry, owner-with-state remote doctor, activity log write 를 deterministic script 가 맡게 했다.
- `soulforge-night-watch-pipeline.prompt.txt` 와 `NIGHT_WATCH_AUTOMATION_V0.md` 의 Stage 0 는 이제 자연어로 git/doctor 제어를 다시 서술하지 않고, preflight script 실행과 그 결과 소비를 기준으로 삼는다.

### Revision `working` - gateway intake dedupe index manifest 추가

- `guild_hall/gateway/monster_index.mjs` 를 추가해 `intake_inbox/**/monsters.json` 전역 파싱 대신 `intake_inbox/_index/monster_index.json` manifest cache 를 우선 읽는 구조를 넣었다.
- `runIntake`, `touchExistingMonster`, `update-monster` 는 `monsters.json` 저장 뒤 manifest 를 함께 갱신하도록 맞췄다.
- `validate:gateway` 에 Node builtin test 를 추가해 manifest rebuild 와 stale detection 을 최소 범위로 검증하게 했다.

### Revision `working` - guild_hall 공용 io/path helper 추가

- `guild_hall/shared/io.mjs` 를 추가해 `doctor`, `gateway`, `town_crier`, `night_watch` 가 공통으로 쓰는 repo-relative path 정규화, JSON/JSONL state 입출력, 존재 여부 점검 helper 를 한 surface 로 모았다.
- `night_watch` preflight 와 `gateway` dedupe index 는 이제 같은 JSON/경로 helper 를 써서 `/` 기준 repo path 와 state write 형식을 맞춘다.
- `guild_hall/shared/README.md` 를 추가하고 `guild_hall` owner 문서에 새 내부 helper surface 를 연결했다.

### Revision `working` - doctor 출력 책임 일부를 reporting helper 로 분리

- `guild_hall/doctor/reporting.mjs` 를 추가해 human/json 출력 렌더링과 fatal payload 조립 책임을 CLI 본체에서 분리했다.
- `guild_hall/doctor/cli.mjs` 는 bootstrap check 실행과 결과 조합에 더 집중하고, 출력 형식 변경은 reporting helper 에서 다루도록 정리했다.

### Revision `working` - gateway message rendering helper 분리

- `guild_hall/gateway/message_rendering.mjs` 를 추가해 관문 알림 문구, monster label, 문장 정규화 helper 를 CLI 본체에서 분리했다.
- `guild_hall/gateway/cli.mjs` 는 intake/update/notify 흐름에 집중하고, 새 의뢰 알림 텍스트 조립은 message rendering helper 가 맡도록 정리했다.

### Revision `working` - 1차 world-facing class 4종 추가와 2차 후보군 기록

- `archer`, `rogue`, `healer`, `envoy` canonical class sample 4종을 starter lineup 에 추가했다.
- 현재 registry skill/tool/knowledge 가 아직 작기 때문에, 이 4종은 기존 canon refs 를 재조합한 starter interpretation 으로 두었다.
- `blacksmith`, `artificer`, `mage`, `fighter` 는 2차 후보군으로 `.registry/classes/README.md` 에 기록해 later expansion 에서 잊지 않게 했다.

### Revision `working` - class title 을 세계관 톤으로 보정

- `archivist` 의 사람용 title 을 `기록관` 으로, `administrator` 의 사람용 title 을 `총관` 으로 조정했다.
- 내부 `class_id` 는 그대로 유지하고, world-facing 설명만 조정해 기존 unit/workflow binding 과 경로를 깨지 않게 유지했다.
- `human` species hero 와 guild master 관련 설명도 governance / archive 톤으로 같이 맞췄다.

### Revision `working` - ontology review 상기 manual 과 guild_master carry-forward 규칙 추가

- `docs/architecture/foundation/ONTOLOGY_REVIEW_MANUAL_V0.md` 를 추가해 ontology review trigger, 저장 위치, carry-forward owner 를 고정했다.
- root `AGENTS.md` 와 `night_watch` 문서/prompt 에 ontology candidate 상기 규칙을 넣어, 현재 프로젝트가 아니어도 `guild_master` / `night_watch` lane 이 cross-project 후보를 다시 떠올리게 했다.
- activity surface 에는 ontology review candidate 를 `carry_forward: true` 로 남길 수 있다는 규칙을 추가했다.

### Revision `working` - ontology-style 저장 규칙 기준선 추가

- Soulforge 핵심 개념을 `개체 + 관계` 기준으로 읽는 `Ontology Model v0` foundation 문서를 추가했다.
- ontology 정의와 관계 규칙은 public foundation 문서가 들고, project-specific instance 는 `_workmeta/<project_code>/ontology/` 에 두며, runtime event 는 계속 `guild_hall/state/**` 와 `private-state/**` 가 소유하도록 저장 위치를 고정했다.
- 새 top-level `ontology/` root 는 만들지 않고, 기존 owner root 안에서 정의/canon instance/runtime event 를 분리하는 방향으로 정리했다.

### Revision `working` - starter class lineup 을 6종으로 확장

- 기존 `knight`, `archivist`, `administrator` 에 더해 `pathfinder`, `marshal`, `auditor` canonical class sample 3종을 추가했다.
- 새 class 들은 species 와 독립된 축을 유지하고, 실제 조합은 계속 unit/party/workflow/mission 에서 결정하도록 유지했다.
- ref 는 기존 `.registry/skills`, `.registry/tools`, `.registry/knowledge` canon 안에서만 조합해 `정찰`, `집행`, `검증` lane 을 드러내도록 맞췄다.

### Revision `working` - night_watch preflight 에 transient retry 추가

- `night_watch` current-default pipeline 의 preflight 는 계속 `fail-closed` 로 유지하되, dirty repo, detached HEAD, missing origin, non-main branch 는 즉시 hard fail 하도록 명시했다.
- 반대로 DNS 해석 실패, temporary name resolution failure, timeout, connection reset, TLS handshake timeout, network unreachable, transient 5xx gateway 오류 같은 일시적 network-class 실패는 bounded retry 뒤 최종 판정하도록 규칙을 추가했다.
- repo sync 는 최대 3회 시도, doctor remote 검사는 repo sync 성공 후 1회 재시도만 허용하고, 그래도 실패하면 blocked preflight 로 중단하게 prompt/source 와 운영 문서를 맞췄다.

## 2026-03-26

### Revision `working` - 종족 직업 몬스터의 사람용 한글 표시 규칙 추가

- canonical id 는 계속 stable ASCII 를 유지하고, 사람에게 보여주는 이름은 `title`, `display_name`, `monster_label` 같은 human-facing 필드에 한국어로 둘 수 있다는 규칙을 public canon 문서에 추가했다.
- current sample species/class title 과 human hero title 을 한국어로 바꿨다.
- `monster` 계열은 `monster_family` / `monster_name` / `monster_type` id 를 유지하되, candidate note 와 lineup 문서에서 optional `monster_label` 로 한국어 표시를 둘 수 있게 했다.

### Revision `working` - species 와 class 독립 조합 규칙 추가

- `.registry` canon 에서 species 와 class 는 서로 종속되지 않는 독립 catalog 축이라고 명시했다.
- 실제 조합은 `.unit/<unit_id>/unit.yaml` 의 `identity.species_id + class_ids` 가 결정하도록 문서와 schema 를 정리했다.
- 그래서 `orc + knight` 같은 조합도 canon 상 허용되며, 제한이 필요하면 unit/party/workflow/mission 에서만 표현하도록 규칙을 고정했다.
- starter species lineup 은 `human`, `orc`, `elf`, `dwarf`, `darkelf` 5종으로 맞췄다.

## 2026-03-25

### Revision `working` - mission model 에 monster 와 artifact 구분 규칙 추가

- `docs/architecture/workspace/MISSION_MODEL.md` 에 `monster = 요청`, `artifact = 산출물`, `mission = 실행 계획` 구분을 명시했다.
- 같은 artifact 가 한 mission 에서는 output 이고, 다음 mission 에서는 input 이 될 수 있다는 generic meeting-followup 예시를 추가했다.

### Revision `working` - agent procedure capture entrypoint rule

- Added a root `AGENTS.md` rule so every bounded business task leaves tracked promotion-ready evidence in `_workmeta/<project_code>/reports/**` instead of relying on chat memory or ignored runtime logs.
- Kept `AGENTS.md` as the short routing surface and pointed detailed capture fields to `_workmeta/PROCEDURE_CAPTURE_RULE.md`, including repeatable steps, decision criteria, folder or packet shape, and completion criteria for later promotion into `skill`, `workflow`, `mission`, `role_or_class`, or `data_contract`.

### Revision `working` — night_watch local automation source 를 tracked renderer 구조로 고정

- `Soulforge Night Watch Pipeline` 의 prompt/spec source 를 public tracked tree 아래 `guild_hall/night_watch/automations/` 로 옮기고, 각 PC 의 local `automation.toml` 은 renderer 로 재생성하는 구조를 추가했다.
- 이 변경으로 automation prompt 업데이트 자체는 Git 형상관리되고, 다른 PC 는 repo pull 후 같은 source 를 보고 local automation 을 다시 install 할 수 있다.
- 관련 경로:
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.spec.json`
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.prompt.txt`
  - `guild_hall/night_watch/render_local_automation.mjs`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 시작 전에 전 repo 최신 동기화 gate 추가

- 항상 켜 두는 운영 PC 의 `night_watch` pipeline 이 점검 전에 public `Soulforge`, `_workmeta`, `private-state` 를 모두 fast-forward pull 하도록 preflight stage 를 추가했다.
- preflight stage 는 세 repo 중 하나라도 dirty, missing, origin 누락, branch mismatch, pull 실패, `owner-with-state --remote` doctor 실패가 있으면 그 run 에서 후속 점검을 건너뛰고 blocked report 만 남기도록 규칙을 고정했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — legacy `_workspaces` continuity lane 제거와 runtime README 경계 정리

- bootstrap/install checklist 에서 `private-state/_workspaces` restore 경로를 제거했다.
- `owner-with-state` bootstrap 은 `guild_hall/state/**` continuity subset 만 `private-state/` 에서 복원하고, `_workspaces/<project_code>/` 는 각 PC 에서 다시 materialize 하도록 정리했다.
- tracked `guild_hall/state/README.md` 가 runtime root 안의 유일한 boundary note 라는 점을 문구로 명시해 public tracking 예외를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `guild_hall/state/README.md`
  - `guild_hall/doctor/cli.mjs`

## 2026-03-24

### Revision `working` — night_watch automation 을 worktree-safe local path 기준으로 재설계

- Codex app automation 이 임시 worktree 에서 실행될 수 있다는 전제를 문서에 반영했다.
- tracked canon 의 상대 경로 계약은 유지하되, local automation prompt 에는 `<LOCAL_SOULFORGE_ROOT>`, `<LOCAL_ACTIVITY_ROOT>`, `<LOCAL_PRIVATE_STATE_ROOT>`, `<LOCAL_WORKMETA_ROOT>` 같은 absolute path 입력을 쓰도록 규칙을 추가했다.
- `soulforge_activity` writer 는 worktree-local copy 가 아니라 이 PC 의 active absolute root 를 canonical sink 로 삼는다고 명시했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 결과 저장 surface 와 Fix Draft companion 설계 추가

- night_watch 자동화가 Codex inbox/thread 에만 머물지 않고 `guild_hall/state/operations/soulforge_activity/**` 에도 결과를 남기도록 output contract 를 보강했다.
- `latest_context.json`, `events/YYYY/YYYY-MM.jsonl` 외에 상세 실행 결과를 저장하는 `log/YYYY/YYYY-MM-DD/HHMM-<automation-id>.md` surface 를 추가했다.
- 자동 수정은 current-default 에 넣지 않고, draft-only 후속 조치 제안을 만드는 `Soulforge Fix Draft` companion spec 을 추가했다.
- 새 점검 자동화가 추가되거나 출력 형식이 바뀌면 `Fix Draft` spec 도 같은 patch 에서 함께 갱신하는 동기화 규칙을 문서화했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 자동화 후보 문서화

- `guild_hall/night_watch` owner 아래에서 장기 운영용 새벽 점검 자동화 후보 3개를 문서화했다.
- `Boundary Check`, `Portability Check`, `Context Drift Check` 의 목적과 입력 경로, 결과 surface 를 정리했다.
- 자동화 규칙 문서는 tracked repo 에 두고, 실제 스케줄과 ACTIVE 상태는 Codex app local automation 이 맡는다는 경계를 분리했다.
- 다른 PC 에서 그대로 다시 만들 수 있도록 각 자동화의 이름, 권장 주기, 작업 경로, 실행 프롬프트를 문서 안에 ready-to-create spec 으로 추가했다.
- 다른 PC 에서는 repo pull 후 같은 문서를 보고 Codex automation 을 다시 만들도록 절차를 적었다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/README.md`
  - `guild_hall/night_watch/README.md`
  - `README.md`

### Revision `working` — Soulforge 전체 활동 recent-context surface 추가

- Soulforge 전체 작업의 최근 맥락을 project `_workmeta` 가 아니라 `guild_hall/state/operations/soulforge_activity/**` 에 두는 규칙을 추가했다.
- 최근 PC/session 에서는 `latest_context.json` 을 먼저 읽고, 부족할 때만 월별 `events/*.jsonl` 마지막 몇 건을 추가로 읽는 recent-window 규칙을 문서화했다.
- `private-state/` mirror 범위와 update/handoff restore 절차에 `operations/soulforge_activity/**` 를 포함했다.
- 관련 경로:
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `docs/architecture/guild_hall/GUILD_HALL_MODEL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`

### Revision `working` — private-state mailbox continuity mirror 범위 확대

- `private-state/` allowlist 를 intake/monster/outbound 중심에서 mailbox continuity mirror 까지 확대했다.
- owner handoff/update/private-state 문서에서 `mailbox/company/**`, `mailbox/personal/**`, `log/mail_fetch/**` sync/restore 절차를 추가했다.
- active runtime 경로는 그대로 두고, `private-state/` 는 mirror copy plane 으로만 쓰도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

### Revision `working` — 메일 수신/이동 이력 폴더와 skill spec 추가

- `020_MGMT/027_수신이력_이동이력` 폴더를 관리 폴더 quick map 과 SE 폴더트리 skill spec 에 추가했다.
- generator 가 `management_static_folders` 설명을 `폴더_인덱스.txt` 와 `plan_manifest.json` 에 반영할 수 있게 갱신했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — 온보딩 가이드에 관리 폴더 설명 추가

- `PROJECT_ONBOARDING_V0.md` 에 `020_MGMT` 관리 폴더 quick map 과 `022 -> stage별 *_INBOX_분류전 -> gate 내부 세부 폴더` 흐름 설명을 추가했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — owner 전용 `_workmeta` clone/pull 절차 문서화

- `_workmeta/` 를 `_workspaces/` 와 같은 레벨의 owner-only private metadata repo 로 clone/pull 하는 절차를 bootstrap/update/multi-PC 문서에 추가했다.
- `owner-with-state` 프로필이 public `Soulforge` 외에 `_workmeta/` 와 `private-state/` 를 함께 다루도록 문서를 정리했다.
- `private-state` 문서와 예시 템플릿에서 `_workmeta` 를 범위 밖의 별도 private repo 로 분리했다.
- 관련 경로:
  - `README.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

## 2026-03-23

### Revision `working` — SE 폴더트리 생성 skill package 편입

- internal SE folder-tree generator 리소스를 Soulforge canonical skill package 로 편입했다.
- 새 package 는 `.registry/skills/se_foldertree_generate/` 아래 canon entry 와 sync 가능한 `codex/` bridge 를 함께 두고, bundled asset/script/reference 를 local Codex mirror 로 materialize 할 수 있게 구성했다.
- skill package 와 generator 를 입력 확인형으로 보강해 `layout mode(new-root/in-place)`, `business type`, `prime contractor`, `quality grade` 를 먼저 확인하고, 현재 지원 조합이 아니면 중단하도록 했다.
- generator 는 `in-place` 모드를 추가해 기존 프로젝트 루트에 한 단계 더 nested root 를 만들지 않고 직접 tree 내용을 생성할 수 있게 했다.
- bundled asset/script/reference 는 skill root 기준 상대경로 사용을 기본 원칙으로 명시해 이식성을 높였다.
- 기존 install/sync 문서는 이미 `skills:sync` 전체 동기화 규약을 갖고 있어 이번 변경에서는 새 package 추가만 반영했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/skill.yaml`
  - `.registry/skills/se_foldertree_generate/README.md`
  - `.registry/skills/se_foldertree_generate/codex/SKILL.md`
  - `.registry/skills/se_foldertree_generate/codex/agents/openai.yaml`
  - `.registry/skills/se_foldertree_generate/codex/references/mapping.md`
  - `.registry/skills/se_foldertree_generate/codex/references/workflow.md`
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `.registry/skills/se_foldertree_generate/codex/scripts/convert_gate_numbers.py`
  - `.registry/skills/se_foldertree_generate/codex/requirements.txt`
  - `.registry/skills/README.md`

### Revision `working` — 첫 실제 프로젝트 온보딩 manual 승격

- 첫 실제 프로젝트를 `_workspaces/<project_code>/` 에 붙이는 절차를 별도 workspace manual 로 승격했다.
- short `project_code`, full `display_name`, read-only first, bounded first run/use, local-only junction/symlink materialization 규칙을 workspace 정본 문서에 반영했다.
- tracked 정본 문서와 public-safe example 에는 실제 project code / 과제명 대신 generic placeholder 만 쓰는 규칙을 추가했다.
- 실제 프로젝트별 실험 문서와 근거는 local-only `reports/onboarding/`, `artifacts/onboarding/` 아래에 두고, 안정 규칙만 정본 문서로 승격하는 흐름을 명시했다.
- 사람과 Codex 가 함께 첫 과제를 여는 `project_start_worklog.md` 와 project start workflow manual 을 추가했다.
- 새 시작 행위는 사용자가 따로 요청하지 않아도 실제 작업 순서를 worklog 와 workflow note 로 저장하는 규칙을 추가했다.
- project assignment 규칙을 승격할 때는 비밀 project code 나 내부 관리번호 대신 공개 가능한 대표 업무명/주제어를 우선 쓰고, 약어·제품군명·일반 사업유형은 보조 힌트로만 다루도록 정리했다.
- project metadata 와 raw runtime truth 를 project root 내부 metadata folder 대신 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 로 분리하는 모델로 구조 문서, 예시, UI 경로 해석을 전환했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`
  - `docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md`
  - `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`
  - `docs/architecture/workspace/WORKMETA_SCHEMA_FIELD_MATRIX.md`
  - `docs/architecture/workspace/WORKMETA_MINIMUM_SCHEMA.md`
  - `docs/architecture/workspace/README.md`
  - `_workspaces/README.md`

### Revision `working` — Windows runbook shell 차이 보강

- bootstrap, handoff, private-state runbook 에 남아 있던 Unix shell 예시에 Windows PowerShell 대응 명령을 보강했다.
- `npm.ps1` execution policy, `which`, `mkdir -p`, `cp`, `rsync` 같은 shell 차이 때문에 새 Windows PC 에서 막히는 지점을 문서에서 바로 풀 수 있게 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`

### Revision `working` — Windows bootstrap skill sync Ruby 의존 제거

- `npm run skills:sync -- --all` 이 Ruby 미설치 환경에서도 동작하도록 Node 기반 sync script 로 전환했다.
- skill install sync 운영 문서를 새 script 경로와 사용 예시로 갱신했다.
- 관련 경로:
  - `.registry/docs/operations/scripts/sync_codex_skill.mjs`
  - `package.json`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`

### Revision `working` — doctor skill sync 범위 확대

- bootstrap/doctor 계약을 기본 3개 skill 에서 sync 가능한 Soulforge Codex skill 전체로 확대했다.
- `codex/SKILL.md` 가 없는 registry entry 는 canon-only 또는 test package 로 보고 기본 sync 대상에서 제외하도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `.registry/skills/README.md`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`
  - `guild_hall/doctor/README.md`
  - `guild_hall/doctor/cli.mjs`

### Revision `1b58127` — owner handoff 체크리스트 추가

- `OWNER_HANDOFF_CHECKLIST_V0.md` 를 추가해 회사/집 사이 handoff 순서를 고정했다.
- owner 는 작업 시작 전 `doctor --remote`, 작업 종료 전 public/private push 를 확인하는 흐름을 문서화했다.
- 관련 경로:
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `e128441` — private-state 원격 연결과 owner push 규칙 보강

- nested `private-state/` 가 local Git repo 만 있고 `origin` remote 가 비어 있는 예외 복구 절차를 추가했다.
- public/private 두 저장소의 역할과 owner PC 의 private-state push 조건을 명시했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`

### Revision `b878873` — bootstrap 인증과 continuity 가이드 보강

- 설치 완료 기준에 `gh auth login` 과 owner `doctor --remote` 통과를 포함했다.
- continuity sync/pull/restore 절차를 owner 전용 가이드로 보강했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `b6df3a7` — public sync probe

- 다른 PC 에서 public repo round-trip sync 를 검증하기 위한 harmless probe 파일을 추가했다.
- 목적은 public `pull/push` 동작 검증이며, 기능 변화는 없다.
- 관련 경로:
  - `docs/architecture/bootstrap/SYNC_PROBE_PUBLIC_2026-03-23.md`

## 2026-03-22

### Revision `3bbd424` — update 절차와 owner prompt 추가

- 설치 후 업데이트 표준 절차를 별도 문서로 분리했다.
- owner 가 다른 PC Codex 에 업데이트를 맡길 때 사용할 프롬프트 문서를 추가했다.

### Revision `f9680da` — secret 규칙과 필수 skill 기준 정리

- secret 파일 비열람 원칙을 agent/document 규칙에 추가했다.
- 기본 Soulforge skill 3개를 bootstrap doctor 필수 항목으로 승격했다.

### Revision `029560a` — public 기능과 private 업무데이터 저장 규칙 정리

- public repo 와 private repo 의 역할을 owner 관점에서 문서화했다.
- 팀원/public-only 와 owner-with-state 의 경계를 더 명확히 했다.

### Revision `77d6db0` — nested private-state 구조와 bootstrap 가이드 정리

- `Soulforge/private-state/` nested repo 구조를 기준으로 bootstrap/doctor 경로를 정리했다.
- active workspace 는 `Soulforge/` 하나라는 운영 모델을 문서에 반영했다.

### Revision `82672d5` — doctor 원격 점검과 bootstrap 프로필 추가

- `guild-hall:doctor` 에 `--profile owner-with-state`, `--remote`, `fix_hint` 를 추가했다.
- 팀원용 `public-only`, owner 용 `owner-with-state` bootstrap 프로필을 정식화했다.

### Revision `20f9b49` — doctor fatal schema 정리

- fatal path JSON 도 normal path 와 같은 top-level schema 를 유지하도록 정리했다.

### Revision `58621c6` — doctor 계약과 outbound ledger 정리

- `doctor` JSON/exit code 계약을 보강했다.
- outbound mail ledger 최소 필드와 private state 경계를 문서로 잠갔다.

### Revision `60b8870` — bootstrap doctor 와 private state 기준 추가

- bootstrap 문서 묶음과 `guild-hall:doctor` entrypoint 를 추가했다.
- private state repo 기준과 outbound mail 기록 자리의 초기 계약을 마련했다.
