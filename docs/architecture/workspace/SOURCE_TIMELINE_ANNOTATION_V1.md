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
  timeline\                       # optional cross-lane query projection
```

The exact private root is a runtime binding and is not committed. The tree
above is a responsibility map, not a public locator packet.

Project folders receive approved projections and reports later. RAW evidence
does not move merely because a project candidate changes.

## Required semantics

- `source.lane` is one of `mail`, `slack`, `voice`,
  `structured_pc_work`, `team_files`, or `run_logs`.
- Every label is one occurrence. Ten mentions of one person produce ten
  occurrence records linked to the same canonical person ref when known.
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
- Absolute occurrence time must include `Z` or an explicit numeric offset; an
  offsetless date-time is rejected so identities do not vary by PC timezone.
- The HPP continuous queue writes arrival annotations for
  `structured_pc_work`, `team_files`, and `run_logs`.
- Slack v2 verifies the token workspace with `auth.test`, then writes one
  arrival annotation per accepted message revision.
- Voice semantic labeling writes per-occurrence speech, action, person,
  project, equipment, value, and date labels beside each session. Recording
  absolute time comes from the session source start, never ASR completion.
  The run JSON and timeline JSONL publish together by generation-directory
  rename; the bounded sweep prioritizes transcripts not yet processed by the
  current engine and lets a later valid session advance past an older failed
  manifest.
- Mail keeps its exact received/sent `mail_occurrence` identity. A later P5
  semantic annotation may add request/decision labels, but it must not replace
  that native identity.

## Authority ceiling

An annotation is retrieval evidence, not an ERP task or accepted project
classification. TaskDriver promotion, Wiki/RAG promotion, and ERP writes remain
separate fenced decisions.
