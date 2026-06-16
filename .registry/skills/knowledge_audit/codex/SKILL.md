---
name: soulforge-knowledge-audit
description: Use when Codex should run or summarize the Soulforge knowledge source audit, especially for knowledge audit, source originals audit, Korean requests for knowledge/source audit, or checking whether knowledge source files are workspace-backed or only external pointers.
---

# Soulforge Knowledge Audit

Use this skill to launch the registered `.workflow/knowledge_source_audit_v0`
route.

The skill is a thin bridge. It does not own the workflow, profile policy, source
truth, source files, owner decisions, or local runtime bindings.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Confirm `knowledge_source_audit_v0` exists in `.workflow/index.yaml`.
3. Read `.workflow/knowledge_source_audit_v0/workflow.yaml`,
   `step_graph.yaml`, and `profile_policy.yaml`.
4. Read additional workflow-owned files only when needed:
   `handoff_rules.yaml`, `role_slots.yaml`, `monster_rules.yaml`, and
   `party_compatibility.yaml`.
5. Treat workflow-owned profile policy as execution hints. Do not copy those
   values into a new runtime binding.
6. When running a new audit, use the existing RAG CLI:
   `npm.cmd run guild-hall:rag -- knowledge-source-storage-audit --write`.
7. Validate a generated audit before interpretation:
   `npm.cmd run guild-hall:rag -- validate-knowledge-source-storage-audit --audit-ref <repo-relative-audit-json-ref>`.
8. Summarize `summary.md`, `owner_decision_queue.yaml`,
   `pointer_only_sources.csv`, `orphan_workspace_files.csv`,
   `duplicate_recorded_hashes.csv`, and `missing_originals.csv` when present.
9. Report next actions as owner decisions or review candidates, not as completed
   storage mutation.
10. Close bounded development changes through `post_development_review_gate_v0`
    when the task changes Soulforge files or claims a completed development
    result.

## Boundary Rules

- Do not copy, move, delete, link, upload, or otherwise mutate source payload
  files from this launcher alone.
- Do not read raw source text, source payload bodies, secrets, credentials,
  cookies, tokens, or sessions.
- Do not treat external pointer-only sources, orphan workspace files, or
  duplicate hashes as automatic cleanup approval.
- Do not treat the audit report as source truth approval, source-of-record
  approval, public canon promotion, ontology acceptance, NotebookLM packet
  membership, Drive mutation approval, or default-route authority.
- Keep runtime absolute paths only in private `_workmeta` report artifacts.
  Public tracked workflow and skill files must use repo-relative refs or stable
  ids.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the target
workflow mapping, report output shape, profile resolve rule, or validation
checklist.
