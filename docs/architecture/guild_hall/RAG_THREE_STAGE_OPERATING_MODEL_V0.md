# RAG Three-Stage Operating Model v0

## Purpose

This document fixes the Soulforge RAG work into three plain stages.

The stages are not interchangeable. A source can be searchable without being
work-ready, and it can be work-ready without being canon knowledge.

Use this model when estimating scope, reporting progress, planning DAPA-style
source work, or deciding whether a file is merely indexed, usable for work, or
ready to become durable knowledge.

## Stage Names

| Stage | Korean name | Plain meaning |
| --- | --- | --- |
| 1 | 검색 가능 RAG | The document can be searched and cited by page/chunk. |
| 2 | 업무용 RAG | The source can support bounded work answers with warnings and evidence. |
| 3 | 정본 지식화 | The source-derived knowledge is validated enough to enter a durable knowledge surface. |

## Exact Source Revision Rule

All three stages bind to an exact `source_revision_id`, not only a mutable path,
file name, `source_handle`, or current `source_id`.

Minimum lineage:

```text
source_id
  -> source_revision_id + content_id
  -> extraction_run_id
  -> rag_index_id / rag_chunk_id
  -> claim / Wiki / knowledge promotion
```

For mail, voice, SE schedule, and exact request records, the temporal input event
uses `event sourced_from source_revision`. This is the bridge that makes the
timeline and retrieval index point to the same original revision. A later work
application separately records `event/task/artifact_revision uses
source_revision|rule_revision|knowledge_revision_ref`.

Point-in-time retrieval requires both `valid_at` (what was effective/occurred)
and `known_at` (what the system had ingested by then). A bare `as_of` is not a
new-writer contract.

