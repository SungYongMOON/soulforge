# Knowledge Workflow Stack v0

## Purpose

- This document explains how Soulforge should actually operate the knowledge
  layer during project work, not only how the owner boundaries are separated.
- It turns the current knowledge model into a usable stack for daily project
  work: intake, triage, research preflight, curation, usage analytics, and
  governance.
- It does not replace `KNOWLEDGE_OPERATING_MODEL_V0.md`; it sits one level
  lower and answers which workflow or runbook should be used first.

## One-line Rule

- Route knowledge ingest, audit, RAG, and wiki registration through
  `$soulforge-knowledge-ingest-cell-launcher`, which defaults to
  `knowledge_ingest_pipeline_v0`; insert audit, wiki/RAG preparation, owner
  decision, receipt/missing-audit capture, or older LLM wiki stack workflows
  only as optional routes when the request needs them.

## Stack

| Layer | Role | Primary surface now | Current state |
| --- | --- | --- | --- |
| Intake | Receive raw or candidate material without overclaim. | `AUTOHUNT_MODEL`, source packets, Drive warehouse, manual capture | existing, split |
| Ingest receipt / missing audit | Preserve cross-PC layer status for candidate, source, wiki, RAG, and canon follow-up. | `guild_hall/knowledge_access` `ingest-receipt-*` commands + `_workmeta/**/knowledge_ingest_receipts/**` | added as metadata-only recovery surface |
| Candidate triage | Decide whether material stays candidate, becomes CANON, needs owner review, or is rejected. | `knowledge_candidate_triage_v0` | added as dedicated workflow |
| Research preflight | Check project wiki and query-first routes before the main monster workflow runs. | `monster_knowledge_preflight_v0` | added as dedicated workflow |
| Curation | Turn approved sources and bounded query results into reusable project wiki state. | `wiki_curation_maintenance_v0` + `WIKI_CURATION_MAINTENANCE_V0.md` | existing |
| Usage analytics / maintenance | Roll up use, retention, weak links, orphan/redundant signals, and graph candidates. | `knowledge_access_event_capture_v0` | existing, analytics-first |
| Governance | Approve, hold, reject, promote, or stop at the weakest claim ceiling. | `owner_decision_packet_v0` + `post_development_review_gate_v0` | existing |

## Current Workflow Mapping

### Intake

- `AUTOHUNT_MODEL.md` owns `monster_type -> workflow_id + party_id` routing.
- The Drive warehouse stores candidate and CANON source files or refs.
- `_workmeta/**/reports/procedure_capture/**` owns manual candidate capture when
  a worker notices a reusable pattern during bounded work.
- `knowledge_ingest_pipeline_v0` should emit a metadata-only ingest receipt and
  missing-audit ref before closeout. This records whether candidate, source,
  wiki, RAG, and canon layers are missing, owner-gated, blocked, or complete.
- Other PCs must sync `_workmeta` after writing receipt rows; local-only chat
  memory or unpushed receipt files are not visible to this PC.

### Candidate Triage

- `knowledge_candidate_triage_v0` is the explicit candidate filter layer.
- When invoked from `knowledge_wiki_cell`, it is an optional route, not the
  default party entry.
- It does not decide source truth or owner approval; it classifies candidate
  material into a safe next route.
- Use it when a source, candidate note, or knowledge artifact must be placed
  into `00_INBOX_candidate`, `10_CANON_source`, `20_Project_CANON`,
  `30_Domain_CANON`, `80_SUPERSEDED`, or `90_REJECTED_or_UNCLEAR`.
- If the criteria for a placement route pass, write the placement record in the
  same bounded task. Do not leave a passed candidate or CANON-source placement
  as chat memory or vague future work.

### Research Preflight

- `monster_knowledge_preflight_v0` is the explicit query-first front gate.
- When invoked from `knowledge_wiki_cell`, it is an optional route before or
  around the default `knowledge_wiki_pipeline_v0` route.
- It reads only metadata surfaces first:
  - project NotebookLM binding
  - project NotebookLM source ledger
  - project packet map or operating packet when present
  - known common references
  - known claim ceilings and source gaps
- When an approved NotebookLM binding exists and the request is a knowledge
  question, preflight should actually query that bounded bookshelf before new
  source acquisition. Record only notebook/source IDs, purpose, sync state,
  and result status; trace important conclusions to the connected source or
  approved ontology package.
- It produces a packet that the main monster workflow can consume.

### Curation

- `sourcebound_knowledge_packet_operating_loop_v0` remains the reusable
  sourcebound deepening lane when raw or approved sources must be inspected.
- `wiki_curation_maintenance_v0` is the executable curation layer that produces
  metadata-only update packets for source ledgers, packet maps, notebook
  bindings, lifecycle state, and residual gaps.
