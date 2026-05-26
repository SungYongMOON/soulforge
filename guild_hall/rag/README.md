# guild_hall/rag

## Purpose

`rag/` owns the first metadata-only RAG MVP for Soulforge.

It builds a derived `rag_manifest_v0` from safe graph/canon metadata, validates
the manifest boundary, and can generate a small metadata-backed answer with
citations to graph nodes and source handles.

The default manifest/index path is still metadata-only. A separate
`source-text-index` lane can read owner-approved starter sources under
`_workspaces/knowledge` and writes its payload artifacts back under that private
workspace alias.

## Commands

```bash
npm run guild-hall:rag -- manifest --write --export-id knowledge_graph_view_v0
npm run guild-hall:rag -- validate --manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json
npm run guild-hall:rag -- source-slice-cards --write --manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json
npm run guild-hall:rag -- validate-source-slice-cards --source-slice-ref _workspaces/system/rag/source_slice_cards/source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_cards.json
npm run guild-hall:rag -- source-slice-triage-register --write --source-slice-ref _workspaces/system/rag/source_slice_cards/source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_cards.json
npm run guild-hall:rag -- validate-source-slice-triage-register --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json
npm run guild-hall:rag -- source-slice-review-queue --write --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json
npm run guild-hall:rag -- validate-source-slice-review-queue --review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/source_slice_review_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_review_queue.json
npm run guild-hall:rag -- source-slice-decision-packet --write --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json --review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/source_slice_review_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_review_queue.json
npm run guild-hall:rag -- validate-source-slice-decision-packet --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_decision_packet.json
npm run guild-hall:rag -- source-slice-owner-decision-record --write --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_decision_packet.json
npm run guild-hall:rag -- validate-source-slice-owner-decision-record --owner-decision-record-ref _workmeta/system/reports/rag/source_slice_owner_decisions/source_slice_owner_decision_source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_owner_decision_record.json
npm run guild-hall:rag -- source-text-metadata-profile --write --source-slice-ref _workspaces/system/rag/source_slice_cards/source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_cards.json --extraction-log-ref _workmeta/<project_code>/runs/<run_id>/extraction_status.csv --profile-id source_text_metadata_profile_v0
npm run guild-hall:rag -- validate-source-text-metadata-profile --profile-ref _workmeta/system/reports/rag/source_text_metadata_profiles/source_text_metadata_profile_v0/source_text_metadata_profile.json
npm run guild-hall:rag -- source-text-extraction-packet --write --profile-ref _workmeta/system/reports/rag/source_text_metadata_profiles/source_text_metadata_profile_v0/source_text_metadata_profile.json --packet-id source_text_extraction_packet_v0
npm run guild-hall:rag -- validate-source-text-extraction-packet --packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/source_text_extraction_packet_v0/source_text_extraction_packet.json
npm run guild-hall:rag -- source-text-extraction-run-report --write --packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/source_text_extraction_packet_v0/source_text_extraction_packet.json
npm run guild-hall:rag -- validate-source-text-extraction-run-report --run-report-ref _workmeta/system/reports/rag/source_text_extraction_runs/source_text_extraction_packet_v0/source_text_extraction_run_report.json
npm run guild-hall:rag -- validate-knowledge-source-card --source-card-ref _workspaces/knowledge/source_cards/soulforge_common_knowledge_starter.source_card.json
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/soulforge_common_knowledge_starter.source_card.json --index-id soulforge_common_knowledge_starter_20260525
npm run guild-hall:rag -- validate-source-text-index --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/soulforge_common_knowledge_starter_20260525/source_text_index.json
npm run guild-hall:rag -- source-text-answer-run --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/soulforge_common_knowledge_starter_20260525/source_text_index.json --question "NotebookLM authority" --run-id soulforge_common_knowledge_answer_20260525 --text
npm run guild-hall:rag -- validate-source-text-answer-run --run-ref _workspaces/knowledge/rag/answer_runs/soulforge_common_knowledge_answer_20260525/source_text_answer_run.json
npm run guild-hall:rag -- answer-engine-run --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json --extraction-packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/source_text_extraction_packet_v0/source_text_extraction_packet.json --extraction-run-report-ref _workmeta/system/reports/rag/source_text_extraction_runs/source_text_extraction_packet_v0/source_text_extraction_run_report.json --question "knowledge wiki"
npm run guild-hall:rag -- validate-answer-engine-run --run-ref _workmeta/system/reports/rag/answer_engine_runs/answer_engine_run_<id>/answer_engine_run.json
npm run guild-hall:rag -- metadata-index --write --manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_decision_packet.json --owner-decision-record-ref _workmeta/system/reports/rag/source_slice_owner_decisions/source_slice_owner_decision_source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_owner_decision_record.json
npm run guild-hall:rag -- validate-metadata-index --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json
npm run guild-hall:rag -- retrieval-trace --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json --question "GraphRAG source support"
npm run guild-hall:rag -- retrieval-evaluation --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json
npm run guild-hall:knowledge-graph -- export --rag-manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json --source-slice-triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json --source-slice-review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/source_slice_review_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_review_queue.json --export-id knowledge_graph_rag_triage_lens_v0
npm run guild-hall:rag -- answer --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json --question "GraphRAG source support" --text
npm run validate:rag
```

## Raw Question Policy

- Raw questions are ephemeral command input only.
- Written JSON artifacts, `_workmeta` review artifacts, retrieval traces,
  evaluations, answer-engine runs, and source-text answer proof records must use
  labels, query fingerprints, and token fingerprints instead of storing raw
  questions.
