# Knowledge Operating Model v0

## Purpose

This document explains how Soulforge combines six knowledge-operation layers
without turning private payloads, raw source truth, or advisory suggestions into
public canon by accident.

General file reads are not automatically observed. A read creates a ledger row
only when the worker or tool uses the `guild_hall/knowledge_access` read wrapper
or writes an explicit metadata-only record through the helper. Ordinary shell,
editor, search, or model-context reads leave no ledger event unless they are
recorded on purpose.

## Layer Model

| Layer | Trigger condition | Output target and owner boundary | Automation level | Approval needed | Promotion path | Failure mode |
| --- | --- | --- | --- | --- | --- | --- |
| Knowledge access ledger / read-use record | A worker, workflow, skill, tool, or advisory handoff actually uses a public-safe knowledge ref and wants traceable use. | Metadata-only JSONL rows in an explicit ledger target such as `_workmeta/<project_code>/reports/knowledge_access/**`, `_workmeta/system/reports/knowledge_access/**`, `guild_hall/state/**`, `private-state/**`, or a temp path. Public canon owns the helper and schema, not runtime ledger rows. | Explicit helper call today: `read` for file content plus a row, `record` for use/citation without reading payload, or `notebooklm-bridge` for importing explicit NotebookLM-like metadata rows as advisory `imported_log_entry` events. Later routers may append equivalent rows only from approved surfaces. | No owner approval is needed for a payload-free row in the correct private/local owner. Approval is needed before exposing private payloads or turning row-derived conclusions into canon. | Rows can feed `knowledge_access_event_capture_v0` for normalization, rollup, relation candidates, and review routing. | If the helper or explicit record is not used, no row exists. Secret-like refs, private/runtime roots, absolute paths, traversal refs, auth/session paths, empty NotebookLM query logs, or metadata with embedded runtime absolute paths must reject before append. |
| Manual candidate capture | A worker notices a repeatable procedure, missing link, reusable entity/relation pattern, open owner decision, or future workflow/skill candidate during bounded work. | Promotion-ready evidence under `_workmeta/<project_code>/reports/procedure_capture/**` or `_workmeta/system/reports/procedure_capture/**` when no project owner applies. Public docs receive only public-safe accepted summaries. | Manual capture by the worker. | Yes before public canon promotion or owner-action claims. | Candidate register -> review gate -> `skill`, `.workflow`, `.mission`, role/class, data contract, ontology candidate, or owner decision packet. | Candidate is left only in chat memory, copied into a public doc with private/raw details, or promoted without repeatable steps and acceptance criteria. |
| LLM suggestion / manual approval capture | An LLM or advisory tool suggests a pattern, relation, route, consolidation, archive, or adoption decision. | Advisory note, promotion candidate, or owner-decision evidence in `_workmeta/**` or `guild_hall/state/**` depending on scope. The suggestion is evidence, not authority. | LLM-assisted suggestion with manual capture and review. | Yes. Owner approval or an appropriate review gate is required before mutation, adoption, archive/retire action, graph update, or canon promotion. | Approved suggestion -> owner decision packet, workflow evolution, graph update packet, docs patch, or private hold. | Treating advisory text as accepted truth, hiding uncertainty, or letting an LLM suggestion mutate canon without human/review approval. |
| End-of-work sweep | A bounded task closes, validation runs, a post-development review gate is needed, or a periodic operations sweep asks what should be carried forward. | Review packet, validation log, follow-up register, and candidate notes under `_workmeta/<project_code>/**` or `_workmeta/system/**`. Public changelog/docs get only public-safe summaries. | Manual at task close; may be aided by validators, `done:check`, `night_watch`, or the post-development review workflow. | Yes for acceptance of risky changes, public/private boundary decisions, and follow-up promotion. | Follow-up register -> procedure capture, owner questions, mission/workflow work, changelog/docs, or no-action closure. | Work ends without validation, boundary review, carry-forward evidence, or a clear statement of residual gaps. |
| Sourcebound knowledge packet | Approved sources need to be transformed into a private derivative packet before concept extraction or workflowization. | Private source-bound packet, projection index/log, lint report, concept register, and claim-ceiling route under `_workmeta/<project_code>/runs/**` or another approved private owner. Source truth remains in source packets or owner-held sources. | Workflow-assisted sourcebound loop. Advisory tools may help, but cannot approve claims. | Yes for source approval, claim ceilings, concept acceptance, and any public promotion. | Source refs -> private projection/lint -> concept candidates -> workflow, ontology, owner decision, source follow-up, or private hold. | Source payloads leak into public canon, unsupported claims are treated as true, or NotebookLM/LLM advice replaces source evidence. |
| Knowledge access event capture analysis workflow | Enough ledger/register rows exist for periodic analysis, or an owner/workflow explicitly asks for usage analytics, retention review, graph candidates, or boundary review. | `knowledge_access_event_batch`, normalized log, usage rollup, retention labels, link-strength analysis, graph update packet, orphan/redundancy register, and boundary note under the appropriate `_workmeta/**` or private/local owner. Public workflow canon owns templates and rules only. | Explicit workflow run; later schedulers may run it as advisory analysis. It is not required for every individual access. | Yes before archive, retire, graph mutation, ontology acceptance, or public canon edits. Candidate labels are not decisions. | Rollup/candidates -> owner decision, graph update review, docs/workflow cleanup, source packet follow-up, or no-action retention. | Running it as a per-read requirement, copying payloads into analysis rows, or treating hot/cold/stale/orphan/redundant labels as automatic archive/retire decisions. |

