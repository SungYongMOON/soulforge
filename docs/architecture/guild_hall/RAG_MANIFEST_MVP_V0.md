# RAG Manifest MVP v0

## Purpose

This document fixes the first Soulforge RAG implementation boundary.

`guild_hall/rag` creates a metadata-only `rag_manifest_v0`, validates that the
manifest does not contain source payloads, and can produce a first answer from
manifest metadata with citations to graph nodes and source handles.

The default path is not full source-text RAG. It is the safe bridge between the
knowledge graph, future sourcebound retrieval, and later answer generation.
Approved private source-text commands are a separate lane and may read only
owner-approved `_workspaces/knowledge/**` source text.

Source-family promotion rules live in
`docs/architecture/guild_hall/RAG_SOURCE_FAMILY_PROMOTION_POLICY_V0.md`. That
policy separates source canon from derived knowledge canon and fixes the
default promotion ceiling for official public sources, private project sources,
owner notes, parser outputs, advisory LLM/NotebookLM output, protected payloads,
and public web/community sources.

RAG progress is reported through the three-stage operating model in
`docs/architecture/guild_hall/RAG_THREE_STAGE_OPERATING_MODEL_V0.md`:
searchable RAG, work-ready RAG, and canon knowledge. Do not collapse these
stages into one "RAG complete" claim.

## Owner Split

| Surface | Role |
| --- | --- |
| `guild_hall/rag/**` | Manifest generator, validator, and metadata-only answer command. |
| `guild_hall/knowledge_graph/**` | Metadata graph export, 3D/2D views, retrieval plan, and detection cards. |
| `_workspaces/system/rag/**` | Generated metadata-only RAG output under the path-identity controlled system view. PC-local experiments must use `_workspaces/_local/<node_id>/system/rag/**`. |
| `_workspaces/knowledge/**` | Owner-approved private source-text lane for source cards, approved source text, derived text, source-text indexes, and source-text answer proof runs. |
| `_workmeta/**` | Private evidence, source ledgers, review packets, and future sourcebound manifest fragments. |
| `docs/architecture/guild_hall/**` | Public operating contracts and boundaries. |
| `docs/architecture/workspace/examples/company_knowledge_intake/**` | Public-safe company knowledge intake packet template with placeholders only. |

Do not create a new top-level RAG root.

## Refresh Workflow

`rag_metadata_refresh_v0` is the workflow owner for rerunning the metadata-only
RAG chain after wiki/sourcebound metadata changes. Upstream routes such as
`knowledge_wiki_cell` may emit a handoff packet, but they do not build or refresh
RAG artifacts themselves.

The refresh workflow may regenerate or validate:

- `rag_manifest_v0`,
- `source_slice_card_set_v0`,
- `source_slice_triage_register_v0`,
- `source_slice_review_queue_v0`,
- `source_slice_decision_packet_v0`,
- `source_slice_owner_decision_record_v0`,
- `source_text_metadata_profile_v0`,
- `source_text_extraction_packet_v0`,
- `source_text_extraction_run_report_v0`,
- `rag_answer_engine_run_v0`,
- `rag_metadata_index_v0`,
- retrieval traces and smoke evaluations,
- optional metadata-only knowledge graph exports.

The handoff must keep stronger permissions false by default:

- no source text reading,
- no chunk, excerpt, BM25, vector, or embedding payload,
- no NotebookLM upload/query or Drive mutation,
- no owner approval, ontology acceptance, graph mutation authority, or public
  canon promotion,
- no default-route switch.

This means the wiki pipeline can say "RAG metadata should be refreshed now,"
while `rag_metadata_refresh_v0` owns the actual refresh order and validation.

## Commands

