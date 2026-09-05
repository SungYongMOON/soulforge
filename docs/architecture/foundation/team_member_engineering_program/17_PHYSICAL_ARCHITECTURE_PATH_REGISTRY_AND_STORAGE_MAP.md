# Physical Architecture, Path Registry, and Storage Map

> Status: `OWNER_AUTHORIZED_STAGED_MIGRATION / TARGET_TOP_LEVEL_MATERIALIZED / G0_DOCUMENT_RECONCILIATION_ACCEPTED / R2_PHYSICAL_APPLY_HOLD` — the Human Owner confirmed the whole-estate direction and staged execution. `<TARGET_SOULFORGE_ROOT>` top-level exists with payload copy 0; fresh Level 2 review accepted the G0 document reconciliation, and R2 actual apply remains held.

## Owner execution directive — 2026-09-01

- `<TARGET_SOULFORGE_ROOT>`가 비어 있는 상태에서 목표 root를 새로 materialize하고, 현재 `<LEGACY_SOULFORGE_ROOT>` 전체 estate를 단계적으로 전환한다.
- Owner는 전환 시 Buzz·Hermes·Vigil(포트 4192)·BuzzServer 정지를 허용했다. 서비스는 copy-only staging 동안 계속 운영할 수 있고, writer/pointer cutover 직전에 한 번만 quiesce한다.
- PC 재부팅은 이번 migration의 허용 수단이 아니다.
- 실제 이동은 `inventory freeze -> target manifest -> empty-root materialization -> copy-only staging -> digest/Git/DB/restore verification -> service quiescence -> pointer/service cutover -> canary -> rollback rehearsal -> later C: retirement decision` 순서다.
- `<LEGACY_SOULFORGE_ROOT>`와 사용자 소유 dirty state는 새 경로의 readback·rollback·fresh review가 닫힐 때까지 보존한다. reset, stash, force, purge, broad delete는 금지한다.
- Terra/max는 bounded task executor이며 leaf contract가 명시할 때만 repo integration writer를 맡는다. 격리된 Gemini 3.7 Flash lane은 public-safe inventory 또는 script/test 후보만 만들며, Opus5/high는 구현과 분리된 fresh review를 맡는다. Terra/max는 control_root, guild_hall/path_registry, guild_hall/backup_controller의 writer credential을 가정하지 않으며, 외부 모델은 path/service/writer/acceptance authority와 fallback을 얻지 않는다.
- 이 지시는 R2~R7의 Owner gate를 여는 방향 결정이며, 각 leaf의 private binding·ACL·backup·restore·caller·rollback 증거를 생략하는 big-bang 승인이 아니다.
- G0 accepted reconciliation은 `<TARGET_SOULFORGE_ROOT>/data`의 sole physical manifest를 아래 Plan 17 numbered data spine으로 고정한다. `World Tree`, `Rune`, `Guild`, Apps, analytics는 Path Registry product/owner/asset facets이며 product-named data directory를 인가하지 않는다. 이 문서 재조정은 actual root approval, writer authority, private binding, ACL, or canary readback를 늘리지 않는다.

## Fresh Fable5 REVISE — task-local execution correction

This correction makes the staged direction executable without turning a model
profile, a root class, or a precreated folder into inferred authority. The
already precreated empty target top-level folders are address placeholders only:
they name intended target addresses, but are not a partial R2 apply, a private
binding, an ACL result, a writer grant, or evidence that the Plan 17 data spine
has been materialized. They do not relax any N2–N11 gate below.

### Sol/high technical progression lead authority annex (task-local)

This annex describes a task-local role only. It does not create a task, agent,
thread, writer, Registry row, binding, service action, or physical path. A
Sol/high lead may be instantiated or continued only for N0/N1 read-only
preparation from an explicit Owner-authorized task packet; it may define later
technical sequencing and leaf criteria there, but does not enter N2+ execution.
If the requested profile is unavailable, unobserved, or mismatched, the lead is
not instantiated or continued and sequencing returns HOLD to the Human Owner.
No fallback model, role, or authority is inferred from this annex.

| Field | Bounded rule |
| --- | --- |
| Profile class | technical_direction_acceptance_responsibility |
| Requested runtime | gpt-5.6-sol/high. This is a request only; an observed runtime profile is reported only when the runtime itself exposes it. If unavailable, unobserved, or mismatched, do not instantiate or continue the lead; return sequencing HOLD to the Human Owner with no fallback. |
| Technical remit | Own technical sequencing; state each leaf contract and technical acceptance criteria; route explicitly bounded Terra/max deliverable tasks; integrate evidence; and escalate contradictory, missing, or blocked evidence to the Human Owner. A technical readiness conclusion is only ready or HOLD advice, never Human acceptance. |
| No inferred authority | Does not own path, service, writer, ACL, private binding, NAS, Human acceptance, or retirement authority. It cannot approve a root, choose a physical address, alter an ACL, stop a service, write a private binding, accept a NAS restore, or retire a legacy surface. |
| Per-leaf implementation | Terra/max is the bounded task executor and may be repo integration writer only when that exact leaf contract grants it. Named sole-writer adapters perform actual mutations; Terra/max only integrates receipts when it lacks that grant and never assumes control_root, guild_hall/path_registry, or guild_hall/backup_controller writer credentials. The Sol/high lead can route only an already-authorized bounded packet and cannot widen its write paths or stop conditions. |
| Shadow and review lanes | Gemini 3.7 Flash is public-safe shadow only: read-only inventory plus non-authoritative script/test candidates. Opus5/high performs fresh review independent of implementation. N2, N5, and N9 require a fresh independent Opus5/high advisory review receipt in addition to deterministic evidence; that receipt grants no authority, and a missing or mismatched receipt is HOLD under this Owner packet. Neither lane receives path, service, writer, acceptance, or fallback authority. |
| Human gates | Human Owner gates and the existing named owner surfaces remain unchanged at every physical, service, ACL, restore, cutover, acceptance, and retirement decision. |

### N0-v2 / W-AUTH N0–N11 executable dependency DAG

N0-v2 is an accepted identity packet, not an inferred folder, agent, or writer
identity. It and the Owner private physical-root inventory open only non-workspace
sub-leaves:

N0-v2 accepted output of the N0 row + adopted applicable N1 observation set +
Owner private physical-root inventory -> N2-NW -> N3-NW -> N4-NW -> N5-NW ->
N6-NW -> N7-NW -> N8-NW -> N9-NW -> N10-NW -> N11-NW.

The workspace branch has independent entry evidence:

N0-v2 accepted output of N0 + adopted applicable N1 observation set + Human-adopted
W-AUTH + Canonical Empty-State Genesis Receipt + applicable Legacy Freeze Receipt ->
N2-WS -> N3-WS -> N4-WS -> N5-WS -> N6-WS -> N7-WS -> N8-WS ->
N8.5-WS-PUBLISH -> N9-WS -> N10-WS -> N11-WS.

Current historical `_workspaces` is a mixed reference-in-place authoring/worksite
surface with `canonical=false` by default. Current historical `_workmeta` is a
reference-in-place activity/operation history, not acceptance truth. Individual
append-only events/receipts may be immutable under their legacy contract, but neither
legacy store nor its writers are globally frozen until an actual scoped Freeze.
Both target stores start `EMPTY`: target `_workspaces` accepts only Human/project-authority
accepted exact canonical bytes/revisions. Target `_workmeta` holds only canonical
byte-lineage metadata and no general run/worklog/battle/task/agent operation/collector/
analytics/procedure-capture history.

A physical-root class is a class, not an address. Every target sibling still needs
its own logical_path_id, binding_ref, parent_binding_ref, and binding epoch; no root
class, precreated folder, resolver fallback, or scanner result may supply an address
by inference. Public plan receipts use logical refs and digests only, never private
host path values.

