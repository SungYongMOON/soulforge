# Source timeline annotation v1

## Purpose

Mail, Slack, voice, PC work, file change, and executor/run history keep their
source-native RAW custody. They do not copy all bodies into one database.
Instead, every lane can publish the same small timestamped annotation envelope
so Task Engine retrieval can join evidence without losing source identity.

```text
source-native RAW custody
        |
        +-- immutable source/revision/hash
        |
        `-- source_timeline_annotation.v1
              time + occurrence + label + actor + project state
```

## Storage boundary

```text
<HPP_DATA_ROOT>\
  ingress\
    mail\                         # EML/MSG and mail-native occurrence state
    voice\
      <capture-root>\sessions\<date>\<session>\
        audio\                    # original audio
        analysis\local_asr\       # transcript revisions
        analysis\semantic_labels\<run_id>\
          semantic_label_run.json
          source_timeline_annotations.jsonl
    slack\<binding>\              # Slack RAW event custody
      raw\sha256\...
      timeline\source_arrival\...
    structured_pc_work\           # bounded PC-work payload custody
    team_files\                   # file payload custody
    run_logs\                     # executor/run payload custody
  timeline\                       # TARGET cross-lane routing surface
    receipts\                     # minimal system completeness/dedupe index
    routing\
      unassigned\
      candidate\
      conflict\
      common\
      restricted\
```

The exact private root is a runtime binding and is not committed. The tree
above is a responsibility map, not a public locator packet.

Project folders receive approved projections and reports later. RAW evidence
does not move merely because a project candidate changes.

The system receipt ledger is not a human timeline and must not be used as one
cross-project LLM prompt. Source-native timelines remain separate, and an
explicit scope binding produces isolated project timelines:

```text
source-native timeline annotation
        |
        +-- exact deterministic binding --> one project timeline
        |
        `-- no exact binding ------------> candidate/unassigned/common/
                                           restricted/conflict routing
```

Slack channel ID, owner-approved Outlook folder/rule, project worksite, MCP
WorkSession/task, and an explicit Codex thread binding may provide deterministic
project evidence. A sender name, adjacent time, keyword, model answer, or thread
title alone is not an authoritative binding.

## Required semantics

- `source.lane` is one of `mail`, `slack`, `voice`,
  `structured_pc_work`, `team_files`, or `run_logs`.
- Every label is one occurrence. Ten mentions of one person produce ten
  occurrence records linked to the same canonical person ref when known.
- Every persisted `occurrence.occurred_at` is normalized to the company
  business timeline, `Asia/Seoul` (`+09:00`, KST). UTC or another explicit
  offset may be accepted at the adapter boundary, but it is never retained as
  the stored annotation time.
- Voice labels carry both absolute event time and relative start/end offsets.
  `word` precision may be claimed only when word alignment exists. Current
  transcript-derived labels honestly use `segment` precision.
- A project channel binding may mark Slack project scope `confirmed`.
  Voice and other ambiguous sources remain `unassigned` or `candidate`.
- Corrections are append-only revisions inside one lineage.
- IDs are recomputed from the persisted payload during validation. Correction
  chains are input-order independent and reject branches, cycles, orphan
  predecessors, multiple roots, forged IDs, and secret-like references.
- RAW bodies, audio, attachments, secrets, official task mutations, and
  official project assignment mutations are forbidden in the annotation.

## Current implementation

- `guild_hall/shared/source_timeline_annotation.mjs` owns validation,
  deterministic identity, dedupe, append-only supersession, and atomic JSONL.
- Adapter input time must include `Z` or an explicit numeric offset; an
  offsetless date-time is rejected so identities do not vary by PC timezone.
  The common constructor converts the same instant to `+09:00`, and persisted
  annotation validation rejects UTC `Z` or non-KST offsets.
- The HPP continuous queue writes arrival annotations for
  `structured_pc_work`, `team_files`, and `run_logs`.
- Slack v2 verifies the token workspace with `auth.test`, then writes one
  arrival annotation per accepted message revision.
- Voice semantic labeling writes per-occurrence speech, action, person,
  project, equipment, value, and date labels beside each session. Recording
  absolute time comes from the session source start, never ASR completion, and
  both the semantic run time window and occurrence labels are stored in KST.
  The run JSON and timeline JSONL publish together by generation-directory
  rename; the bounded sweep prioritizes transcripts not yet processed by the
  current engine and lets a later valid session advance past an older failed
  manifest.
- Mail keeps its exact received/sent `mail_occurrence` identity. A later P5
  semantic annotation may add request/decision labels, but it must not replace
  that native identity.
- `guild_hall/shared/project_timeline_projection.mjs` now provides the public
  feature-OFF pure projection contract. It accepts all six source lanes,
  validates append-only `scope_timeline_binding.v1` correction chains, emits
  minimal system receipts, isolates confirmed project timelines, and holds
  candidate/unassigned/common/restricted/conflict entries outside project
  timelines. It has no file writer, live source reader, DB, scheduler, network,
  ERP, MCP, or production authority.
- Candidate producers use provider-neutral kinds. `local_llm` and
  `remote_llm` (for example an owner-approved bounded external model runner)
  may propose labels or bindings; neither grants official project or task
  authority. Codex receives only a bounded candidate/project context pack for
  difficult context reasoning.

Audit timestamps such as collector receipt, append, completion, and lease times
remain explicitly named UTC fields. They are not business-event labels.
Previously derived UTC annotation generations must be regenerated from their
retained source evidence; RAW audio, mail, Slack payloads, and source files are
not rewritten.

## Handoff to durable project context

`source_timeline_annotation.v1` is retrieval evidence for the P5 context
assembler. It does not itself become short, medium, or long context.

```text
source annotation
  -> explicit scope binding
  -> isolated project timeline projection
  -> exact source-span metadata
  -> ContextEvent candidate
  -> reviewed ContextUnit
  -> ContextBranch
  -> ProjectContext summary revisions
```

- `evidence_span_refs` resolve to metadata-only source spans under the accepted
  project context owner; source text and bytes remain in source-native custody.
- One annotation signal may propose one ContextEvent. Repeated mentions remain
  separate occurrences and may later be related by a ContextUnit.
- A ContextUnit groups exact event refs; it must not merge source occurrence
  identities or infer an official task.
- Confirmed Slack channel binding may provide project scope. Voice, mail, and
  other context inference remains candidate-only until an accepted
  classification event or owner decision exists.
- Unclassified or conflicting inputs stay in cross-project HPP/guild-hall
  ingress state and review queues. They are not copied into an arbitrary
  project to make the tree look complete.
- Corrections preserve annotation, source-span, event, unit, and summary
  lineage through append-only predecessor/supersession refs.

The durable owner and ERP/MCP projection boundary are defined by
`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`.

## Authority ceiling

An annotation is retrieval evidence, not an ERP task or accepted project
classification. TaskDriver promotion, Wiki/RAG promotion, and ERP writes remain
separate fenced decisions.