```bash
npm run guild-hall:rag -- manifest --write --manifest-id soulforge_metadata_rag_mvp_20260524
npm run guild-hall:rag -- validate --manifest-ref _workspaces/system/rag/manifests/soulforge_metadata_rag_mvp_20260524/rag_manifest.json
npm run guild-hall:rag -- source-slice-cards --write --manifest-ref _workspaces/system/rag/manifests/soulforge_metadata_rag_mvp_20260524/rag_manifest.json --slice-set-id soulforge_source_slices_20260524
npm run guild-hall:rag -- validate-source-slice-cards --source-slice-ref _workspaces/system/rag/source_slice_cards/soulforge_source_slices_20260524/source_slice_cards.json
npm run guild-hall:rag -- source-slice-triage-register --write --source-slice-ref _workspaces/system/rag/source_slice_cards/soulforge_source_slices_20260524/source_slice_cards.json --register-id soulforge_source_triage_register_20260524
npm run guild-hall:rag -- validate-source-slice-triage-register --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/soulforge_source_triage_register_20260524/source_slice_triage_register.json
npm run guild-hall:rag -- source-slice-review-queue --write --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/soulforge_source_triage_register_20260524/source_slice_triage_register.json --queue-id soulforge_source_review_queue_20260524
npm run guild-hall:rag -- validate-source-slice-review-queue --review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/soulforge_source_review_queue_20260524/source_slice_review_queue.json
npm run guild-hall:rag -- source-slice-decision-packet --write --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/soulforge_source_triage_register_20260524/source_slice_triage_register.json --review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/soulforge_source_review_queue_20260524/source_slice_review_queue.json --packet-id soulforge_source_decision_packet_20260524
npm run guild-hall:rag -- validate-source-slice-decision-packet --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/soulforge_source_decision_packet_20260524/source_slice_decision_packet.json
npm run guild-hall:rag -- source-slice-owner-decision-record --write --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/soulforge_source_decision_packet_20260524/source_slice_decision_packet.json --record-id soulforge_source_owner_decision_record_20260524
npm run guild-hall:rag -- validate-source-slice-owner-decision-record --owner-decision-record-ref _workmeta/system/reports/rag/source_slice_owner_decisions/soulforge_source_owner_decision_record_20260524/source_slice_owner_decision_record.json
npm run guild-hall:rag -- source-text-metadata-profile --write --source-slice-ref _workspaces/system/rag/source_slice_cards/soulforge_source_slices_20260524/source_slice_cards.json --extraction-log-ref _workmeta/<project_code>/runs/<run_id>/extraction_status.csv --profile-id soulforge_source_text_metadata_profile_20260524
npm run guild-hall:rag -- validate-source-text-metadata-profile --profile-ref _workmeta/system/reports/rag/source_text_metadata_profiles/soulforge_source_text_metadata_profile_20260524/source_text_metadata_profile.json
npm run guild-hall:rag -- source-text-extraction-packet --write --profile-ref _workmeta/system/reports/rag/source_text_metadata_profiles/soulforge_source_text_metadata_profile_20260524/source_text_metadata_profile.json --packet-id soulforge_source_text_extraction_packet_20260524
npm run guild-hall:rag -- validate-source-text-extraction-packet --packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/soulforge_source_text_extraction_packet_20260524/source_text_extraction_packet.json
npm run guild-hall:rag -- source-text-extraction-run-report --write --packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/soulforge_source_text_extraction_packet_20260524/source_text_extraction_packet.json --report-id soulforge_source_text_extraction_run_report_20260524
npm run guild-hall:rag -- validate-source-text-extraction-run-report --run-report-ref _workmeta/system/reports/rag/source_text_extraction_runs/soulforge_source_text_extraction_packet_20260524/source_text_extraction_run_report.json
npm run guild-hall:rag -- validate-knowledge-source-card --source-card-ref _workspaces/knowledge/source_cards/soulforge_common_knowledge_starter.source_card.json
npm run guild-hall:rag -- validate-source-sync-ready --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --source-text-ref _workspaces/knowledge/common/<source_id>/derived_text/<source_id>.md --stable-ms 2000
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/soulforge_common_knowledge_starter.source_card.json --index-id soulforge_common_knowledge_starter_20260525
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --stable-ms 2000 --index-id <source_id>_source_text_index
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --docling-json-ref _workspaces/knowledge/common/<source_id>/derived_text/<docling_json_export>.json --index-id <source_id>_docling_json_index
npm run guild-hall:rag -- validate-source-text-index --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/soulforge_common_knowledge_starter_20260525/source_text_index.json
npm run guild-hall:rag -- source-text-traceability-sidecar --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/<source_id>_source_text_index/source_text_index.json --docling-json-ref _workspaces/knowledge/common/<source_id>/derived_text/<docling_json_export>.json --traceability-id <source_id>_traceability
npm run guild-hall:rag -- validate-source-text-traceability-sidecar --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json
npm run guild-hall:rag -- source-text-answer-run --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/soulforge_common_knowledge_starter_20260525/source_text_index.json --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json --question "NotebookLM authority" --run-id soulforge_common_knowledge_answer_20260525
npm run guild-hall:rag -- validate-source-text-answer-run --run-ref _workspaces/knowledge/rag/answer_runs/soulforge_common_knowledge_answer_20260525/source_text_answer_run.json
npm run guild-hall:rag -- source-text-quality-review --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/<source_id>_docling_json_index/source_text_index.json --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json --answer-run-ref _workspaces/knowledge/rag/answer_runs/<answer_run_id>/source_text_answer_run.json --page 18-19 --page 39 --page 120-121 --review-id <source_id>_quality_review
npm run guild-hall:rag -- validate-source-text-quality-review --review-ref _workspaces/knowledge/rag/source_text_quality_reviews/<source_id>_quality_review/source_text_quality_review.json
npm run guild-hall:rag -- work-card --write --answer-run-ref _workspaces/knowledge/rag/answer_runs/<answer_run_id>/source_text_answer_run.json --quality-review-ref _workspaces/knowledge/rag/source_text_quality_reviews/<source_id>_quality_review/source_text_quality_review.json --query-label "<public-safe query label>" --work-card-id <source_id>_work_card
npm run guild-hall:rag -- work-card --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/<source_id>_docling_json_index/source_text_index.json --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json --question "<transient raw question>" --query-label "<public-safe query label>" --page 18-19 --page 39 --page 120-121 --work-card-id <source_id>_single_command_work_card
npm run guild-hall:rag -- validate-work-card --work-card-ref _workspaces/knowledge/rag/source_text_work_cards/<source_id>_work_card/source_text_work_card.json
npm run guild-hall:rag -- metadata-index --write --manifest-ref _workspaces/system/rag/manifests/soulforge_metadata_rag_mvp_20260524/rag_manifest.json --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/soulforge_source_decision_packet_20260524/source_slice_decision_packet.json --owner-decision-record-ref _workmeta/system/reports/rag/source_slice_owner_decisions/soulforge_source_owner_decision_record_20260524/source_slice_owner_decision_record.json --index-id soulforge_metadata_index_20260524
npm run guild-hall:rag -- validate-metadata-index --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/soulforge_metadata_index_20260524/metadata_index.json
npm run guild-hall:rag -- answer-engine-run --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/soulforge_metadata_index_20260524/metadata_index.json --extraction-packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/soulforge_source_text_extraction_packet_20260524/source_text_extraction_packet.json --extraction-run-report-ref _workmeta/system/reports/rag/source_text_extraction_runs/soulforge_source_text_extraction_packet_20260524/source_text_extraction_run_report.json --question "GraphRAG RAG manifest source support" --run-id soulforge_answer_engine_run_20260524
npm run guild-hall:rag -- validate-answer-engine-run --run-ref _workmeta/system/reports/rag/answer_engine_runs/soulforge_answer_engine_run_20260524/answer_engine_run.json
npm run guild-hall:rag -- retrieval-trace --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/soulforge_metadata_index_20260524/metadata_index.json --question "GraphRAG RAG manifest source support" --trace-id soulforge_retrieval_trace_graphrag_20260524
npm run guild-hall:rag -- validate-retrieval-trace --retrieval-trace-ref _workmeta/system/reports/rag/retrieval_traces/soulforge_retrieval_trace_graphrag_20260524/retrieval_trace.json
npm run guild-hall:rag -- retrieval-evaluation --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/soulforge_metadata_index_20260524/metadata_index.json --evaluation-id soulforge_metadata_retrieval_eval_20260524
npm run guild-hall:rag -- validate-retrieval-evaluation --retrieval-evaluation-ref _workmeta/system/reports/rag/retrieval_evaluations/soulforge_metadata_retrieval_eval_20260524/retrieval_evaluation.json
npm run guild-hall:knowledge-graph -- export --rag-manifest-ref _workspaces/system/rag/manifests/soulforge_metadata_rag_mvp_20260524/rag_manifest.json --source-slice-triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/soulforge_source_triage_register_20260524/source_slice_triage_register.json --source-slice-review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/soulforge_source_review_queue_20260524/source_slice_review_queue.json --export-id soulforge_knowledge_graph_rag_triage_lens_20260524
npm run guild-hall:rag -- answer --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/soulforge_metadata_index_20260524/metadata_index.json --question "GraphRAG RAG manifest source support" --text
npm run validate:rag
```