| Gate / branch | Exact entry and output | Stop condition |
| --- | --- | --- |
| `W-AUTH` | Current status: `HOLD / not created`. Before workspace N2/N7, a Human-adopted receipt records `w_auth_ref`, `subject_ref`, `input_source_revision_ref`, `input_source_digest` separately from any output candidate, `scope_ref`, `accepted|baseline`, `owner_ref`/`reviewer_ref`/`evidence_ref`/`input_authority_acceptance_ref`, `issued_at`, and supersession/baseline refs. The enclosing packet is externally pinned by `trusted_packet_digest`. | `unknown` is `HOLD`; no bulk migration or inferred classification. Only `accepted` or `baseline` admits an input source for target byte publication. |
| Canonical Empty-State Genesis Receipt | Current status: `HOLD / not created`. Once per exact target-store binding/generation, an adopted receipt records both logical bindings, empty readbacks, ACL ref, **one same `sole_writer_ref` for both target stores**, generation ID, `legacy_rows_imported: false`, **`backup_classification: authoritative`** with classification ref, synthetic restore-gate/evidence refs, rollback ref, `approved_correction_supersession_policy_ref`, and authority ref. A top-level folder alone is not Genesis. | Missing readback/binding/ACL/shared-sole-writer/generation/authoritative-backup-classification/synthetic-restore/rollback/approved-correction-policy evidence; `rebuildable`, `runtime_local`, or `forbidden` target store classification is HOLD. |
| applicable Legacy Freeze Receipt | Current status: `HOLD / not created`. Every receipt records `applicability`, `origin_kind`, `applicability_reason_ref`, `origin_ref`, `custody_ref`, `admission_ref`, `scope_ref`, and input source revision/digest; the enclosing packet is externally pinned by `trusted_packet_digest`. Applicable legacy origin also records freeze/current-binding/writer-quiescence/readback/source-pointer/retention/expiry/authority refs. `not_applicable` is allowed only for `origin_kind: external_nonlegacy` with exact origin/custody/admission refs and every legacy-only field `null`; otherwise Freeze is `applicable` or `HOLD`. Keep legacy data reference-in-place pending later NAS/retention decision. | Do not claim whole-store freeze, retirement, or target write authority from a source-scoped receipt. |
| N2-WS | All WS entry receipts above; input source classification must be an exact `accepted` or `baseline` revision/digest. | Any W-AUTH, Genesis, or applicable Freeze gap; no vague policy-admission bypass. |
| N7-WS | Branch-local N2-WS through N6-WS evidence plus exact accepted `input_source_revision_ref`/`input_source_digest`, isolated **outside-target** staged `candidate_revision_ref`/`candidate_content_digest`, `candidate_relation: exact_copy|derived_revision`, `producer_ref`/`build_ref`, `reviewer_ref`/`independence_receipt_ref`/`review_ref`, and fresh independent review. `exact_copy` requires candidate revision **and** digest to equal the input; `derived_revision` requires candidate revision to differ while its digest may stay equal or differ. It does not create target bytes or target lineage. | Workspace evidence missing, source/candidate relation or identity gap, target write before authority acceptance, reviewer/producer non-separation, or any cross-branch inference. |

The one-project/one-artifact promotion canary is the only workspace sequence:
accepted input source revision/digest -> isolated staging outside target with distinct
candidate revision/content digest -> exact candidate bytes/hash readback -> fresh
independent review -> Human/project authority acceptance of that candidate -> atomic
publication of accepted bytes plus canonical byte-lineage into target stores. Rollback
removes only operation-created unaccepted staging, never legacy source/history.

The two phases are deliberately separate:

| Phase | What it may prove | What it may not prove or do |
| --- | --- | --- |
| `pre_publish_readiness` | closed refs-only W-AUTH/Genesis/Freeze/source/candidate/review/replay prerequisites are structurally complete for the exact planned publication; returns `pre_publish_ready` with publication/active-pointer refs `null` | target write, target binding activation, source mutation, or post-publication success; any authority-acceptance ref remains evidence, not a publisher effect |
| `post_publish_closure` | the N8.5 named sole publisher's actual atomic bytes+lineage receipt, target/readback, full replay proof, correction/supersession readiness, and active-pointer readback; returns `post_publish_closed` | that an unrelated future publication, N9 cutover, or N11 retirement is accepted |

The public admission validator may validate either phase's packet shape, but its
`PASS` is never an all-in-one real-world publish/cutover success. An actual
`post_publish_closure` receipt is required before N9-WS.

Workspace `HOLD` does not block unrelated NW leaves; NW `PASS` never implies
workspace readiness. No NW leaf may bind, write, materialize, or infer either
workspace target store (`_workspaces` or `_workmeta`). Every N3–N8 evaluation is branch-local and may not be reused across
NW and WS. The generic N2–N8 rows below retain their detailed physical leaf controls
but are read through this branch split; they do not rejoin the branches or weaken WS
entry evidence.

W-AUTH and accepted canonicality must not infer an Agent from folder/task title,
time proximity, Bot root, service account, product, host, path parent, session
co-occurrence, ticket/PR prose, or actor identity.