- `WIKI_CURATION_MAINTENANCE_V0.md` is the current-default runbook for
  day-to-day ledger, packet-map, Drive warehouse, and NotebookLM binding
  maintenance.
- Use curation after:
  - a new approved source enters a warehouse state or NotebookLM binding
  - a NotebookLM query exposes a stable new gap or reusable source grouping
  - a source is superseded, rejected, or reclassified

### Usage Analytics / Maintenance

- `knowledge_access_event_capture_v0` already owns usage rollup, retention
  labels, link strength, orphan/redundant candidates, and graph update packets.
- Do not create a duplicate usage-maintenance workflow unless repeated manual
  operation proves that a distinct maintenance loop is required.

### End-to-end Builder

- `llm_wiki_builder_v0` is the stack orchestrator for bounded knowledge-heavy
  work.
- It ties together preflight, candidate triage, optional sourcebound deepening,
  curation, usage-capture handoff, and governance routing.
- It still does not own source truth, owner approval, or final canon authority.
- In the current registered party surface it is an optional compatibility route
  behind `$soulforge-knowledge-ingest-cell-launcher`, not the party default.

### Governance

- `owner_decision_packet_v0` owns owner-scoped approval or hold packets.
- `post_development_review_gate_v0` owns final review routing and end-of-task
  knowledge trigger closure.
- NotebookLM, access ledgers, and analytics labels remain advisory only.
- Governance closes at the weakest supported claim ceiling, but that ceiling is
  also the required registration target: candidate ceilings register candidates,
  canon ceilings register canon, and blocked ceilings register the blocker.

## Monster Integration

Use the following optional routing rule when a monster is knowledge-heavy and
the launcher selects the query-first LLM wiki stack:

```text
monster
  -> monster_knowledge_preflight_v0
  -> knowledge_candidate_triage_v0
  -> main workflow
  -> sourcebound deepening only if needed
  -> wiki_curation_maintenance_v0
  -> review closeout
```

Knowledge-heavy monsters usually include:

- source-backed planning or design questions
- repeated project artifact or standard interpretation
- “what do we already know?” questions
- “which sources are relevant?” questions
- NotebookLM-backed synthesis or gap-scan work

Do not run the preflight first for every monster automatically. Use it by
default for knowledge questions with an approved bookshelf, and skip it when:

- the work is a local code edit or bounded refactor
- the workflow already has a fully locked input packet
- raw source lookup would add no value

## Recommended Class Posture

Class and species selection can still be optimized later. The current-default
role posture is:

- `pathfinder`: start the preflight and narrow ambiguity
- `archivist`: update the project wiki state, source ledger, packet map, and
  gap notes
- `auditor`: join when claim ceiling, promotion, or approval pressure rises

This is a role recommendation, not a locked runtime assignment.

## Project Use Sequence

1. Open the project binding and source ledger first.
2. Ask whether the question can be answered by existing project wiki state.
3. If yes, use NotebookLM or known packet refs first.
4. If no, route to approved-source deepening through the sourcebound loop.
5. Record only metadata after use: refs used, purpose, gap found, and next
   route.
6. Append or update a knowledge ingest receipt so missing layers and owner gates
   survive cross-PC handoff.
7. Curate the result back into the project wiki state if it is likely to be
   reused.
8. Close through the review gate at the weakest supported claim ceiling and
   register the matching result in that ceiling's owner surface.

## Residual Gaps

The stack is now executable in workflow/package terms, but not complete in the
product sense.

- Per-source Drive-backed `drive_ref` rows still need to be recorded as source
  items are approved and migrated.
- Scheduled maintenance binding for `knowledge_access_event_capture_v0` is still
  weaker than the manual and review-driven paths.
- Query-first operation is usable now, but still depends on workers following
  the preflight discipline or an explicit caller using `llm_wiki_builder_v0`
  through the unified knowledge ingest launcher.

## Related Surfaces

- [KNOWLEDGE_OPERATING_MODEL_V0.md](KNOWLEDGE_OPERATING_MODEL_V0.md)
- [KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md](KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md)
- [WIKI_CURATION_MAINTENANCE_V0.md](../workspace/WIKI_CURATION_MAINTENANCE_V0.md)
- [AUTOHUNT_MODEL.md](../workspace/AUTOHUNT_MODEL.md)
- [llm_wiki_builder_v0](../../../.workflow/llm_wiki_builder_v0/README.md)
- [wiki_curation_maintenance_v0](../../../.workflow/wiki_curation_maintenance_v0/README.md)
- [sourcebound_knowledge_packet_operating_loop_v0](../../../.workflow/sourcebound_knowledge_packet_operating_loop_v0/README.md)
- [knowledge_access_event_capture_v0](../../../.workflow/knowledge_access_event_capture_v0/README.md)