## Company PC Parallel Knowledge Intake Handoff

Company PC knowledge intake can run in parallel only as a bounded handoff into
the RAG/source-text operating standard. The public-safe handoff shape is the
template under
`docs/architecture/workspace/examples/company_knowledge_intake/`.

The handoff may carry:

- public-safe intake labels;
- source-card refs or placeholder refs;
- hash/version fingerprints;
- source class, sensitivity, approval-state, and blocker labels;
- raw-question labels, question fingerprints, and token fingerprints.

It must not carry:

- raw company source text, chunks, excerpts, or copied document bodies;
- NotebookLM answers or raw NotebookLM conversation content;
- account IDs, conversation IDs, local host paths, secrets, or credentials;
- real source locator payloads in public tracked files or `_workmeta`.

If a later owner decision grants private source-text retrieval, only the
separate source-text lane may read approved `_workspaces/knowledge/**` source
text. The default metadata manifest, metadata index, trace/evaluation, and
answer paths remain metadata-only.

## Source Extraction Tooling Standard

Soulforge source-text RAG is parser-first, not LLM-first. Raw PDF, Office,
image, HWP/HWPX, archive, or mail payloads are not handed directly to an LLM as
the durable extraction authority.

The standard flow is:

1. keep the original source under `_workspaces/knowledge/**` or another
   owner-approved worksite;
2. run a local extraction worker that converts the source into rebuildable
   Markdown, text, and structured metadata under `_workspaces/knowledge/**`;
3. record only metadata in `_workmeta/**`: source refs, hashes, tool ids,
   tool versions, page/slide/sheet counts, warnings, blocker codes, and output
   refs;
4. write a source sync ready manifest after upload/export completion, listing
   the source card and derived text by Soulforge-root-relative path with size
   and SHA-256;
5. validate the ready manifest on the indexing PC so OneDrive/cloud sync delay
   is caught before source text is read;
6. point the source card at the derived Markdown/text using a Soulforge-root
   relative path;
7. run `source-text-index` only after the source card grants retrieval and
   index-build permission;
8. if a structured Docling JSON export exists, prefer
   `source-text-index --docling-json-ref ...` so chunking follows Docling
   element/page order and native page spans are attached at build time, then run
   `source-text-traceability-sidecar` as a no-source-text page audit sidecar.

Default company-PC tool order:

- Docling first for local PDF, Word, PowerPoint, Excel, image, Markdown, and
  JSON-oriented conversion where it can produce stable RAG-friendly output.
- Apache Tika as a broad fallback for text and metadata extraction across many
  file types.