| Gate | Entry / dependencies | Exact owner | Output / receipt | Validator or manual evidence | Rollback | Stop condition |
| --- | --- | --- | --- | --- | --- | --- |
| N0 — task/service/writer disposition | No dependency; read-only only. Enumerate each task, caller, service, writer, and rollback owner before any physical action. | Human Owner accepts the disposition; Terra/max writes the read-only packet only if its N0 contract grants it; Sol/high coordinates technical sequencing only during N0/N1. | N0-v2 accepted matrix names the exact 13 writer-risk scheduled tasks, with a standing narrow authorization for **temporary stop only at N6/N9**, no reboot, and required re-enable/readback; it does not authorize an N0/earlier stop or any other task. Include named Buzz, Hermes, Vigil, and BuzzServer services plus placeholder reconciliation. | Owner-confirmed N0-v2 matrix; manual check that no service, task, writer, schedule, or placeholder changed. | Discard or supersede the draft; no runtime state exists to roll back. | Any unknown owner, caller, writer, rollback owner, placeholder creator/writer authority, creation-time ref, ACL/readback, or disposition; any stop before N6/N9, any non-N0-v2 task, host reboot, or absent exact stop/re-enable/readback surface. |
| N1 — cloud junction and ADS evidence | No dependency; read-only evidence collection and caller map only. The adopted current N1 set is a legacy observation inventory, not a target binding, Freeze, Genesis, or target-writer proof. Actual cloud/root observation is limited to the scope the Owner admits. | Terra/max is bounded executor/read-only evidence writer only if its N1 contract grants it; Human Owner retains access/admission authority. | Public-safe junction/reparse and ADS evidence summary, caller map, and private evidence refs; no private absolute path or ADS payload is copied into the plan. | Read-only private readback; hardened containment/reparse/ADS checks; ambiguous or unavailable observation is recorded as HOLD. | None; the leaf has no mutation. | Unknown junction target, ADS, containment, source scope, or permission; no legacy/default fallback. |
| N2 — private target binding registration | For **both NW and WS**: N0-v2, the adopted applicable N1 observation receipt, and Owner private physical-root inventory. WS additionally requires branch-local W-AUTH, Genesis, and applicable Freeze. The inventory is an input, not scanner output. | Human Owner supplies/adopts the private inventory; the named control_root sole-writer adapter performs the actual private binding mutation; guild_hall/path_registry owns public logical rows; Terra/max integrates receipts and never writes the binding. | Private current/target binding registration with unique logical IDs, binding refs, parent refs, epochs, writer policy, and provenance receipt. | Private control_root readback plus npm.cmd run validate:path-registry and a fresh independent Opus5/high advisory review receipt; the advisory grants no authority, and missing/mismatch is HOLD under this Owner packet. Public output remains refs/digests only. | The control_root sole writer revokes the candidate binding or restores the prior binding; no folder/materialization change is allowed. | Missing adopted applicable N1 observation, ambiguous, overlapping, stale, or untrusted inventory/binding; non-sole writer; unresolved target sibling identity; missing/mismatched Opus5/high advisory receipt. |
| N3 — writer-exclusive ACL canary/readback | Accepted N2 binding and an explicit Human ACL action gate. | Human Owner authorizes the ACL action; the named control_root sole-writer adapter performs and records the ACL mutation/canary; Terra/max integrates receipts and never writes ACL state. | Exact-bound canary ACL receipt showing intended writer allow, wrong-writer deny, and readback. | Private ACL readback plus operation-aware wrong-writer/stale-binding denial evidence. | Restore the exact prior ACL through the authorized control_root writer; remove only the isolated canary artifact it created. | Inherited/ambiguous ACL, unbounded root, wrong-writer success, missing readback, or any ACL scope broader than the canary. |
| N4 — private Registry-admitted scanner and inventory freeze | Accepted N2 and N3; scanner starts after binding registration, never before it. | guild_hall/path_registry owns Registry admission; control_root sole writer records private scanner state; Terra/max executes the bounded scanner leaf only if its N4 contract grants it. | Binding-scoped private inventory-freeze receipt, Registry snapshot digest, class coverage, and explicit unclassified/HOLD rows. | npm.cmd run validate:path-registry plus private scan/readback proving every result resolved through the admitted binding. | Revoke the freeze/snapshot pointer while retaining immutable receipts; no payload is changed. | Any unregistered, unbound, overlapping, drifting, or scope-widening path; missing N2 provenance; scanner requests an inferred address. |
| N5 — R2 internal-spine canary | Accepted N4 freeze, N3 ACL evidence, the exact approved empty canary binding, and the N0 nine-placeholder reconciliation receipt. | guild_hall/path_registry owns the approved R2 materializer contract; the named materializer adapter performs any actual mutation; control_root sole writer supplies binding/admission; Terra/max is bounded executor/integration writer only if the N5 contract grants it and never assumes those writer credentials. | Internal-spine canary receipt: exact logical canary ref, zero payload copy/move, created-directory manifest, realpath/reparse/ADS readback, idempotent replay result, and an explicit exclusion list for all nine precreated top-level placeholders from the operation-created rollback manifest. | npm.cmd run validate:target-materializer plus private exact-root readback/replay and a fresh independent Opus5/high advisory review receipt; the advisory grants no authority, and missing/mismatch is HOLD under this Owner packet. | Remove only empty directories proven by the operation-created manifest; that manifest explicitly excludes all nine precreated top-level placeholders. If any placeholder must be removed, stop until its separate authorized removal is completed before N5; N5 rollback never removes it. | Any payload, wrong root, reparse/ADS/containment failure, missing private binding/ACL evidence, non-idempotent result, missing/mismatched Opus5/high advisory receipt, or a precreated placeholder appearing in the operation-created manifest. |
| N6 — DB handle and quiescence rehearsal | Accepted N5; N0-v2 named service/DB owner map; no pointer change. | N0-accepted named service and DB owners execute the rehearsal; Terra/max integrates evidence. The Owner's standing authorization covers temporary stop only for the exact N0-v2 13 at N6/N9, no reboot. | Per-service DB-handle inventory and quiesce/release/reopen rehearsal receipt with no cutover pointer. | Manual service/DB owner readback; exact `service_db_owner`, exact sole stop/re-enable surface, stop/readback/re-enable/readback evidence for any of the authorized 13; explicit confirmation no other task stopped. | Named service owner reopens/resumes only the rehearsed service; no pointer state is changed. | Unresolved handle, writer, service/DB owner, sole stop/re-enable/readback surface, or recovery behavior; any stop outside the exact 13 at N6/N9, any need for host reboot. |
| N7 — copy-only per-class staging | Accepted N5 and N6; N4 freeze identifies one class at a time. In WS, staging remains outside target and does not publish canonical bytes/lineage. | The exact leaf contract names the per-class staging writer; Terra/max is bounded executor/integration writer only when that contract grants it; the exact source byte owner supplies read-only origin; control_root sole writer records control receipts. | Create-only per-class staging manifest, source/destination digests, applicable Git/DB readback, and proof that callers and source writers remain unchanged. | Per-class manifest/hash parity and applicable Git/DB checks; manual source-owner confirmation of copy-only scope. | Delete only staging copies proven by the operation-created manifest; preserve the unchanged source and receipts. | Digest mismatch, source-writer conflict, caller/pointer change, unsupported source policy, incomplete class evidence, or any target publication before Human/project-authority acceptance. |
| N8 — local-recovery restore and rollback | Accepted N7 staging evidence for the selected class. | guild_hall/backup_controller owns the recovery contract; the named recovery adapter performs actual recovery mutations; Terra/max executes/integrates the isolated leaf only if its contract grants it and never assumes backup-controller writer credentials; the exact recovery_root binding owner admits the target. | Isolated local-recovery restore, parity/readback, and rollback rehearsal receipt. | Local isolated restore plus manifest/hash and applicable DB parity; rollback readback proves the prior local state remains recoverable. | Use the rehearsed local recovery path and remove only operation-created isolated staging. | Restore/parity/rollback mismatch, missing recovery binding, or any attempt to apply recovery to a live cutover surface. |
| N8.5-WS-PUBLISH — accepted bytes + lineage publication | `pre_publish_readiness`, accepted N8-WS recovery evidence, exact accepted `input_source_revision_ref`/`input_source_digest`, exact staged `candidate_revision_ref`/`candidate_content_digest` plus `candidate_relation`, `producer_ref`/`build_ref`, `reviewer_ref`/`independence_receipt_ref`/`review_ref`, authority acceptance, an external `trusted_packet_digest`, and the Genesis-shared `publisher_ref` sole writer. | Human/project authority accepts the exact candidate; the Genesis-shared target publisher performs the single atomic target publication. Terra/max may only integrate public-safe receipts when the leaf contract says so. | One `post_publish_closure` atomic publication receipt binding `phase_operation_ref`, input source, candidate/relation, target bytes ref, canonical lineage ref, `publisher_ref`, `target_workspaces_binding_ref`, `target_workmeta_binding_ref`, shared `generation_ref`, idempotency key, `correction_supersession_policy_ref` **equal to Genesis `approved_correction_supersession_policy_ref`**, active-pointer readback, and replay `original_request_digest`/`replay_request_digest`/`prior_receipt_digest`/`replay_readback_digest` parity proof. | Private publisher readback proves bytes and lineage committed together, one publisher equality with both Genesis sole writers, binding equality with both Genesis bindings, shared-generation equality, Genesis-approved correction policy equality, digest/ref parity, wrong writer denial, replay `NO_OP`, and no candidate existed inside target before acceptance. Independent review must carry producer/build refs and a reviewer-separation/independence receipt. | Before atomic commit, remove only operation-created external staging. After accepted commit, do not delete accepted bytes; publish a correction/supersession or restore the prior active pointer only through the same named authority/writer contract. | Missing pre-publish phase, shared sole publisher/both target bindings/shared generation, source/candidate relation, independent-review separation, acceptance, atomicity/readback, idempotency/replay digest parity, Genesis-approved correction-supersession policy, or any attempt to publish an unaccepted candidate. |
| N9 — quiesce, CAS pointer/service cutover, and canary | NW: accepted N6/N7/N8-NW evidence plus an event-specific Human cutover gate. WS: accepted N8.5-WS-PUBLISH `post_publish_closure` in addition. N9 never accepts or publishes an unaccepted candidate. | Human Owner opens the cutover gate; N0-named service owners quiesce/resume; the named control_root sole-writer adapter performs the CAS pointer; Terra/max integrates receipts and never assumes pointer-writer credentials. The standing stop authorization remains exact N0-v2 13 only, temporary, N9-only, no reboot. | Quiesce receipt, CAS epoch/pointer receipt, service cutover receipt, compatibility state, post-cutover canary evidence, and—if N9 stopped Vigil—a resumed/healthy Vigil readback before N10. | DB-handle release, exact `service_db_owner`, sole stop/re-enable/readback surface, exact authorized-task stop/readback/re-enable/readback, CAS/current-target fencing, named-service health/canary, stale-writer denial readback, and a fresh independent Opus5/high advisory review receipt; the advisory grants no authority, and missing/mismatch is HOLD under this Owner packet. | CAS back to the exact prior pointer/epoch and resume only named services through their owners; never use reboot, broad delete, or path replacement. | Missing N8 local recovery evidence, failed canary, missing WS post-publish closure, mismatch between current/target fence, any stop outside N0-v2 exact 13 at N9, missing stop/re-enable/readback surface, any need for host reboot, or missing/mismatched Opus5/high advisory receipt. |
| N10 — observation and Human cutover acceptance | Accepted N9 canary and, if N9 stopped Vigil, resumed/healthy Vigil readback before the defined observation window. Any WS observation covers only already accepted canonical bytes/lineage, never an unaccepted staging candidate. | Human Owner alone accepts or rejects cutover; Vigil remains read-only observer; Terra/max integrates evidence. | Observation-window receipt, Vigil read-only status evidence, and Human cutover acceptance or rejection receipt. | npm.cmd run validate:watch-storage-map plus manual review of no raw/writer fields, the resumed/healthy Vigil readback when applicable, and the Human decision. | If rejected or degraded, execute only N9's exact rollback; do not retire any legacy surface. | Observation failure, missing/rejected Human acceptance, false-green/unknown evidence, absent Vigil resumed/healthy evidence when N9 stopped it, or a request to treat technical integration as Human acceptance. |
| N11 — retirement | Accepted N10 Human cutover acceptance and a separately rehearsed and accepted NAS restore; NAS restore is not an N9 cutover prerequisite. For legacy history, retirement also requires an explicit retention/legacy-binding decision and proof that the future Event Timeline/Analytics/AI Workforce route owning a noncanonical history is accepted; otherwise legacy source remains authoritative reference-in-place. | Human Owner alone decides retirement after an authorized NAS custodian/Owner restore acceptance; Terra/max cannot retire. | Rehearsed/accepted NAS restore receipt, retained accepted NAS/recovery-generation ref, retention/legacy-binding decision, and explicit Human retirement decision. | Private NAS restore rehearsal/readback and Human acceptance evidence; verify that the retirement target, retained accepted NAS/recovery generation, and recovery path are exact. | No irreversible retirement occurs without the Human decision; any post-decision recovery rebinds through the retained accepted NAS/recovery generation only after a Human rebind decision. | Missing/failed/rehearsed-unaccepted NAS restore, missing retained accepted generation, missing Human retirement or rebind decision, unresolved retention/legal hold, absent accepted noncanonical-history owner route, or any delete/retire action outside the exact approved target. |