## Combination Rules

- Start with the smallest layer that matches the event: use the ledger helper for
  traceable public-safe reads, manual capture for reusable observations, and the
  sourcebound packet only when source intake/projection is actually in scope.
- Keep public canon to rules, helper code, schemas, templates, and public-safe
  operating summaries. Runtime rows, private source packets, owner decisions,
  and task evidence stay in their owning private/local surfaces.
- Ledger rows may point at output refs, workflow ids, skills, missions, and
  candidate registers, but they must not copy source bodies or private payloads.
- NotebookLM bridge imports must read only explicit metadata binding, source-ledger,
  and query-log files. They must not call `nlm`, read auth/session state, import
  source payloads, or fabricate access events from source-ledger entries when no
  query row exists.
- Analysis workflows produce candidate signals. They do not decide retention,
  graph changes, archive/retire execution, ontology acceptance, or canon
  promotion by themselves.
- End-of-work sweep is the catch point: if a useful pattern appears during work
  but no ledger row or candidate capture was made, record the gap and next
  action instead of pretending the system observed it.

## External Bookshelf Owner Model

Soulforge may use an owner-managed Google Drive folder as the shared LLM wiki
source bookshelf. This bookshelf is an owner-held source storage surface, not
public repository canon and not a replacement for `_workmeta` ledgers.

Recommended folder state model:

```text
Google Drive
  Soulforge_LLM_Wiki_Bookshelf/
    00_INBOX_candidate/
    10_CANON_source/
    20_Project_CANON/
    30_Domain_CANON/
    80_SUPERSEDED/
    90_REJECTED_or_UNCLEAR/
```

Owner split:

| Surface | Role | Boundary |
| --- | --- | --- |
| Google Drive | Shared source bookshelf visible to approved PCs and NotebookLM. | Holds owner-approved source files or Drive-native source refs. Folder placement is not a canon claim by itself; `_workmeta` records the approval basis and use. |
| NotebookLM | Advisory query and summary interface over selected bookshelf sources. | It should use CANON source selections, not local-only files or unreviewed inbox candidates. NotebookLM output stays advisory until checked against sources and review gates. |
| OneDrive or cloud project worksites | Active project files, editable outputs, and shared work products. | Not the LLM wiki source-truth owner unless a source is explicitly approved, copied or linked into the Google Drive bookshelf, and recorded in `_workmeta`. |
| Soulforge / `_workmeta` | Metadata owner for source ledgers, NotebookLM bindings, query/use logs, and task linkage. | Stores refs, ids, approval notes, claim ceilings, and usage evidence. It does not store raw source bodies in public canon. |
| Local PC | Cache or working copy. | Never the source owner by default. Local-only material stays candidate/private until approved and recorded. |

NotebookLM source intake should default to `10_CANON_source`,
`20_Project_CANON`, or `30_Domain_CANON`. `00_INBOX_candidate` requires owner
review before import or query use. `80_SUPERSEDED` and
`90_REJECTED_or_UNCLEAR` are excluded from the active query set unless a bounded
review explicitly needs to cite why a source was superseded, rejected, or held.