- PyMuPDF or `pypdf` for PDF-specific page/text checks and fallback extraction.
- LibreOffice headless for Office conversion fallback before text indexing.
- Tesseract OCR with Korean/English language data only when a source is scanned
  or image-only.
- HWP must follow `HWP_NORMALIZATION_V0`: first export/save to HWPX, then parse
  the HWPX or its approved derived text. Direct HWP extraction is diagnostic
  only and is not citation authority.

Local runtime requirement:

- `public-only` clones do not need the source extraction runtime.
- `owner-with-state` and approved `tool_pc` nodes that perform source-text
  extraction must install the runtime described in
  `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`.
- The preferred local Python environment is
  `guild_hall/state/tools/source_extraction_venv` with Python 3.12 and Docling,
  Tika, PyMuPDF/`pypdf`, OCR, and Office/HWPX helper libraries installed.
- Java, LibreOffice, Tesseract OCR, Korean OCR data, and an owner-approved
  HWP-to-HWPX converter are PC-local dependencies. Public docs may name the
  required tool families and package ids, but actual executable paths and
  version evidence belong under
  `_workmeta/system/reports/procedure_capture/source_extraction_runtime/`.
- The portable readiness command is
  `npm.cmd run guild-hall:rag -- source-text-runtime-preflight`. It may resolve
  tools from the repo-local venv, current `PATH`, Windows user environment, and
  local-only tool environment variables, but its public JSON output must redact
  machine-local executable paths.
- No source-text index may treat a missing extraction runtime, missing Korean
  OCR data, or missing HWPX converter as silently acceptable. It must be a
  blocker or a recorded fallback route before indexing.

Unstructured-style partitioning and LlamaIndex/LangChain ingestion can remain
adapter candidates, but they are orchestration/partitioning routes, not a
replacement for Soulforge's source-card, hash, path, and `_workmeta`
boundaries. LLM, NotebookLM, LlamaParse, and cloud OCR/parser outputs are
owner-approved advisory/external routes only. They cannot grant source truth,
owner approval, ontology acceptance, or public-canon promotion.

## Source Sync Ready Manifest

`source_sync_ready_manifest_v0` is the small `ready.json`-style handoff file for
cloud-synced source intake. It exists because another PC may finish export
before OneDrive has uploaded or this PC has downloaded every file.

The manifest may contain only metadata:

- source id and source card ref;
- derived source text ref used by the source card;
- file roles, Soulforge-root-relative paths, byte sizes, SHA-256 hashes, and
  media labels;
- producer labels, stable-wait milliseconds, and boundary flags.

It must not contain raw document text, chunks, excerpts, NotebookLM answers,
account ids, secrets, absolute host paths, `file://` URLs, or owner approval.

`validate-source-sync-ready` reads the listed files from this PC, compares size
and SHA-256, and optionally waits with `--stable-ms` to check that size, mtime,
and hash stay unchanged. `source-text-index --ready-ref ...` performs the same
gate before indexing and returns `blocked_sync_not_ready` instead of reading
source text if the ready manifest fails.

Operational rule:

- for local starter/demo sources, a ready manifest is optional;
- for company-PC or cross-PC OneDrive intake, create and validate a ready
  manifest before indexing;
- `source_sync_ready_manifest_v0` is readiness evidence only, not source truth,
  owner approval, or canon promotion.

## Manifest Boundary

`rag_manifest_v0` may contain:

- graph node refs,
- graph edge refs,
- source handles derived from safe metadata refs,
- titles and summaries already present in public-safe graph metadata,
- claim ceilings,
- lifecycle status,
- lens profile ids,
- retrieval-unit metadata,
- validation blockers.

`indexes` must remain an empty array in `rag_manifest_v0`. Metadata lexical
lookup is written as a separate `rag_metadata_index_v0` artifact, not embedded
inside the manifest.

It must not contain:

- source text,
- chunk text,
- excerpts,
- embeddings,
- vector payloads,
- BM25 indexes,
- NotebookLM answers,
- private projection prose,
- raw mail,
- HWP/PDF/Word body text,
- secrets,
- auth/session state,
- runtime absolute paths.

Any path-like ref stored by this lane is written relative to the Soulforge
project root, such as `_workspaces/knowledge/...`. Machine-local absolute paths,
home-directory paths, mount paths, and `file://` URLs are invalid because each
computer can mount the shared project at a different location.

## Answer Boundary

`guild-hall:rag -- answer` is a manifest-backed metadata answer. It can say
which manifest entries match, show the current claim ceiling, and cite graph
node/source-handle refs.

The raw question is ephemeral command input. Written answer, trace, evaluation,
review, and run artifacts must store labels, query fingerprints, token counts,
and token fingerprints instead of the raw question. A terminal-only `--text`
response is operator feedback, not a stored artifact or source authority.

It does not prove source truth, owner approval, ontology acceptance, benchmark
quality, or canon promotion. If no manifest evidence matches, it returns
`blocked_insufficient_manifest_evidence`.

## Source-Text Starter Lane

`source_text_index_v0` is separate from `rag_manifest_v0` and
`rag_metadata_index_v0`. It can read only source cards and approved source text
under `_workspaces/knowledge/**` whose card explicitly grants source-text
retrieval, index build, and answer synthesis for that source.