### Cycle breaks and non-inference rules

- Owner private physical-root inventory seeds N2 before the N4 scanner. The
  scanner validates only an already admitted binding, so it cannot become the
  source of the address or a circular prerequisite for its own binding.
- N8 local-recovery restore and rollback gates N9 cutover. A separately
  rehearsed and accepted NAS restore gates only N11 retirement, so NAS evidence
  does not deadlock the reversible local cutover path.
- The Owner already authorized a narrowly scoped temporary stop for the exact
  N0-v2 accepted 13 writer-risk scheduled tasks **only at N6/N9**, with no host
  reboot and mandatory re-enable/readback. That authorization does not close the
  execution gate: every row still needs exact `service_db_owner`, sole
  stop/re-enable surface, and before/after readback. Sol/high, Terra/max, Gemini,
  and Opus cannot widen that task set, timing, or stop authority.
- A root class is never an address. The top-level placeholders, Registry
  class, scanner, or resolver cannot select a private physical root, infer ACL
  scope, or create a second writer.

### Start boundary

May start now, with zero mutation: this authority annex; Sol/high lead
creation/continuation for N0/N1 only; N0 and N1 read-only drafts; the caller
map; a binding-schema packet; and Human/NAS receipt templates. Any actual
private/cloud observation remains limited to explicit Owner-admitted read scope
and must stop on ambiguity.

Actual N2 control_root binding write, N3 ACL action, N4 scanner/inventory
freeze, N5 and later canary/staging/recovery/cutover/acceptance/retirement
leaves remain HOLD pending their listed evidence and Human gates.

## Purpose

Soulforge already has product seams, Modules, Packs, source connectors, Agent profiles, project work folders, knowledge projections, and several operational data/control roots. The missing organizing spine is one physical architecture that tells every human and Agent:

- which root owns source, runtime, data, control, project work, tools, recovery, and external originals;
- where each logical asset class belongs;
- how current paths remain usable while target organization is introduced;
- how a caller resolves a path without embedding a host-local absolute path;
- how Vigil reports storage, capture, backup, restore, and migration readiness; and
- which evidence is required before a physical move or readiness claim.

The immediate goal is **structure now, movement later**. Defining and enforcing the map cannot be deferred; destructive relocation can and must be staged.

## Owner direction captured on 2026-08-30

1. The scope is the whole Soulforge estate, not Linear or the Agent Platform alone.
2. Linear, Slack, mail, voice/PLAUD, cloud/Drive, Buzz, PC activity, team files, and later connectors must appear through the same source-oriented catalog shape.
3. Project assets, knowledge/ontology/context, AI workforce assets, artifacts, templates, BOM/material data, datasets, backup generations, receipts, and restore evidence must be locatable without reading conversation history.
4. Vigil must expose a read-only Storage & Backup Map for all registered roots and sources without exposing raw bodies, private memory, credentials, or deep collaboration data.
5. Existing source/runtime/data/control/Bot paths are registered first. They are migrated one bounded class at a time only after backup, restore, caller, and rollback evidence passes.
6. New work resolves a registered logical path or stops with an unregistered-path HOLD.

## Product and physical axes

```text
Product axis (stable IDs; display names remain draft)
product.erp       Soulforge ERP
product.engine    Soulforge Engineering Engine
product.agent     Soulforge Agent Platform

Portfolio axis
SF-P01 Work Discovery     SF-P02 ERP & Assets       SF-P03 Operations
SF-P04 AI Workforce       SF-P05 Knowledge          SF-P06 Engine Family
SF-P07 Tool Workshops     SF-P08 Security/Recovery  SF-P09 Adoption

Physical-root axis (independent enum)
source_checkout | runtime_root | data_root | control_root | project_work_root
tool_root | recovery_root | external_runtime_root | external_owner_store
secret_owner_root
```

A product can use several physical roots, and a physical root can serve several products. Product folders are catalog views and release manifests, not a reason to duplicate bytes or create competing sources of truth.

The accepted G0 reconciliation applies that separation directly to the target Suite layout:
the nine `<TARGET_SOULFORGE_ROOT>` top-level paths are target aliases for the physical-root
classes documented in `SOULFORGE_SUITE_STRUCTURE_AND_CONFIGURATION_V0.md`, while
the Plan 17 numbered data spine is the only physical child manifest of `data`.
Project/human/Bot/external/secret/tool roots remain exact Registry bindings and
are not auto-created Suite top-level directories.

The current tracked seed remains reference-in-place rather than current proof of
that target sibling topology: `canon.workspaces` is parented by
`root.data_root`, and `plane.workmeta` plus `plane.private_state` are parented
by `root.source_checkout`. A physical-root class is not an address. `install`
and inactive `packages`, and `control` and `private-state`, must receive unique
target `logical_path_id`, `binding_ref`, `parent_binding_ref`, and binding epoch;
resolver fallback or ambiguous target resolution is prohibited. The exact target
row/binding migration is a named pre-R2 blocker, so current Registry consistency
is not claimed.

## Current observed public-safe shape

2026-09-01 local Main Node canary: the active runtime root was reduced to two
registered children, `server-pack` and `source-lanes`, without rebooting the PC.
The previous full runtime checkout and exact task/config/state definitions are
retained only in the recovery plane. HPP runs from one versioned release/current
pointer, while the Slack source lane keeps its own versioned runtime and a
digest-fenced binding/state migration receipt. This is local operational
evidence, not external physical-seat, NAS-restore, release or production proof.

Role axes are also separate. `main_node` is the deployment-topology role of this
physical server, while its existing local bootstrap identity remains `tool_pc`
for CAD/Office/EDA execution and Local Activity rules. The Main Node profile
contains the Tool Workshop Cell. A single-value bootstrap identity is not
silently rewritten to fake a multi-role schema; callers must choose the correct
axis explicitly.

Host-local path values remain private/runtime configuration. Read-only metadata
observation confirms the existing classes identified below; target-only rows are
explicitly labeled and are not existence claims:

This target classification does not assert that legacy bytes have migrated.
Legacy runtime, data, control, tool, and recovery roots remain
reference-in-place and move only by their exact R5/R7 class leaf. The legacy
data root can already contain a numbered Plan 17 view beside lifecycle-oriented
children and a secret-owner child; that does not authorize a bulk copy, and
secret-owner material never becomes a `data_root` materialization class.

| Alias | Observed contents | Current interpretation |
| --- | --- | --- |
| `source_checkout` | canonical roots, docs, `guild_hall`, UI workspace | public source/canon, not runtime data |
| `runtime_root` | runtime checkout and installed compatibility surfaces | runtime compatibility, not a new canon |
| `data_root` | backups, config, ingress, ingress-MCP, manifests, quarantine, runtime, state, timeline | existing custody/data plane with mixed lifecycle-oriented layout |
| `control_root` | backup controller, history, ingress control, local activity, mail, rollback, Slack, tools, voice label, `Watchtower` | protected control and receipt plane |
| `project_work_root` | `COMMON`, `MFG`, `PJT`, `TOOL`; project/year/role branches | operational Bot/project work organization, not Official Task or artifact truth |
| `tool_root` | specialist tool support | tool/runtime owner, not project canon by itself |
| `recovery_root` | isolated recovery-test targets | test-only recovery surface |
| `external_runtime_root` | source-local Buzz/Hermes and later managed runtime bindings | external/runtime owner; not Soulforge installed runtime or ERP truth |
| `external_owner_store` | source SaaS, Drive, NAS, source repositories | original/source-local authority under its ACL |
| `secret_owner_root` | OS/Secret Manager protected identity and credential custody | `TARGET/VERIFY_PHYSICAL`; never materialized in public canon or `data_root`; registry stores `secret_ref` only |