## Snapshot And Operation Board Lane

The snapshot producer may expose a `knowledge_lane` status for operation-board
awareness, but it is a metadata surface only.

- Allowed signals: owner-gated state, helper/workflow/fixture presence, public
  metadata surface count, known private/local evidence surface counts, claim
  ceiling, sanitized blockers, and the next owner-review action.
- Excluded signals: auth/session data, NotebookLM query/answer/source payloads,
  private report prose, private evidence filenames, ontology candidate
  statements, owner decisions, graph mutation payloads, and registry promotion
  claims.
- The v0 snapshot claim ceiling is `observed`. A visible lane status never means
  that NotebookLM advice validated knowledge, accepted ontology, approved an
  owner decision, mutated a graph, or promoted registry canon.
- `knowledge_lane.evidence` counts only private/local metadata evidence
  surfaces. Public helper/docs/workflows/fixtures are reported separately and do
  not satisfy `awaiting_metadata_evidence`.
- Snapshot validation and freshness reject stored/current lane states that are
  outside `blocked_missing_surface`, `awaiting_metadata_evidence`,
  `owner_review_required`, or stronger than the current blocker/evidence
  support. They also reject any snapshot v0 claim ceiling other than `observed`.
- Knowledge access entry counts exclude auth/session-shaped file names such as
  auth, session, token, cookie, credential, and secret files.

## Validated Knowledge States And Claim Ceiling

Use the weakest state that is fully supported by evidence:

| State | Meaning | Claim ceiling |
| --- | --- | --- |
| `observed` | A worker, source packet, NotebookLM/LLM advisory note, or ledger row surfaced the idea. | Candidate note only. |
| `source_supported` | Approved source refs support the scoped statement. | Source-scoped claim only; no canon or generalization claim. |
| `validated_private` | Source-supported statement passed a private workflow, validator, or review gate inside its owner boundary. | Private owner use; public docs may mention only a public-safe summary. |
| `canon_candidate` | Public-safe abstraction and evidence refs are ready for owner/review decision. | Proposed canon only. |
| `canon_entry` | The correct owner root accepted the entry with required schema/docs/changelog guards. | Reusable canon inside that owner boundary. |
| `rejected_or_blocked` | Evidence, boundary, owner decision, or source support is insufficient. | No promotion claim. |

- When states conflict, report the lower claim ceiling.
- NotebookLM, LLMs, access ledgers, and analysis labels are not validation or
  canon authority; they can only supply advisory notes or candidate signals until
  source support, owner decision, validator evidence, or review-gate evidence
  raises the state.
- A public canon entry must not be added or upgraded unless the source boundary,
  private/raw exclusion, owner surface, and validation or review route are clear.

## Example Scenario

A worker updates a public architecture index so the knowledge-access helper is
discoverable. During the task, the worker uses these public-safe refs:

- `guild_hall/knowledge_access/README.md`
- `.workflow/knowledge_access_event_capture_v0/README.md`
- `.workflow/sourcebound_knowledge_packet_operating_loop_v0/README.md`

Expected layer behavior:

| Layer | Fires? | Reason |
| --- | --- | --- |
| Knowledge access ledger / read-use record | Yes, if the worker reads or records the refs through `guild_hall/knowledge_access`; otherwise no. | The refs are public-safe and can produce metadata-only rows, but normal file reads are not observed automatically. |
| Manual candidate capture | Maybe. | If the worker notices a reusable operating rule, it is captured in `_workmeta/system/reports/procedure_capture/**`; if the rule is already fully captured in the public doc, no separate candidate is required. |
| LLM suggestion / manual approval capture | No by default. | The task is documenting an approved operating model, not asking an LLM to decide adoption, archive, ontology, or graph mutation. |
| End-of-work sweep | Yes. | The task changes public docs and needs validator results, boundary review, changed-file review, and residual-gap notes. |
| Sourcebound knowledge packet | No. | No external or owner-held source intake is being compiled into a private source-bound projection. |
| Knowledge access event capture analysis workflow | No by default. | A single task-level smoke ledger is not a periodic rollup or retention/graph analysis request. It may run later over accumulated rows. |

In this example, the public docs can be changed, the helper smoke ledger should
use a temp or private/local ledger target, and the ledger must contain only refs
and metadata. The body of this document or any referenced source file must not be
copied into the JSONL rows.