Official public source cards may also grant downstream public-safe summary,
ontology seed, NotebookLM packet membership, and registry entry creation. This
is allowed when the source card records official source authority, for example
an owner-approved DAPA/Korea.kr source. That stronger permission does not make
the source-text index public-repo safe: full source text, extracted text, chunk
payloads, and answer-run payloads still stay under `_workspaces/knowledge/**`.
Use `RAG_SOURCE_FAMILY_PROMOTION_POLICY_V0.md` to decide whether a source family
may move only to source canon, current-scope work-card use, private wiki
candidate, or public canon candidate.

The first supported source payloads are text and markdown starter sources.
`source-text-index` remains downstream of parser-first extraction: it consumes
approved derived Markdown/text, not arbitrary raw office files. HWP remains a
preprocessing target and must be converted to HWPX before any future body
extraction route can read it.

When an approved Docling JSON export is available beside the approved
Markdown/text, `source-text-index --docling-json-ref ...` may build a private
index in Docling element/page order. This does not change the source-card gate:
the source card still points at approved derived Markdown/text, while the JSON
ref adds page-native chunk metadata for citation audit and later sidecar
comparison.

For cross-PC OneDrive intake, source cards should reference a
`source_sync_ready_manifest_v0` through `source_sync_ready_ref`, or the operator
must pass the same ready manifest explicitly with `--ready-ref`. The indexer may
read the derived text only after the ready manifest, source card, and file
hashes match on the local PC.

This lane may write private workspace payloads only when the command and source
card explicitly allow them:

- derived text under `_workspaces/knowledge/rag/derived_text/**`;
- chunk indexes under `_workspaces/knowledge/rag/indexes_local/source_text_indexes/**`;
- traceability sidecars under `_workspaces/knowledge/rag/traceability_sidecars/**`;
- source-text answer proof runs under `_workspaces/knowledge/rag/answer_runs/**`;
- no-source-text quality reviews under `_workspaces/knowledge/rag/source_text_quality_reviews/**`;
- source-text work cards under `_workspaces/knowledge/rag/source_text_work_cards/**`.

It must not write source text, chunks, excerpts, or source-text answer payloads
to public tracked files or `_workmeta`. `_workmeta` remains for ledgers, review
packets, hashes, and pointer metadata.

`source_text_answer_run_v0` is a private workspace proof run. It may quote or
carry retrieved source-text chunks inside `_workspaces/knowledge`, but it is not
NotebookLM answer authority, ontology acceptance by itself, or permission to
copy chunks into public tracked files. For official public sources, separate
public-safe summaries and ontology seeds may be registered from the source with
source refs.

`source_text_traceability_sidecar_v0` is the page/layout audit companion for a
private source-text index. It reads a structured Docling JSON export under
`_workspaces/knowledge/**` and writes no raw source text or chunk text of its
own. Its purpose is to attach `chunk_id -> page span`, layout labels, and
warning codes so a sourcebound answer review can check whether citations point
back to auditable PDF pages. For Docling JSON indexes, the sidecar should
confirm the native page spans rather than relying on post-hoc token overlap. A
sidecar can make citation review possible, but it does not approve OCR quality,
figure semantics, owner approval, or canon promotion.

`rag_source_text_quality_review_v0` is the registered optional page/citation quality gate between a
source-text answer run and reusable project work. It consumes refs to the
source-text index, traceability sidecar, optional answer run, and explicit pages,
then writes only page ids, chunk ids, citation ids, warning codes, status, and
blocker labels. It classifies each reviewed page or citation as
`source_supported`, `manual_review`, or `blocked`. Table/picture/OCR/page
warnings are operator attention signals, not owner approval or public canon
promotion.

`rag_work_card_router_v0` is the registered optional source-text-backed work-card route. It
consumes a validated answer run and quality review, persists labels and
fingerprints rather than raw questions, and carries evidence pages, citation
status, claim ceiling, manual-review state, and next actions. It is a private
workspace task packet and does not grant NotebookLM authority, owner approval,
ontology acceptance, default-route safety, or public canon promotion.
When the command is invoked with a transient `--question`, it may write the
intermediate source-text answer run and quality review first, but a stored
`--query-label` is required so the raw question is not persisted.

## Graph Projection

`guild_hall/knowledge_graph` may consume one or more explicit manifest refs
through `--rag-manifest-ref`, plus explicit source-slice triage/register refs
through `--source-slice-triage-register-ref` and
`--source-slice-review-queue-ref`.

The projection adds:

- `graph.rag_projection` with manifest refs, lens profiles, readiness counts,
  matched node counts, and boundary declarations;
- `node.rag` overlays for graph nodes referenced by retrieval units;
- `graph.source_slice_projection` with triage/register refs, redacted
  registration counts, owner-review counts, blocked counts, and stronger
  permission default-false counts;
- `node.source_slice` overlays for graph nodes referenced by source-slice
  `covered_graph_node_refs`;
- `graph_scope.rag_manifest_refs` and `included_lens_profile_ids`;
- 3D preview controls for all RAG-linked nodes, answer-ready nodes, and explicit
  lens profile views;
- 3D preview controls for metadata-registered, owner-review, blocked, and
  stronger-permission-needed source-slice states.

