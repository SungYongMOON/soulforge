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
| Knowledge access ledger / read-use record | A worker, workflow, skill, tool, or advisory handoff actually uses a public-safe knowledge ref and wants traceable use. | Metadata-only JSONL rows in an explicit ledger target such as `_workmeta/<project_code>/reports/knowledge_access/**`, `_workmeta/system/reports/knowledge_access/**`, `guild_hall/state/**`, `private-state/**`, or a temp path. Public canon owns the helper and schema, not runtime ledger rows. | Explicit helper call today: `read` for file content plus a row, or `record` for use/citation without reading payload. Later routers may append equivalent rows only from approved surfaces. | No owner approval is needed for a payload-free row in the correct private/local owner. Approval is needed before exposing private payloads or turning row-derived conclusions into canon. | Rows can feed `knowledge_access_event_capture_v0` for normalization, rollup, relation candidates, and review routing. | If the helper or explicit record is not used, no row exists. Secret-like refs, private/runtime roots, absolute paths, traversal refs, or metadata with embedded runtime absolute paths must reject before append. |
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
- Analysis workflows produce candidate signals. They do not decide retention,
  graph changes, archive/retire execution, ontology acceptance, or canon
  promotion by themselves.
- End-of-work sweep is the catch point: if a useful pattern appears during work
  but no ledger row or candidate capture was made, record the gap and next
  action instead of pretending the system observed it.

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