- Public tracked files and `_workmeta/**` must not store NotebookLM answers, raw
  source text, chunks, excerpts, private payloads, account IDs, conversation
  IDs, secrets, or raw company material.
- Terminal-only `--text` output is operator feedback, not a persisted knowledge
  artifact or source authority.

## Company Intake Packet Validation

The public-safe template lives under
`docs/architecture/workspace/examples/company_knowledge_intake/`.

All machine-readable path refs in company intake packets must be relative to the
Soulforge project root, for example `_workspaces/knowledge/...`. Do not record
machine-local mount paths, home-directory paths, or `file://` URLs; different
computers may place the shared project at different absolute locations.

Validate a packet with:

```bash
npm run guild-hall:rag -- validate-company-knowledge-intake-packet --packet-ref docs/architecture/workspace/examples/company_knowledge_intake/company_knowledge_intake_packet.template.json
```

The validator accepts JSON packets only. It checks that the packet is
metadata-only, uses labels/fingerprints instead of raw questions or source
payloads, and keeps stronger permissions false until owner review.

## Boundary

- Reads metadata-only graph data or builds an in-memory graph from public canon.
- Does not load source text, private payloads, NotebookLM answers, vector stores,
  BM25 indexes, secrets, credentials, or runtime absolute paths.
- `answer` output is a navigation and source-ref answer, not source truth,
  owner approval, ontology acceptance, or canon promotion.
- Knowledge graph exports may consume an explicit manifest ref as a sanitized
  3D RAG lens overlay, but that overlay remains metadata-only and does not make
  the graph an answer engine.
- Knowledge graph exports may also consume explicit source-slice triage/register
  refs as redacted registration-state overlays. They show counts and states only,
  not source-handle arrays, source locator payloads, applied decisions, or
  stronger permissions.
- `source-slice-cards` creates metadata-only readiness cards for later
  owner-approved source preprocessing and indexing. These cards are not chunks,
  indexes, source truth, or answer evidence.
- `source-slice-triage-register` applies the existing wiki/source intake
  criteria to the cards. Public-safe metadata cards that pass are registered as
  `rag_metadata_knowledge_only`; only failed or private cards need owner review.
  The register treats owner-defined criteria as standing policy, but stronger
  permissions default to false.
- `source-slice-review-queue` creates metadata-only owner-review queue items
  from triage hold/blocked items. Queue items remain pending and cannot grant
  approval, load source text, or allow index building.
- `source-slice-decision-packet` creates the metadata-only owner-decision
  preparation packet before stronger RAG permissions. It can list registered
  metadata items that still default to `keep_metadata_only`, plus hold/blocked
  items from the review queue, but it cannot apply owner decisions or grant
  source-text retrieval, index build, NotebookLM packet membership, or public
  canon promotion.
- `source-slice-owner-decision-record` records the safe default
  `keep_metadata_only` state. It is not approval and grants no stronger
  permission.
- `source-text-metadata-profile` prepares a configurable metadata-field profile
  for a future body/source-text extractor. It can reuse source-slice metadata,
  scan public-safe repo contracts for field names, and import extraction-status
  CSV column/count metadata. It does not execute extraction, read source text,
  copy private extracted text, create chunks, or build indexes.
- `source-text-extraction-packet` turns a validated profile into a dry-run
  preflight execution packet. The packet lists target slices, metadata fields,
  extraction-log import tasks, adapter routes, and planned metadata outputs, but
  it still does not execute an extractor, read source text, write private
  payloads, build indexes, upload to NotebookLM, or grant owner approval.
- `source-text-extraction-run-report` consumes only a validated packet and
  writes a report-only dry run. It does not open source locators, import
  extractor libraries, read source files, write private payloads, build indexes,
  or treat the report as citation evidence.
- `source-text-index` is the first owner-approved source-text lane. It reads
  only owner-approved source cards and source text under
  `_workspaces/knowledge/**`, supports text/markdown starter sources, writes
  derived text and chunk indexes under `_workspaces/knowledge/rag/**` only when
  explicitly allowed by the command/source card, and is not public-repo safe.
- Official public source cards may allow public summary, ontology seed,
  NotebookLM packet membership, and registry entry creation when the source
  card records official source authority. This permission applies to public-safe
  derived metadata, not to public copies of full source text or chunk payloads.
- `source-text-answer-run` answers from the private workspace source-text index.
  Written runs persist query fingerprints rather than raw questions, cite
  chunk ids and `_workspaces/knowledge` source refs, and remain below public
  canon, NotebookLM authority, and owner approval.
- Source-text retrieval uses generic in-memory query normalization for Korean
  spacing, common Korean particles, punctuation-separated acronym variants, and
  dense technical term co-occurrence. It does not persist raw queries or add
  source-specific alias tables.
- `answer-engine-run` is the current practical answer-engine MVP. It answers
  from the metadata retrieval index and may attach the extraction packet/report
  as readiness context. Written runs persist a query fingerprint, not the raw
  query, and they remain metadata-only navigation signals.
- `metadata-index` creates the first lookup artifact, but only from manifest
  metadata. It persists token fingerprints, not raw terms, source locators,
  source handles, chunks, embeddings, BM25/vector payloads, or NotebookLM
  answers.
- `retrieval-trace` and `retrieval-evaluation` write under `_workmeta/**` and
  do not persist raw questions.
- `answer --metadata-index-ref` is the indexed answer path. It is still
  metadata-only navigation, not source-text RAG or source truth.
- Future sourcebound retrieval must add approved source-slice records and
  source-text index artifacts behind separate validators.