Legacy indexes without an exact source revision remain searchable legacy assets,
but they cannot prove point-in-time work readiness or source-supported SE rule
application until migrated. The common ID and owner contract is
[`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md).

Do not call Stage 1 "done" when the owner asks for full RAG completion. For
whole-document work, "RAG complete" normally means Stage 1 is closed for the
whole document and Stage 2/3 status is explicitly reported.

## Stage 1 - Searchable RAG

Goal:

- Put the whole approved source into a searchable, rebuildable, page-aware
  index.

This stage answers:

- "Can the system find relevant parts of this source?"
- "Are chunks connected to pages or other stable locations?"
- "Which pages are risky because of tables, pictures, OCR, or extraction
  warnings?"

Main workflow:

1. Register or confirm the source card.
2. Keep the original source under `_workspaces/knowledge/**` or another
   owner-approved worksite.
3. Extract the source with the parser-first tool chain.
4. Record source hashes, tool labels, page counts, warning counts, and output
   refs.
5. Produce approved derived text or structured extraction output.
6. Create or validate the source sync ready manifest.
7. Build the source-text index.
8. Build the traceability sidecar when structured page metadata exists.
9. Run retrieval smoke tests over representative questions.
10. Produce a Stage 1 closeout summary.

Required outputs:

- source card;
- derived text or structured extraction output;
- source sync ready manifest when applicable;
- source-text index;
- traceability sidecar when applicable;
- extraction/index validation record;
- risk inventory for pages with tables, pictures, OCR, weak mapping, unmapped
  chunks, or encoding issues.

Completion criteria:

- The entire source is represented in the index.
- Chunk count, source page count, and source refs are recorded.
- Page or location traceability is present, or its absence is recorded as a
  blocker.
- Weak/unmapped chunks are counted.
- Table, picture, OCR, and encoding risks are counted.
- Retrieval smoke tests return relevant chunks for sample questions.
- Raw source text, chunks, raw questions, and local absolute paths are not
  copied into public docs or `_workmeta`.

Allowed claim ceiling:

- `source_supported` for retrieved source-local claims when page/chunk support
  is present.
- `observed` or `manual_review` when extraction quality is uncertain.

Not allowed in Stage 1:

- final answer authority;
- source truth promotion for derived extraction;
- public canon promotion;
- ontology acceptance;
- graph truth mutation;
- default route mutation.

## Stage 2 - Work-Ready RAG

Goal:

- Turn the searchable source into a bounded work aid for real tasks, while
  keeping warnings and claim limits visible.

This stage answers:

- "Can the system help answer real work questions from this source?"
- "Can it show evidence pages and warn when the evidence is table/picture/OCR
  sensitive?"
- "Can repeated use be tracked without storing raw questions?"

Main workflow:

1. Select recurring work questions or source sections.
2. Run answer attempts from the Stage 1 index.
3. Review the cited pages and chunks for each answer attempt.
4. Mark each cited page as supported, manual-review, or blocked.
5. Create a work evidence packet for each approved bounded question or section.
6. Create an operator answer template only when a real repeated answer pattern
   exists.
7. Register private/manual-review routes only for bounded reusable question
   patterns.
8. Run no-answer probes for route matching.
9. Run health-gated operator answers only when evidence is current.
10. Record usage only after a real delivered answer and explicit record intent.
11. Produce a Stage 2 closeout summary.

Internal artifact names:

- route registry = question-topic mapping;
- work card = evidence packet for a bounded question or section;
- answer card = answer template with evidence pages and warnings;
- usage record = metadata-only proof that a delivered answer was actually used.

User-facing names:

- route registry = topic map;
- work card = evidence bundle;
- answer card = answer template;
- usage record = real-use count.

Required outputs:

- bounded question or section list;
- quality review records for cited pages;
- evidence bundles;
- answer templates when useful;
- private route map when useful;
- operator health or readiness record;
- usage summary when real answers have been delivered.

Completion criteria:

- Each reusable answer has evidence pages or source locations.
- Each evidence page has a support state.
- Manual-review warnings are visible in the answer template.
- The answer text stays within the claim ceiling.
- No probe writes usage, candidate, or call-plan records.
- Real usage is counted only from delivered work answers.
- Unmatched questions become candidates instead of silent failures.

Allowed claim ceiling:

- `source_supported_manual_review_current_claim_scope_only` for bounded
  manual-review answers;
- `validated_private` for private route/readiness evidence after validation.

Not allowed in Stage 2:

- calling the answer final doctrine;
- treating repeated use as automatic canon promotion;
- storing raw questions in `_workmeta`;
- treating the private route as a public default route;
- claiming sourcebound-ready before the review gate passes.

Repeated-use rule:

- A repeated-use threshold is a review trigger, not a completion claim.
- The default threshold is three real delivered uses of the same route or
  bounded question.
- Reaching the threshold means "promote to sourcebound review queue," not
  "canonize automatically."

## Stage 3 - Canon Knowledge

Goal:

- Promote validated source-derived knowledge into the correct durable knowledge
  surface with source support, boundaries, and review evidence.

This stage answers:

- "Can this become part of the reusable Soulforge knowledge base?"
- "Is the source-derived statement accurate enough to reuse later?"
- "Which surface owns the promoted knowledge: private wiki, graph, registry,
  workflow, or public-safe docs?"

Main workflow:

1. Pick the promotion target: private wiki, graph relation review, public-safe
   architecture note, workflow, registry entry, or another owner surface.
2. Confirm the source family and promotion policy.
3. Confirm source support for each claim.
4. Check whether table, picture, OCR, page mapping, or encoding risks affect
   the target claim.
5. Rewrite source-derived content into public-safe or private-safe abstraction
   appropriate to the target surface.
6. Apply the six public canon guards when the target is public canon.
7. Run the required review gate.
8. Write the target knowledge artifact.
9. Write the promotion/review packet.
10. Update README, schema, changelog, or graph preview when the target owner
    requires it.
11. Produce a Stage 3 closeout summary.

Required outputs:

- promotion target ref;
- source support refs;
- claim list and claim ceiling;
- quality review evidence;
- public/private boundary evidence;
- review packet;
- promoted knowledge artifact or explicit blocked record.

Completion criteria:

- Every promoted claim has source support or is explicitly marked as an
  unresolved candidate.
- Manual-review risks are either resolved or carried as visible limits.
- Private/raw/source payloads are excluded from public canon.
- The target owner surface is explicit.
- The required schema or README contract is updated.
- Changelog is updated when applicable.
- The review packet records whether canon promotion was allowed.

Allowed claim ceiling:

- `canon_candidate` when ready for owner/review but not registered;
- `canon_entry` only after the applicable owner surface, source-support gate,
  public/private boundary, and review route pass.

Not allowed in Stage 3:

- using LLM, NotebookLM, route matching, or usage count alone as authority;
- promoting extracted text as source truth without quality support;
- promoting private source bodies into public canon;
- claiming owner approval unless an owner decision or delegated policy exists.

## Whole-Document Completion Meaning

For a whole document, completion must be reported separately by stage.

Example:

```text
Stage 1 searchable RAG: complete for 291/291 pages
Stage 2 work-ready RAG: complete for 5 bounded topics, not whole document
Stage 3 canon knowledge: candidate only, not complete
```

Do not summarize this as "the document RAG is complete" unless the requested
meaning of "RAG" is explicitly Stage 1 only.

## DAPA Pilot Interpretation

The DAPA guidebook pilot should be interpreted as follows:

- Stage 1: mostly complete for searchable RAG, but final whole-document closeout
  still needs a dedicated page/risk inventory.
- Stage 2: completed only for a small set of bounded sample topics.
- Stage 3: not complete; source-derived knowledge remains candidate/manual
  review until whole-document quality and promotion gates pass.

The sample routes are not a substitute for whole-document canonization.

## Progress Reporting Rule

Every RAG status report must state:

- target source or source family;
- stage number and stage name;
- scope: whole document, selected pages, selected topics, or sample only;
- page/chunk/table/picture counts when known;
- support state: searchable, work-ready, candidate, canon, or blocked;
- next blocker or next action.

Preferred short form:

```text
Source: <source id>
Stage: 1 검색 가능 RAG / 2 업무용 RAG / 3 정본 지식화
Scope: whole document | selected topics | selected pages
Status: complete | partial | blocked
Evidence: <refs>
Next: <one concrete action>
```