### Alias crosswalk with plan 15

| Plan 15 alias | Plan 17 root class |
| --- | --- |
| `source_checkout` | `source_checkout` |
| `runtime_checkout` | `runtime_root` |
| `data_plane` | mixed legacy container: classify child bindings as `data_root`, `runtime_root`, or `secret_owner_root`; no whole-root mapping |
| `control_plane` | `control_root` |
| `buzz_runtime` | mixed legacy container: classify source/data/backup children under `external_owner_store` or `data_root`, and executable/session children under `external_runtime_root` |
| `bot_worktree` | `project_work_root` |

`_workmeta` and `private-state` are nested private repositories whose current
physical containment may be under a source checkout, but their logical records
belong to `data_root` and `control_root` respectively. `_workspaces` is the
ERP/Vault-owned canonical project-file materialization surface and is registered
under `data_root`; an owner-approved shared worksite may supply the exact bytes
through a private binding, but the stable ERP address remains
`_workspaces/<project_code>`. `bot_worktree` is a different mutable Agent work
surface under `project_work_root`. R1 must register these as separate multi-axis
rows rather than infer ownership from containment.

The seven canonical roots remain the public structural authority and take
precedence over physical aliases:

| Canonical root | Physical interpretation |
| --- | --- |
| `.registry` | canonical catalog/knowledge/skill/tool owner inside `source_checkout` |
| `.unit` | active Unit owner inside `source_checkout`; runtime bindings remain separate |
| `.workflow` | workflow canon inside `source_checkout` |
| `.party` | reusable orchestration template canon inside `source_checkout` |
| `.mission` | held mission plan owner inside `source_checkout` |
| `guild_hall` | cross-project Module owner inside `source_checkout`; runtime state binds separately |
| `_workspaces` | ERP/Vault canonical project-file materialization root under `data_root`; exact shared-worksite bytes may bind privately without changing the ERP address |

Physical-root classes are aliases for storage/runtime resolution, not new
canonical roots or replacement owner surfaces.

The current `data_root` already has mail, Slack, voice, PC activity, team-file, run-log, quarantine, runtime, checkpoint, receipt, and timeline surfaces. The problem is not an empty disk: people see processing stages while they need a stable source- and asset-oriented catalog view. Linear, cloud/Drive, Buzz, Hermes, knowledge, and cross-project asset views are not yet materialized as one coherent ERP-facing catalog.

## Target data-root catalog view

Numeric prefixes are presentation order, not authority or database keys.
This code block is the sole physical manifest for `<TARGET_SOULFORGE_ROOT>/data` when an
exact R2 canary is authorized; it is not a claim that the internal tree has
been applied. The materializer creates empty directories only under its exact
approved canary binding, and cannot copy/move payloads or materialize secrets.

```text
data_root/
├─ 00_CATALOG/
│  ├─ path-registry/
│  ├─ owners/
│  ├─ storage-classes/
│  ├─ asset-classes/
│  ├─ ledger-catalog/
│  ├─ case-activity-registry/
│  └─ legacy-path-map/
├─ 10_SOURCE_CAPTURE_CATALOG/
│  ├─ linear/
│  ├─ slack/
│  ├─ mail/
│  ├─ voice-plaud/
│  ├─ cloud-drive/
│  ├─ buzz/
│  ├─ hermes/
│  ├─ git/
│  ├─ nas/
│  ├─ pc-activity/
│  ├─ team-files/
│  └─ run-logs/
├─ 20_PROJECT_ASSET_INDEX/
│  └─ <project-ref>/
├─ 25_EVENT_TIMELINE_INDEX/
│  ├─ occurrences/
│  ├─ correlations/
│  ├─ decisions/
│  ├─ validity-intervals/
│  └─ supersession/
├─ 30_KNOWLEDGE_INDEX/
│  ├─ source-catalog/
│  ├─ ontology/
│  ├─ project-context/
│  ├─ accepted-generations/
│  ├─ rag-indexes/
│  │  ├─ generation-catalog/
│  │  ├─ evaluation/
│  │  ├─ active-pointer/
│  │  └─ invalidation/
│  ├─ wiki-projections/
│  └─ notebooklm-bindings/
├─ 40_ASSETS/
│  ├─ artifacts/
│  ├─ templates/
│  ├─ bom-material/
│  ├─ datasets/
│  ├─ test-results/
│  └─ revisions/
├─ 45_EVENT_STORES/
│  ├─ projects/<project-ref>/<store-id>/
│  └─ organizations/<approved-org-scope>/<store-id>/
├─ 50_AI_WORKFORCE_INDEX/
│  ├─ agent-families/
│  ├─ agent-marks/
│  ├─ runtime-profiles/
│  ├─ deployments/
│  ├─ runs/
│  └─ memory-generations/
├─ 55_ANALYTICS_DATASET_INDEX/
│  ├─ process-mining/
│  └─ learning-evaluation/
├─ 60_BACKUP_GENERATIONS/
│  ├─ <registered-source-or-data-class-id>/
│  └─ projects/
├─ 70_QUARANTINE/
├─ 80_CUSTODY_RECEIPT_INDEX/
├─ 90_PROJECTIONS/
│  └─ watch-4192/
└─ 99_RESTORE_REQUEST_REFS/
```

This target is an ERP-facing catalog/index view, not a second project-context,
timeline, ontology, Agent-memory, receipt, or recovery-byte authority. Entries
point to current approved source/custody owners, immutable revision stores,
backup generations, or rebuildable projections. `_workmeta/<project>/` remains
project-context canon; approved source/Drive lineage remains ontology authority;
source-native, routing, project, and accepted World-Tree timelines retain their
distinct owners. `20`, `25`, `30`, and `50` store pointers, typed relations,
scope, accepted-generation refs, and status unless an exact custody policy
separately authorizes bytes. A physical copy is permitted only by its
source-kind policy and exact promotion/backup gate.

`60_BACKUP_GENERATIONS` is generated from registered source/data classes rather
than maintained as a second hand-written source list. Linear, Slack, mail,
voice, cloud, Buzz, Hermes, Git, NAS, projects, scoped ledger stores and RAG
generation metadata appear only when their Path Registry class and backup policy
exist. A missing class remains visible as `HOLD`; it is never omitted to make
coverage look complete.

`45_EVENT_STORES` is not one enterprise database. The central Catalog records
each store, but Event bytes are partitioned by project/approved organization,
ACL, retention, legal hold and restore blast radius. A SQLite WAL store is
permitted only for the first bounded single-project pilot behind an API/MCP port.
Source-native cursor and transactional outbox remain with their authoritative
source/data owner; `control_root/ledger-relay/**` owns only relay checkpoints,
reconciliation, poison/HOLD and rollback receipts.

## Whole-product and whole-folder target map

This is the one-page folder view for the full plan. It combines product source,
runtime, project payload, knowledge, Ledger, backup and external owners without
claiming that target-only folders already exist. Existing paths stay in place;
the indented product groups are catalog/release views, not a move instruction.

The view is logical, not containment. Physical work roots are siblings:

```text
host storage
├─ soulforge_root/                 # source/runtime/data/control/canon
├─ human_work_root/                # person-managed work; outside Soulforge
└─ project_work_root/              # Bot work; outside Soulforge
   └─ workroot.bot_execution/
```

Only Human/project-authority accepted exact bytes cross from either external work
root into target ERP `_workspaces`; their canonical byte-lineage is published
atomically into target `_workmeta`. Current run/binding/worklog/analytics/RAG
history remains reference-in-place in its legacy source until its exact target
Event Timeline, Analytics, or AI Workforce owner/writer is accepted.

