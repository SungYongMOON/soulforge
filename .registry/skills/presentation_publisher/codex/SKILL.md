---
name: soulforge-presentation-publisher
description: "Use when Codex should publish workflow-approved presentation content through Soulforge's presentation artifact workflow as an editable, template-bound PPTX with render-QA and metadata-only receipts."
---

# Soulforge Presentation Publisher

Use this skill only as a thin launcher for
`.workflow/presentation_artifact_render_v0`.

The workflow owns input and receipt schemas, template binding, rendering,
render QA, and stop conditions. Do not re-create those procedures here.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Resolve `$soulforge-presentation-publisher` to
   `presentation_artifact_render_v0` and verify it is registered in
   `.workflow/index.yaml`. Stop if it is missing or unregistered.
3. Read the workflow's `workflow.yaml`, plus `step_graph.yaml` and
   `profile_policy.yaml` when present. Load workflow templates, handoff rules,
   or calibration evidence only when the current run requires them. If no
   profile policy exists, record that state and do not invent one.
4. Validate the request against the workflow-owned input contract. Require
   approved-content binding and the approved template reference, family,
   revision, and SHA-256 identity. Do not infer missing approval or
   template values.
5. Resolve current runtime bindings. The installed Presentations skill may be
   used as the editable-PPTX and render-QA backend only when permitted by the
   workflow and runtime binding.
6. Execute the workflow without changing, condensing, extending, or judging the
   approved content. Preserve semantic field roles such as `do_not_claim`,
   warnings, exclusions, negation, and verdicts as visibly unambiguous output;
   do not treat a value-only match as fidelity. If semantic transformation is
   required, stop and return to the authoring workflow.
7. Write presentation payloads only under the workflow-allowed `_workspaces`
   or owner-approved shared-worksite destination. Keep `_workmeta` limited to
   pointers, hashes, statuses, and workflow-owned receipts.
8. Return the workflow-owned artifact, template-binding, render-QA, and boundary
   receipts. Do not claim a stronger run state than those receipts support.

## Boundary Rules

- Do not author, summarize, rewrite, embellish, or fact-check presentation content.
- Do not choose, design, modify, or approve a template outside the workflow.
- Do not execute with unapproved content or an unresolved template reference,
  family, revision, or SHA-256.
- Do not replace an editable PPTX requirement with screenshots, flattened
  images, or a PDF-only deliverable.
- Do not store PPTX, rendered slide images, source content, or template payloads
  in `_workmeta`.
- Do not copy workflow steps, template rules, profile values, project payloads,
  private evidence, runtime absolute paths, or secrets into this skill package.
- Do not claim registration, default-route safety, unattended authority, or
  production readiness unless separate workflow and review evidence support it.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) for runtime linkage,
semantic input bindings, receipt expectations, storage boundaries, and the
validation checklist.
