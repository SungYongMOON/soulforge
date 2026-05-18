# se_knowledge_wiki_pipeline_v0

`se_knowledge_wiki_pipeline_v0` is the registered composite workflow entry for SE/LLM-wiki wikiization requests.

It wraps the currently registered four-stage lane:

1. owner-held archive inbox/candidate manifest
2. `official_source_packet_collect_v0`
3. `sourcebound_knowledge_packet_operating_loop_v0`
4. owner-held archive working/canon package manifest
5. Obsidian export decision stage
6. `knowledge_access_event_capture_v0`
7. `post_development_review_gate_v0`

Optional insertion points are declared for:

- `source_packet_sufficiency_review_v0`
- `owner_decision_packet_v0`

This package is now registered in `.workflow/index.yaml`.

## Purpose

The candidate exists to express one reusable request-level orchestration surface:

- bind the incoming SE/LLM-wiki request,
- record Google Drive or other owner-held archive inbox/candidate refs before local processing,
- choose fresh pipeline vs refresh vs blocked routes,
- call the registered source-intake / projection / metadata / closeout stages in order,
- record working-packet, reviewed-private, blocked, or canon-package archive refs after projection/review routing,
- decide whether an Obsidian view may be generated and block it unless the source is canon-backed,
- and document when stronger gates must be inserted.

## Current State

- `output_state: pilot-executed`
- `validation_level: pilot_executed_private_fixture`
- `registration_policy: owner_requested_registration`
- deterministic validator may pass because the package is public-safe and portable
- the workflow id has now been smoke-executed end-to-end at manifest-only synthetic pilot scope
- the workflow is registered in `.workflow/index.yaml`
- `knowledge_wiki_cell` may use it as the default party entry by owner direction

## Boundary

- This workflow owns orchestration only.
- Source truth remains with source packets or owner-held files.
- Google Drive or another owner-held archive is the storage and backup surface for candidate files, working bundles, and canon packages; it is not source truth, canon authority, or review approval.
- When archive policy sets `agent_upload_authority: codex_skill_auto_sync`, an approved Codex skill or Google Drive connector may upload/sync bounded archive files without per-file owner confirmation.
- Automatic upload/sync is still storage authority only. It cannot promote canon, approve source truth, or bypass secret/private boundaries.
- Generated wiki pages remain private derivative outputs in downstream stages.
- Obsidian output is a generated read-only local view over canon-backed knowledge only. `_workmeta` payloads, Drive candidate files, and NotebookLM answers are not valid vault body sources.
- ZIP containers are not retained as source truth.
- HWP page-stable claims must still route through stronger gates or stay blocked.