```text
Soulforge Engineering OS
├─ source_checkout/                                  # public code, canon, contracts
│  ├─ docs/architecture/
│  │  ├─ foundation/                                 # vision, products, roadmap, glossary
│  │  ├─ guild_hall/                                 # organization/engine/knowledge policies
│  │  └─ workspace/                                  # project/workspace/file rules
│  ├─ product.erp/                                   # logical view; current paths below
│  │  ├─ ui-workspace/apps/dev-erp/
│  │  ├─ ui-workspace/apps/dev-erp-mcp/
│  │  └─ guild_hall/{file_activity,requirement_trace}/
│  ├─ product.engine/
│  │  └─ guild_hall/engineering_engine/{core,engines,profiles,bindings,tests}/
│  ├─ product.agent/
│  │  ├─ guild_hall/{engineering_mcp,agent_observation,ai_usage_meter}/
│  │  ├─ guild_hall/{tool_workshop,deployment_pack}/
│  │  └─ .registry/  .unit/  .workflow/  .party/  .mission/
│  ├─ shared.platform/
│  │  ├─ guild_hall/{path_registry,backup_controller,rag}/
│  │  ├─ guild_hall/{gateway,ingress,bastion_action,watch_panel_contract}/
│  │  ├─ guild_hall/event_ledger/                    # TARGET mechanical module
│  │  └─ ui-workspace/apps/team-ops-board/           # 4192 read-only view
│  └─ module manifests, schemas, tests, validators, manuals, release evidence
│
├─ runtime_root/                                     # installed Server/Client modules
│  ├─ server-pack/<version>/
│  ├─ team-client/<version>/
│  └─ runtime health/release refs
├─ external_runtime_root/
│  ├─ buzz/<deployment>/
│  ├─ hermes/<agent-deployment>/
│  └─ managed connector runtime refs
│
├─ data_root/                                        # complete tree defined above
│  ├─ 00_CATALOG/                                    # Path/Asset/Ledger/Case/Activity
│  ├─ 10_SOURCE_CAPTURE_CATALOG/                     # Linear/Slack/Mail/PLAUD/Drive/...
│  ├─ 20_PROJECT_ASSET_INDEX/
│  ├─ 25_EVENT_TIMELINE_INDEX/
│  ├─ 30_KNOWLEDGE_INDEX/                            # Context/Ontology/RAG metadata
│  ├─ 40_ASSETS/                                     # Artifact/Template/BOM/Dataset refs
│  ├─ 45_EVENT_STORES/                               # project/org scoped, TARGET
│  ├─ 50_AI_WORKFORCE_INDEX/                         # Family/Mark/Deployment/Run/Memory
│  ├─ 55_ANALYTICS_DATASET_INDEX/
│  ├─ 60_BACKUP_GENERATIONS/                         # registry-generated classes
│  ├─ 70_QUARANTINE/
│  ├─ 80_CUSTODY_RECEIPT_INDEX/
│  ├─ 90_PROJECTIONS/watch-4192/
│  └─ 99_RESTORE_REQUEST_REFS/
├─ control_root/
│  ├─ path/private bindings and write-policy state
│  ├─ source collectors, leases, checkpoints and rollback receipts
│  └─ ledger-relay/{checkpoints,reconciliation,poison-holds,health}/
│
├─ _workspaces/                                      # target ERP/Vault accepted canonical bytes only
│  └─ <project_code>/
│     └─ <accepted SE variant-defined stage>/<numbered artifact>/<accepted revision>/...
│        # exact accepted artifact/source/dataset/baseline/release bytes only;
│        # no plan/task/RAG/analytics/temp/run/worklog/candidate surface
├─ project_work_root/                               # mutable Agent work surface, never ERP canon
│  └─ workroot.bot_execution/
│     ├─ COMMON/  MFG/  PJT/  TOOL/
│     └─ <project>/<role>/{work,cache,outbox,result_refs,evidence_refs}/
├─ _workmeta/<project_code>/                         # target canonical byte-lineage only
│  └─ lineage/
│     └─ <logical_artifact_or_file_id>/<accepted revision>/
│        # exact hashes/parents/custody/acceptance/baseline/release/evidence/
│        # correction-supersession/backup-restore refs; no daily ledger, run,
│        # report, project context, RAG candidate, task, or analytics tree
│
├─ tool_root/
│  └─ <workshop>/<version>/{adapter,lease,health,release}/
├─ recovery_root/
│  └─ <restore-operation>/{staging,readback,receipt}/
├─ external_owner_store/
│  ├─ linear/  slack/  mail/  voice-plaud/  cloud-drive/
│  ├─ buzz/  hermes/  git/  nas/  team-files/
│  └─ original ACL, retention, legal hold and source-local history
└─ secret_owner_root/                                # TARGET/VERIFY_PHYSICAL, secret_ref only
```

An existing `_workspaces/_local` child is legacy/unclassified state, not a target
work root. New human or Bot scratch/cache/outbox material must not be created
under `_workspaces`.

The portfolio overlay is stable across this tree:

```text
sf-p01 Work Discovery        sf-p02 ERP & Assets
sf-p03 Operations            sf-p04 AI Workforce
sf-p05 Knowledge             sf-p06 Engineering Engine
sf-p07 Tool Workshops        sf-p08 Security & Recovery
sf-p09 Deployment & Adoption
```

No existing Module is moved merely to make the tree look tidy. A current folder
that does not yet fit the view receives a Path Registry row and compatibility
mapping first. A target-only folder remains `TARGET/HOLD` until owner, writer,
binding, ACL, backup and restore gates pass.

Target `_workspaces/<project_code>` does not use one universal hand-written
category tree. The approved `se_foldertree_generate` variant for business type,
prime contractor, quality grade and profile owns the accepted stage/artifact
numbering. A project can therefore have a different generated canonical-byte
subtree without changing the stable ERP project root. Project RAG, Analytics,
Task/plan, and reusable temp history are not target workspace children: their
future target owners are the numbered `data_root` Knowledge/Event/Analytics
indexes and only become writers after their own `TARGET/HOLD` acceptance.

### NAS의 두 역할은 별도 자산이다

`NAS`라는 한 단어를 두 방향에 재사용하지 않는다.

| 역할 | 흐름 | ERP/Registry가 기록하는 것 | 현재 판정 |
| --- | --- | --- | --- |
| NAS backup target | Soulforge/ERP/HPP/project custody bytes → approved NAS lane | 보호 대상 source generation, destination custody ref, manifest/hash, backup generation, restore readback·acceptance | Backup Controller 계약 존재; public tree만으로 actual NAS health·최신 backup/restore는 `UNKNOWN/HOLD` |
| NAS source asset | NAS에 원래 존재하는 설계·시험·공유 자료 → source catalog/custody decision | `source.nas` identity, ACL/owner, observed revision, hash/manifest pointer, project binding, 별도 backup/restore evidence | exact native capture receipt와 source policy가 없어 `HOLD` |

`60_BACKUP_GENERATIONS/<registered-source-or-data-class-id>/`의 `source.nas` class는
**보호 대상 source kind가 NAS**라는 뜻이다. Soulforge 데이터를 NAS에 보냈다는 뜻은
destination ref/receipt가 소유하며,
폴더명으로 추정하지 않는다. 반대로 NAS source asset을 ERP DB에 통째로 복제하지
않는다. 기본은 metadata/pointer이고, bytes는 exact custody policy와 acceptance가
있을 때만 승인된 byte owner가 보관한다. NAS backup target의 사본을 다시
`source.nas`로 자동 인입하여 재귀 백업하는 것도 금지한다.

Vigil은 실제 evidence가 연결될 때 `NAS backup target`과 `NAS source asset`을
서로 다른 row/status로 보여야 한다. 전자는 backup/restore readiness, 후자는
capture/project-binding/custody readiness다. 둘 중 하나의 green으로 다른 하나를
green 처리하지 않는다.

`25_EVENT_TIMELINE_INDEX` indexes durable event memory owned by its exact
source/project/accepted-context surface; `90_PROJECTIONS` is rebuildable
presentation. They must not be merged, and the index cannot widen project scope.
The `secret_owner_root` has no directory in this target tree: plaintext secret
material is a forbidden materialization class.

Custody/data receipts may be indexed at `80`; writer-authority, lease,
operational checkpoint, action, and rollback receipts remain under
`control_root`. `99` contains restore request/proof refs only. Actual restore
bytes and staging targets belong under an exact `recovery_root` binding.

## Uniform external-source lane

```text
10_SOURCE_CAPTURE_CATALOG/<source-id>/
├─ binding/
├─ capture-generations/
├─ manifests/
├─ backup-generation-refs/
├─ restore-tests/
├─ receipts/
├─ quarantine-refs/
├─ current-projection/
└─ legacy-path-map/
```

`legacy-path-map` is metadata, not a symlink, silent fallback, or second writer.
`backup-generation-refs` points to the canonical generation/index owned by
`60_BACKUP_GENERATIONS`; it never duplicates generation bytes. Each source
remains independently scoped, credentialed, retained, backed up, and restored.
`pc-activity`, `team-files`, and `run-logs` use `source_class: internal_capture`;
Linear, Slack, mail, voice, cloud, Buzz, Hermes, Git, and NAS use the exact
external/runtime/source-owner class rather than being silently treated as
equivalent. The R1 source inventory is registry-driven and contains every Plan
10 source as a row, including explicit `HOLD` rows; a self-selected source list
cannot satisfy full coverage.