The projection does not create canon truth, graph-source truth, source-support
truth, or answer authority. It remains a visual inspection layer over the
manifest and source-slice registers. It does not expose source text, source
locator payloads, source-handle arrays, chunks, indexes, NotebookLM answers, or
applied owner decisions. Retrieval index or answer synthesis layers must be
added later with separate validators.

## Source Slice Cards

`source_slice_card_set_v0` is the next metadata layer after `rag_manifest_v0`.
It records whether a manifest source is ready to be considered for later
source-text preprocessing and indexing.

It may contain:

- source handles and safe metadata locators already present in the manifest;
- source sensitivity and owner-approval state;
- covered graph node refs and counts;
- claim ceilings and blocker codes;
- planned downstream state such as `chunking_status: not_started`,
  `bm25_index_status: not_started`, and `vector_index_status: not_started`;
- metadata fingerprints.

It must not contain:

- source text,
- chunk text,
- excerpts,
- embeddings,
- BM25 terms or postings,
- vector payloads,
- NotebookLM answers,
- raw mail,
- HWP/PDF/Word body text,
- secrets,
- auth/session state,
- runtime absolute paths.

System-level cards are generated under the path-identity controlled
`_workspaces/system/rag/source_slice_cards/**` view. PC-local experiments use
`_workspaces/_local/<node_id>/system/rag/source_slice_cards/**`.
Private/project-sensitive cards must be written under
`_workmeta/<project_code>/reports/rag/source_slice_cards/**` and require an
explicit project code. The actual source files remain in `_workspaces`,
Google Drive/NotebookLM owner-approved warehouses, or other owner-approved
worksites; cards store only metadata pointers, hashes, labels, status, and
blockers.

## Source Slice Triage Register

`source_slice_triage_register_v0` is generated from a validated
`source_slice_card_set_v0`. It imports the existing LLM wiki/source intake
criteria from
`docs/architecture/workspace/examples/llm_wiki_bookshelf/canonical_source_intake_checklist.md`
and applies them to RAG metadata cards before creating owner review backlog.

It can auto-register a card only as `rag_metadata_knowledge_only` when:

- the source slice and source handle are stable safe metadata ids;
- the source locator is safe and does not expose a runtime/local path;
- the source is public-safe metadata;
- the observed approval basis is existing public canon or explicit metadata;
- a hash or version-equivalent state is present;
- payload boundaries show no source text, chunks, embeddings, BM25/vector
  payloads, NotebookLM answers, secrets, account state, or runtime paths;
- the source class is allowed for metadata knowledge registration;
- the claim ceiling is explicit.

Auto-registration here means "usable as RAG metadata knowledge." It does not
mean source-text retrieval approval, NotebookLM packet membership, owner
approval, public canon promotion, source truth, ontology acceptance, graph
mutation, or answer-engine indexing.

This register treats the owner's source-intake criteria as a standing owner
policy for metadata registration:

```yaml
standing_owner_policy:
  owner_defined_criteria_are_policy: true
  auto_register_passed_metadata: true
  stronger_permissions_default_false: true
  grants:
    metadata_knowledge: true
    source_text_retrieval: false
    index_build: false
    notebooklm_packet: false
    public_canon: false
```

Items that fail the metadata criteria move to `owner_review_required` or
`blocked_unsafe_source_locator`. This keeps the review queue from growing with
items that already satisfy the metadata registration rules.

System-scope triage registers are written under
`_workmeta/system/reports/rag/source_slice_triage_register/**`. Project/private
registers must be written under
`_workmeta/<project_code>/reports/rag/source_slice_triage_register/**` and
require an explicit project code.

## Source Slice Review Queue

`source_slice_review_queue_v0` is normally generated from a validated
`source_slice_triage_register_v0`. It prepares owner review items only for
triage hold/blocked entries before any source text, chunks, BM25/vector indexes,
retrieval traces, or answer synthesis exist.

It may contain:

- source slice refs and source handles;
- safe metadata locators inherited from cards;
- sensitivity and observed owner-approval labels from cards;
- claim ceilings inherited from cards;
- covered graph-node refs and counts;
- blocker codes and metadata fingerprints;
- triage refs and triage routes when produced from a triage register;
- pending owner-review decisions with recommended decision labels.

It must not contain:

- source text,
- chunk text,
- excerpts,
- embeddings,
- BM25 terms or postings,
- vector payloads,
- NotebookLM answers,
- raw mail,
- HWP/PDF/Word body text,
- secrets,
- auth/session state,
- runtime absolute paths,
- applied owner approvals,
- source-text retrieval permission,
- index-build permission.

System-scope review queues are written under
`_workmeta/system/reports/rag/source_slice_review_queue/**` because they are
owner-review metadata. Project/private queues must be written under
`_workmeta/<project_code>/reports/rag/source_slice_review_queue/**` and require
an explicit project code.

The queue can only say "these source slices need owner decision." It does not
approve source use, prove source truth, accept ontology, mutate the graph,
promote canon, or create an answer engine.

The normal RAG intake order is now:

```text
source_slice_card_set_v0
  -> source_slice_triage_register_v0
  -> owner review queue only for hold/blocked items
  -> source_slice_decision_packet_v0 before stronger permissions
```

## Source Slice Decision Packet

