---
name: soulforge-pcb-revision-library-cell-launcher
description: "Use when Codex should route Cadence Allegro PCB revision and board-library extraction work through the existing PCB Revision Library Cell party, especially DB Doctor uprev, dlib library export, library organization, or pcb_revision_library_cell party work."
---

# Soulforge PCB Revision Library Cell Launcher

Use this skill to launch the existing `.party/pcb_revision_library_cell` route.

The skill is a thin bridge. It does not own the party, workflow chain, profile policy, PCB payloads, Cadence install paths, generated scripts, logs, owner mutation approvals, electrical correctness, manufacturing readiness, review acceptance, or local runtime bindings.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.party/pcb_revision_library_cell/party.yaml` and `.party/pcb_revision_library_cell/allowed_workflows.yaml`.
3. Confirm the selected workflow ids exist in `.workflow/index.yaml`.
4. Read `.workflow/allegro_pcb_dbdoctor_uprev_batch_v0/workflow.yaml` and `profile_policy.yaml` first.
5. Read `.workflow/allegro_pcb_dlib_export_organize_v0/workflow.yaml` and `profile_policy.yaml` before planning the dlib stage.
6. Reconstruct the user's request as a bounded PCB revision/library request: DB Doctor uprev only, dlib export only, or the full DB Doctor to dlib chain.
7. Treat workflow-owned profile policy as execution hints for model, reasoning effort, species, and class. Do not copy those values into a new runtime binding.
8. Insert `owner_decision_packet_v0` when full-archive mutation, extension policy, overwrite/delete policy, rerun authority, or stronger engineering approval needs scoped owner judgment.
9. Close bounded work through `post_development_review_gate_v0` when the task changes Soulforge files, changes workflow or party state, produces a promotion candidate, or reports a completed development result.

## Route Guide

- Use `allegro_pcb_dbdoctor_uprev_batch_v0` first when legacy board database conversion is in scope.
- Use `allegro_pcb_dlib_export_organize_v0` after the DB Doctor stage when the target library extraction should use converted/new board outputs.
- Use `allegro_pcb_dlib_export_organize_v0` alone only when the user explicitly provides current target boards and no revision conversion is required.
- Stop for owner approval before full-archive mutation, non-default extension sets, overwrites, deletes, reruns, or recursive archive traversal.
- Report missing Cadence binding, board scope, owner mutation policy, or runtime evidence as a blocker instead of inventing paths or tool results.

## Boundary Rules

- Do not create, rename, or default-route a party from this launcher alone.
- Do not treat successful file movement, DB Doctor logs, or dlib output organization as electrical correctness, manufacturing readiness, symbol geometry approval, padstack approval, or release acceptance.
- Do not copy raw PCB payloads, generated scripts, Cadence executable paths, logs, private packets, secrets, credentials, runtime absolute paths, or project-local run truth into public tracked files.
- Keep runtime board roots, tool paths, mutation approvals, logs, conversion receipts, export receipts, and review evidence in private or project-local owner surfaces.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the launcher mapping, route guide, allowed workflow set, profile resolve rule, output shape, or validation checklist.