## Path Registry contract

Owner assignment recorded 2026-08-31: `guild_hall/path_registry` owns the public
schema/logical entries, resolver runtime, and protected binding-adapter contract;
actual private binding bytes remain under the `control_root` sole writer.
`guild_hall/bastion_action` owns operation-aware write-policy validation with
Human Owner final authority. `guild_hall/watch_panel_contract` owns the Vigil
projection contract and Vigil is the read-only consumer. The approved
materializer canary logical ref is `pathref:recovery.physical_spine_canary`;
private physical binding, ACL, and apply/readback evidence remain `HOLD`.

Every registered path record contains at least:

| Field | Meaning |
| --- | --- |
| `logical_path_id` | stable caller-facing ID, independent of drive letter |
| `physical_root_class` | exact enum: `source_checkout`, `runtime_root`, `data_root`, `control_root`, `project_work_root`, `tool_root`, `recovery_root`, `external_runtime_root`, `external_owner_store`, `secret_owner_root` |
| `logical_owner_class` / `parent_binding_ref` | logical authority and physical-containment relation are separate |
| `product_refs` / portfolio-role refs | stable `product.*` IDs plus canonical lowercase `producer_portfolio`, `logical_owner_portfolio`, `infrastructure_portfolio`, `consumer_portfolios`; `SF-Pxx` is the human display form |
| `module_owner_ref` | exact Module/interface owner |
| `asset_or_source_class` | source, project, knowledge, artifact, agent, backup, receipt, projection, etc. |
| `project_or_org_scope_ref` | exact project or approved organization/common scope; no implicit cross-project view |
| `binding_refs` | current/target/shared/PC-local binding refs with node/site, binding revision, epoch, and expiry; no public absolute path |
| five owner refs | logical, byte, revision, acceptance, backup/restore owners |
| `sensitivity` / `acl_policy_ref` | access classification and current authorization source |
| `write_policy` | sole writer, append/create-only, read-only, rebuild-only, or forbidden |
| `backup_class` / `retention_policy_ref` | authoritative, rebuildable, runtime-local, or forbidden |
| `current_state` | current, target, reference-in-place, migrating, deprecated, held, unknown |
| `manifest_ref` / `latest_receipt_ref` | exact evidence without payload |
| `migration_ref` / `rollback_ref` | bounded change and recovery pointers |

Ledger/Data rows also bind `ledger_catalog_ref`, `case_activity_contract_ref`,
`clock_relation_contract_ref`, and separate `mining_eligible`,
`learning_eligible`, `people_analytics_allowed` deny-by-default fields. A flat
default infrastructure portfolio cannot stand in for the producer or logical
owner.

Callers use a resolver such as `resolve(logical_path_id, actor_context)` and do
not embed new absolute paths. Registry schema version and resolver version are
explicit. Registry unavailable, schema incompatible, ambiguous binding, scope
mismatch, expired binding, or unregistered write returns a stable HOLD with no
legacy/default/environment fallback. The write guard initially binds the R1/R2
materializer and every newly changed program writer; existing live collectors
remain reference-in-place until their named R5 migration leaf, where guard
adoption and writer cutover are proven. The resolver is not source truth, task,
acceptance, or promotion authority.

Write authorization is operation-aware and binds exact registry revision,
binding epoch, writer identity, actor scope, and operation
`read|create|append|overwrite|delete|move`. `read_only`, `forbidden`, stale
current/target bindings, unauthorized overwrite/delete, and wrong sole writer
are denied before filesystem access. Tests must cover append-vs-overwrite,
delete/move denial, stale resolution, current/target fencing, and writer
revocation rather than only unregistered paths.

When the same source has both data and control paths, payload/capture/generation
bytes and their manifests resolve under `data_root`; writer authority, leases,
operational checkpoints, rollback instructions, and control receipts resolve
under `control_root`. A control receipt may reference data but cannot own or
rewrite it.

## Existing-path migration rule

```text
read-only inventory
  -> classify owner and data class
  -> register reference-in-place binding
  -> manifest/hash/coverage evidence
  -> accepted backup generation
  -> isolated restore/readback
  -> caller and dependency map
  -> bounded materialization canary
  -> writer quiescence and cutover epoch/fence
  -> compare-and-swap caller switch with compatibility adapter
  -> rollback rehearsal
  -> later retirement decision
```

Move, rename, delete, junction replacement, mirror/purge, and writer migration are forbidden until their exact leaf passes. New captures may adopt a target lane earlier only when old/new writers cannot conflict and source policy authorizes the target.

R2 reuses or matches the hardened path primitives already present in
`guild_hall/shared/knowledge_root_resolver.mjs`. It rejects junction/reparse
substitution, UNC/device paths outside the approved class, alternate data
streams, Unicode/Windows alias collisions, traversal, and component-by-component
realpath containment drift. Every newly materialized HPP data surface is
classified in the same slice as backed up, deterministically rebuildable, or
forbidden, and its recovery policy plus synthetic restore fixture change
together.

## Vigil Storage & Backup Map

Vigil owns a read-only projection over registered roots and source lanes. It shows root/source identity, owner pointer, binding availability, latest accepted capture and backup generation, coverage, freshness, retention/RPO policy presence, isolated restore/readback, human restore acceptance, unclassified path count, path drift, migration state, and held reason.

```text
row_key | row_kind(root|source|asset_class) | logical_id | physical_root_class
registry_snapshot_ref | registry_snapshot_digest | registry_record_ref
binding_state | latest_capture_ref | backup_generation_ref | coverage_state
coverage_registered | coverage_expected | unclassified_count | path_drift_state
freshness_state | retention_policy_state | rpo_policy_state | restore_test_ref
human_acceptance_state | migration_state | applicability_state
watch_state | evidence_at | owner_pointer | hold_code
```

Missing evidence renders `unknown` or `hold`, never green. Vigil excludes source bodies, project payload, credentials, private Agent memory, deep Buzz/Hermes sessions, and raw logs. It files an approval request at most; Bastion owns any later action execution.

The current implemented R3 projection remains limited to
`root|source|asset_class|work_root` and its reviewed 41-row seed. LR3 may add a separate
read-only Ledger coverage/lag projection after LR1 Catalog rows exist; LR5 may
add RAG generation freshness; LR9 closes the combined product coverage. Those
later rows must reuse Catalog identities and cannot be fabricated by Vigil
or silently added to the current R3 enum.

The map is an existing-node backup-readiness projection, not a new source
display: the Vigil federated topology (RED-02 pinned artifact) already owns
Slack, mail, PLAUD/voice, collector, and custody-store node identity and
health truth, so map rows resolve to those stable node IDs via registry
`topology_node_refs`/`registry_record_ref`/`owner_pointer` and add only
backup-generation, coverage, freshness, restore-test, path-drift, and HOLD
overlay/detail. Duplicate source identity is rejected at registry
construction; a source without an existing stable topology identity (Linear
today) appears only through the same registry contract.

Adapters map source/storage states into plan 08's Watch-local enum
`healthy|degraded|stale|unavailable|unknown|hold`; no source-specific state
silently widens that enum or creates a green state.
`not_applicable` rows are excluded from expected coverage only by an explicit
registry record. Aggregate precedence is deterministic:
`hold > unavailable > stale > degraded > unknown > healthy`; no evidence is
`unknown`, not `not_applicable` or green.

## Original-vision coverage checklist

| Class | Included examples |
| --- | --- |
| work discovery | Chat schedules, source occurrences, candidate/no-action/correction reasons |
| Official Task and decisions | Linear task/history, Work Brief, assignment and decision refs |
| project assets | source, sonar/test data, BOM/material/inventory, templates, references, artifacts, baselines/releases |
| knowledge/world tree | source catalog, ontology, evidence/claim/decision/time/ACL, project context, RAG/Wiki/NotebookLM |
| Engineering Engine | Core, Domain Engine, rule/profile/binding/result revisions |
| reusable execution canon | Skill, Workflow, Party, Mission, canon-to-mission promotion and local run-truth refs |
| human workforce | organization, role, onboarding/training, privacy/classification and authorized project scope |
| AI workforce | organization graph, Agent Family, Mark, runtime profile, Deployment, Run, memory generation, skill/tool policy |
| collaboration/source estate | Linear, Slack, mail, voice/PLAUD, cloud/Drive, Buzz, Git, NAS, PC/internal captures, channel/thread/attachment pointer and receipts |
| team execution | MCP, authenticated binary plane, Team Client, local outbox/checkpoint, Tool Workshop |
| observation | Vigil product/source/storage/backup/restore/usage/health projections |
| assurance and recovery | custody, quarantine, validation, review, human acceptance, backup, restore, rollback, audit |
| rollout and support | Server/Client/Workshop/Project-AI-Team/Backup Packs, training, device/ring/support evidence |
| isolation | separate project-manager/deep-context bindings, no implicit cross-project memory/source fallback |