`source_slice_decision_packet_v0` is the decision-preparation layer before any
stronger RAG permission is granted. It can consume a triage register and,
optionally, the filtered review queue. Registered metadata items become
`registered_metadata_stronger_permission_review` items; hold/blocked items come
from the review queue when provided.

It may contain:

- source slice refs and source handles;
- safe metadata locators;
- sensitivity, claim ceiling, graph-node coverage, and blocker codes;
- current metadata registration state;
- pending decision defaults such as `keep_metadata_only`,
  `hold_for_owner_review`, or `block_unsafe_source_locator`;
- downstream labels for later sourcebound source packets, index packets,
  NotebookLM packet-map candidates, or public-canon review.

It must not contain:

- source text,
- chunk text,
- excerpts,
- embeddings,
- BM25 terms or postings,
- vector payloads,
- NotebookLM answers,
- raw mail,
- HWP/PDF/Word body text,
- secrets,
- auth/session state,
- runtime absolute paths,
- applied owner decisions,
- source-text retrieval permission,
- index-build permission,
- NotebookLM packet membership permission,
- public canon promotion permission.

The packet is intentionally not owner approval. It only says "these are the
specific source slices where an owner decision would be required before the
next RAG layer." Source-text retrieval, index build, NotebookLM packet
membership, and public canon promotion remain false until a separate explicit
owner-decision workflow grants them.

System-scope decision packets are written under
`_workmeta/system/reports/rag/source_slice_decision_packets/**`. Project/private
packets must be written under
`_workmeta/<project_code>/reports/rag/source_slice_decision_packets/**` and
require an explicit project code.

## Source Slice Owner Decision Record

`source_slice_owner_decision_record_v0` is a safe default record generated from
a valid decision packet. It exists to make the default boundary explicit before
the metadata index is completed.

It records `keep_metadata_only` for current metadata use only. It is not owner
approval, and it cannot grant source-text retrieval, source-text index build,
NotebookLM packet membership, public-canon promotion, ontology acceptance, or
source truth.

System-scope records are written under
`_workmeta/system/reports/rag/source_slice_owner_decisions/**`. Project/private
records must be written under
`_workmeta/<project_code>/reports/rag/source_slice_owner_decisions/**` and
require an explicit project code.

## Source Text Metadata Profile

`source_text_metadata_profile_v0` is a planning-only bridge between existing
metadata RAG artifacts and a future owner-approved body/source-text extractor.
It can consume a source-slice card set, public-safe repo contracts, and
metadata-only extraction status logs such as `extraction_status.csv`.

It may contain:

- source-slice summary counts such as source kind, source class, sensitivity,
  claim ceiling, and index-readiness counts;
- extraction-status CSV column names and aggregate counts;
- metadata field candidates for provenance, document shape, governance state,
  and downstream graph/usage analytics;
- candidate adapter labels such as existing extraction-status importer,
  Unstructured partitioning, Docling conversion, or HWP-to-HWPX preprocessing.

It must not contain:

- raw source text,
- copied private extracted text,
- raw mail/body/html,
- chunks, excerpts, embeddings, BM25/vector payloads, or raw lexical terms,
- NotebookLM answers,
- live Drive or account IDs,
- secrets,
- runtime absolute paths,
- source-text retrieval permission,
- index-build permission.

System-scope profiles are written under
`_workmeta/system/reports/rag/source_text_metadata_profiles/**`. Project/private
profiles may be written under
`_workmeta/<project_code>/reports/rag/source_text_metadata_profiles/**`.

The profile is not an extractor execution and is not owner approval. It only
fixes which metadata fields a later sourcebound extractor should preserve,
compute, or block before source bodies are loaded.

## Source Text Extraction Packet

`source_text_extraction_packet_v0` is the dry-run preflight packet that turns a
validated `source_text_metadata_profile_v0` into a concrete future extractor
input. It is the place where target source-slices, metadata field obligations,
extraction-log import tasks, adapter routes, and planned metadata output refs
are fixed before any body text is opened.

It may contain:

- the source profile ref, profile id, and profile fingerprint;
- source-slice target refs and safe locator refs from validated metadata-only
  source-slice cards;
- required metadata field ids from the profile;
- aggregate extraction-log import tasks and adapter route labels;
- planned metadata report refs under `_workmeta/**`.

It must not contain:

- raw source text, copied body text, chunks, excerpts, embeddings, BM25/vector
  payloads, or NotebookLM answers;
- private payload output refs;
- source-text read permission;
- extractor execution authority;
- owner approval, index-build permission, NotebookLM packet membership, public
  canon promotion, ontology acceptance, or graph mutation authority;
- secrets, auth/session state, or runtime absolute paths.

System-scope packets are written under
`_workmeta/system/reports/rag/source_text_extraction_packets/**`. Project/private
packets may be written under
`_workmeta/<project_code>/reports/rag/source_text_extraction_packets/**`.

The packet is intentionally still below actual source-text extraction. A later
runner may consume it only as a validated preflight contract and must separately
obtain source-text retrieval scope and payload-output worksite approval.

## Source Text Extraction Run Report

`source_text_extraction_run_report_v0` is the report-only dry run after a
validated source-text extraction packet. It reads the packet and summarizes
target readiness, adapter routes, blocker codes, metadata-field counts, and the
allowed answer-engine handoff.

