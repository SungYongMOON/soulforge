---
name: soulforge-knowledge-ingest-cross-pc
description: "Use when Codex should run a cross-PC or side-chat Soulforge knowledge ingest session that must be recoverable later: pull/sync Soulforge, invoke the Knowledge Ingest Cell, capture metadata-only candidate/source/wiki/RAG/canon receipts, generate a missing-audit table, validate boundaries, and commit/push `_workmeta`. Also use for Korean requests such as 다른 PC 지식화, 사이드에서 지식 인입, 지식 영수증, 누락 감사표, 이 PC에서 나중에 회수, or knowledge ingest side."
---

# Soulforge Knowledge Ingest Cross-PC

Use this skill when a knowledge ingest session happens on another PC, another
Codex chat, or a declared side thread and must remain recoverable later.

This is a wrapper. It does not replace `soulforge-knowledge-ingest-cell-launcher`;
it makes cross-PC sync and `_workmeta` receipt publishing mandatory around it.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `references/mapping.md` for the cross-PC contract and output shape.
3. Start with repo inventory for public `.`, `_workmeta`, and `private-state`.
4. Fetch/pull only safe fast-forward updates. Do not pull through dirty tracked
   changes, divergence, detached HEAD, conflicts, or missing remotes.
5. After public updates, run `npm.cmd run skills:sync -- --all`, or at minimum
   sync `knowledge_ingest_cross_pc` and `knowledge_ingest_cell_launcher`.
6. Read `soulforge-knowledge-ingest-cell-launcher` if available, then read:
   - `.party/knowledge_ingest_cell/party.yaml`
   - `.party/knowledge_ingest_cell/allowed_workflows.yaml`
   - `.workflow/knowledge_ingest_pipeline_v0/workflow.yaml`
   - `.workflow/knowledge_ingest_pipeline_v0/step_graph.yaml`
   - `.workflow/knowledge_ingest_pipeline_v0/profile_policy.yaml`
7. Reconstruct the current user request or uploaded-file summary as a bounded
   knowledge ingest request. Keep raw source bodies, transcripts, and secrets
   out of public files and `_workmeta` receipts.
8. Run the Knowledge Ingest Cell path. Use owner decision gates before any
   Drive/NotebookLM upload, source-text extraction, RAG index build, public
   canon promotion, replacement, migration, or controlled source handling.
9. Before closeout, append or update a metadata-only receipt with
   `guild_hall/knowledge_access` `ingest-receipt-*` commands. Record layer
   status for `candidate`, `source`, `wiki`, `rag`, and `canon`.
10. Generate and validate a missing-audit view under
    `_workmeta/**/reports/knowledge_ingest_missing_audit/**`.
11. Run relevant validators, usually:
    - `npm.cmd run validate:knowledge-ingest-receipt`
    - `npm.cmd run validate:knowledge-access`
    - `npm.cmd run validate:workmeta-payload`
    - `git -C _workmeta diff --check`
12. Commit and push only intentional metadata evidence from `_workmeta`. If
    public repo changes were made, use the normal GitHub up workflow and keep
    public and private Git roots separate.
13. Report receipt refs, missing-audit refs, pushed commit refs, validators, and
    blockers.

## Boundary Rules

- Do not store raw conversation transcripts, raw source text, mail bodies,
  attachments, NotebookLM answers/questions, local absolute paths, credentials,
  cookies, tokens, or secret values in receipts, public docs, or skill canon.
- Do not infer RAG, Wiki, source, or canon completion from source files alone.
  Use receipt layer status and explicit refs.
- Do not claim source truth, owner approval, upload, NotebookLM placement, index
  build, answer authority, or canon promotion from this wrapper.
- Do not commit unrelated dirty changes. If `_workmeta` is dirty with unrelated
  evidence, stage only the current run's receipt, missing-audit, review, and
  handoff refs.

## Mapping

Read `references/mapping.md` when you need exact repo surfaces, command
sequence, receipt paths, output shape, or validation checklist.