This is broader than the first Linear or KVDS vertical. A first vertical proves interfaces; it does not reduce the final scope.

## Implementation sequence

| Order | Leaf | Exit evidence |
| --- | --- | --- |
| R0 | Physical Architecture rebaseline | reviewed root/data/source/asset map and no-move contract |
| R1 | Path Registry + resolver contract | `validate:path-registry` target: exact owner decisions; schema/version/root/logical-owner/scope/current-target binding rows; operation-aware grant; no fallback; guarded writers; unregistered/stale/wrong-writer operation fails closed |
| R2 | Target folder materializer | `validate:target-materializer` target: exact `approved_empty_materialization_root_ref`, hostile Windows/reparse/realpath guards, HPP backup classification, dry-run/apply, idempotent replay, existing payload move 0, rollback removes only empty directories created by this operation |
| R3 | Vigil Storage & Backup Map | `validate:watch-storage-map` target: registry snapshot digest, full registry-driven source/root coverage, row totals/unclassified/drift, state precedence and N/A, unknown without evidence, no writer/raw fields |
| R4 | Linear whole-workspace actual backup | capture, immutable generation, readback, isolated restore, human acceptance |
| R5 | Existing source lanes | Slack, mail, voice, cloud, Buzz, Hermes, Git, NAS, PC/internal captures, knowledge, project assets — one at a time |
| R6 | Agent/project/tool bindings | Project AI Team Pack, Team Client, Workshop, actual project vertical |
| R7 | Physical migration/retirement | caller, restore, compatibility, rollback, and Owner gates pass |

R0–R3 are the organization spine and precede remaining actual-provider and
physical expansion; they do not retroactively block the already-completed
synthetic MCP/Vault/Forge leaves. R4 starts after external/storage/restore
gates. R5–R7 remain incremental and do not justify a big-bang relocation.

Execution status (2026-08-31, `L-PHYS-SPINE`): the R1–R3 CONTRACT surfaces
exist as the synthetic module `guild_hall/path_registry` and the three
validators above are live npm scripts. Integration hardening `e57c4576`
adds authenticated materializer receipts and partial-apply recovery, semantic
clock rejection, registry-digest/safe-ref validation, and OD-10-aware Storage
Map HOLD behavior (17/10/11 tests). The tracked seed also registers nine
whole-estate asset classes (knowledge, project assets, artifacts, templates,
BOM/material, datasets, test results, Engine rules/profiles, and AI workforce)
as explicit held catalog rows, so an unbound or unprotected asset class cannot
disappear from registry-driven coverage. The seed carries four
`hold:od-10.*` authority sentinels, so every mutating authorization fails
closed and no readiness claim is representable. Enforcement wiring, real
binding registration, materializer apply on a real root, Vigil wiring, and any
physical movement remain behind private binding/ACL/canary readback and exact
enforcement wiring. R0 acceptance and OD-10 owner/projection assignments are
recorded; they do not by themselves activate a writer or physical path.

N2 contract update (2026-09-01): nine target Suite sibling rows and an atomic
all-nine in-memory binding-set gate are public-safe and default held. A private
`target.control` generation-store adapter has executable tests for exact
Suite/target identity, externally pinned writer-exclusive ACL admission,
create-only immutable generations, CAS pointer transitions, stale-lock recovery,
revocation/reactivation, and path-free receipts. This is `CONTRACT_READY` only:
the first actual private generation, ACL mutation, Registry activation, and all
payload/file movement remain `HOLD` pending the exact N2 action packet and fresh
review/readback.

R4 has a bounded actual-provider foothold, not acceptance. The read-only Linear
surface was rechecked as one entire workspace with 12 catalog projects, one
team and 72 issues; the prior physical one-shot already used that whole-workspace
scope and remains a partial technical restore candidate. The new project-index
contract classifies every catalog project plus project-less issues against one
immutable workspace generation and restore copy without duplicating bodies.
Historical edits/deletions, complete state/assignee/project/due histories,
attachment bytes, full cutoff reconciliation, recurring capture and human
restore acceptance remain the R4 exit gap.

The retained generation has now been backfilled create-only with the reviewed
project index on both the source generation and isolated restore surfaces.
Exact replay was a no-op. The measured partition is 12 projects / 72 issues,
with 47 currently project-bound issues, 25 `unassigned`, 11 non-empty projects
and one zero-issue catalog project. Existing generation bytes and receipts were
not modified. Because this is a derived classification of the retained
generation rather than a fresh collection, source changes after that cutoff
remain unknown.

R5 has begun without physical movement: pure Mail, Slack and Voice/PLAUD
adapters transform their exact accepted native capture/custody receipts into
refs-only `capture_generation` records. They emit no backup, restore,
human-acceptance, retention or RPO field, so capture-only evidence remains
`degraded`. No private record writer or actual receipt caller is activated.
An in-memory append-only Source Lane ledger now validates exact replay,
conflict, generation order, ref reuse, time order and capture→backup→restore
digest chains. It projects evidence completeness but owns no persistence,
backup bytes, restore execution, health or acceptance.
The same module now has a separate 9-class asset revision ledger and a
project-bound PC-activity coverage adapter. Asset revision/acceptance/backup/
restore evidence remains refs-only and authority-neutral. Cloud, Git and NAS
stay explicit HOLD rows because no exact native capture receipt was observed.
The Vigil server now also has a default-OFF GET-only storage-map adapter whose
binding bytes, snapshot bytes and registry digest are pinned; no actual private
binding or snapshot is supplied by public code.

## Acceptance and stop conditions

The spine is accepted only when every known root/high-value path has one
unambiguous multi-axis registry entry or an explicit unclassified/HOLD finding;
the seven canonical roots keep precedence; registry/schema/resolver/binding/
write-policy owners are exact; root classes remain distinct; current and target
cannot silently both write; project scope cannot widen; private/raw/secret data
stays out of public canon and Vigil; source-specific backup evidence cannot be
substituted; the materializer is idempotent, hostile-path guarded,
non-destructive, and rollback-aware; operation-aware authorization rejects
ambiguous/unregistered/stale/wrong-writer actions; Vigil coverage is
registry-driven; and focused validators plus fresh independent review pass.

Hold the affected branch on unknown owner/SoR, secret requirement, cross-project leak, path overlap, missing restore proof, writer conflict, unresolved caller, destructive migration, or false readiness claim.

## Current claim ceiling

- `CONFIRMED`: inspected public plan/source/Module/Pack facts only.
- `OBSERVED_METADATA_ONLY`: evidenced runtime/data/control/project-work and external root existence or shape; ownership, contents, ACL, health, and backup completeness need accepted receipts.
- `TARGET/VERIFY_PHYSICAL`: `secret_owner_root` and any other target-only root/binding until an accepted existence/ownership receipt is available.
- `TARGET`: Path Registry, source catalog, Vigil Storage Map, whole-workspace Linear actual backup, and migrations.
- `HOLD`: physical move/delete/rename, new writer, credential use, restore application, and readiness/promotion until exact gates pass.

## Related plans

- [Master decisions](00_MASTER_INDEX_AND_DECISIONS.md)
- [Vault / ERP asset revisions](03_VAULT_ERP_ASSET_REVISIONS.md)
- [Engineering MCP, client, data plane](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [Guild Agent Mark and runtime](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Vigil operations](08_WATCH_4192_OPERATIONS.md)
- [Bastion security and recovery](09_BASTION_SECURITY_RECOVERY.md)
- [External connectors and backup](10_EXTERNAL_CONNECTORS_AND_BACKUP.md)
- [Deployment and rollout](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Test and acceptance](13_TEST_DOGFOOD_ACCEPTANCE.md)
- [Roadmap and gates](14_ROADMAP_GATES_AND_DAG.md)
- [Folder compatibility](15_FOLDER_COMPATIBILITY_MIGRATION.md)