It may contain:

- extraction packet refs and profile refs;
- target refs and source-slice refs;
- adapter ids and planned action labels;
- blocker-code counts and target status counts;
- answer-engine handoff metadata for `metadata_index_answer` mode.

It must not contain:

- source locator refs;
- raw source text, body text, chunks, excerpts, embeddings, BM25/vector
  payloads, or NotebookLM answers;
- private payload refs or source-text extraction outputs;
- extractor execution, source file open, source-text read, index build,
  NotebookLM mutation, owner approval, or public canon promotion claims;
- secrets, auth/session state, or runtime absolute paths.

System-scope reports are written under
`_workmeta/system/reports/rag/source_text_extraction_runs/**`. Project/private
reports may be written under
`_workmeta/<project_code>/reports/rag/source_text_extraction_runs/**`.

The report can explain readiness in an answer-engine run, but it is not source
truth and must not be cited as content evidence.

The validator treats the report shape as closed for the known metadata-only
sections. Unknown top-level keys, unknown section keys, unsafe dynamic count-map
keys, and object values inside label arrays are blockers so source locator refs,
private payload refs, raw payload markers, or harmless-looking payload carriers
cannot be smuggled through a dry-run report.

## Answer Engine Run

`rag_answer_engine_run_v0` is the current practical answer engine MVP. It reads
a validated metadata retrieval index, optionally reads the source-text extraction
packet and run report as readiness overlays, and writes a metadata-only response
run.

It may contain:

- metadata index and manifest refs;
- extraction packet and dry-run report refs;
- query fingerprint, query token count, and query token fingerprints;
- retrieved metadata graph-node refs and match reasons;
- a response text generated from metadata only;
- readiness counts from the sourcebound preflight chain.

It must not contain:

- the raw query string when written to `_workmeta`;
- source text, chunks, excerpts, embeddings, BM25/vector payloads, source
  locator refs, or private payloads;
- NotebookLM answers;
- source-text answer claims, source truth, owner approval, ontology acceptance,
  graph mutation, index mutation, or public canon promotion.

System-scope answer runs are written under
`_workmeta/system/reports/rag/answer_engine_runs/**`. Project/private runs may
be written under `_workmeta/<project_code>/reports/rag/answer_engine_runs/**`.

If metadata retrieval finds no hit, the answer engine may still return a
`sourcebound_preflight_status` response describing where the chain is ready or
blocked. That status is a navigation signal, not a content answer.

## Metadata Retrieval Index

`rag_metadata_index_v0` is the first actual retrieval lookup layer. It reads a
validated manifest plus optional decision packet and owner-decision record, then
creates a metadata-only lexical index.

It may contain:

- retrieval-unit refs and graph-node refs;
- title, summary, owner surface, lifecycle, and claim-ceiling metadata already
  present in the manifest;
- token fingerprints and postings keyed by those fingerprints;
- metadata fingerprints and validation state.

It must not contain:

- source handles or source locators;
- raw source text, chunks, excerpts, or source payloads;
- raw query strings or raw lexical terms;
- embeddings, vector payloads, or source-text BM25 indexes;
- NotebookLM answers;
- secrets, auth/session state, runtime absolute paths, or private payloads.

Public-safe system indexes are written under the path-identity controlled
`_workspaces/system/rag/metadata_retrieval_indexes/**` view. PC-local
experiments use
`_workspaces/_local/<node_id>/system/rag/metadata_retrieval_indexes/**`. If the manifest includes
private/project-sensitive source metadata, the index must be written under
`_workmeta/<project_code>/reports/rag/metadata_retrieval_indexes/**` and require
an explicit project code.

## Retrieval Trace And Evaluation

`rag_retrieval_trace_v0` records what a metadata index retrieved for a question.
It stores only a question fingerprint, token fingerprints, retrieved metadata
units, citations, and boundary state. It does not persist the raw question.

`rag_retrieval_evaluation_v0` is a smoke evaluation, not a quality benchmark. It
uses metadata-title self-retrieval cases to prove that the index can retrieve
known items without persisting raw questions or source payloads.

Both artifacts are written under `_workmeta/**` because questions and retrieval
behavior can become private operating metadata.

## Indexed Answer Path

`guild-hall:rag -- answer --metadata-index-ref ...` answers from
`rag_metadata_index_v0`. This is the first answer path that uses a built lookup
artifact instead of scanning the manifest directly.

The answer remains metadata-only. It can cite graph-node refs and explain claim
ceilings, but it is still not source truth, owner approval, ontology acceptance,
NotebookLM synthesis, public canon promotion, or source-text RAG.

## Next Phases

1. Extend graph lens projection with stronger per-project/per-workflow views and
   operator review queues.
2. Add explicit owner-approved source-slice records for source-text access.
3. Add the parser-first local extraction worker that writes derived Markdown,
   text, and metadata under approved `_workspaces/knowledge/**` paths.
4. Add extraction workers that create source sync ready manifests as their final
   cross-PC handoff marker.
5. Add BM25/vector indexes for approved source slices only.
6. Add citation-quality evaluation beyond the current smoke retrieval check.
7. Add source-text answer synthesis only after validators and owner boundaries
   pass.
