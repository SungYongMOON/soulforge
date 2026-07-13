# Presentation Publisher Launcher Mapping

## Canon Linkage

- Canon skill id: `presentation_publisher`
- Codex installed skill: `soulforge-presentation-publisher`
- Source workflow id: `presentation_artifact_render_v0`
- Source workflow: `.workflow/presentation_artifact_render_v0/`
- Canon skill package: `.registry/skills/presentation_publisher/`
- Presentation payload owner: `_workspaces/<project_code>/...` or an
  owner-approved shared worksite
- Run-receipt owner: `_workmeta/<project_code>/runs/<run_id>/` or the exact
  workflow-approved metadata surface

## Runtime Resolution

When invoked:

1. Verify `presentation_artifact_render_v0` is present in
   `.workflow/index.yaml`.
2. Read `.workflow/presentation_artifact_render_v0/workflow.yaml`.
3. Read `step_graph.yaml` and `profile_policy.yaml` when present. Record a
   missing profile policy and do not synthesize one in the launcher.
4. Load workflow-owned request templates, receipt templates, handoff rules,
   role slots, or calibration notes only when required by the current run.
5. Validate and execute using the workflow's current schema and profile policy.
6. Return only the workflow-declared run state and receipts.

If the workflow is missing, unregistered, internally inconsistent, or lacks a
required schema, stop. The launcher must not synthesize a replacement workflow,
packet shape, profile, or renderer policy.

## Semantic Input Bindings

Use the exact field names and validation rules declared by the workflow. Before
execution, confirm that its input packet binds at least these semantics:

- approved content reference, approval state, and content identity or hash
- content provenance and synthetic-fixture declaration when applicable
- immutable workflow revision and package or Git commit ref
- project and artifact identity
- approved template family id
- template revision
- approved template reference
- approved template SHA-256
- editable PPTX as the requested deliverable
- allowed `_workspaces` or owner-approved shared-worksite destination
- idempotency or duplicate-run control when the workflow requires it

Missing values remain gaps. Do not derive approval from file presence, choose a
template by resemblance, or treat a latest file as the approved revision.

## Execution Backend Mapping

The Codex runtime may use the installed Presentations skill as a backend for:

- creating or editing an editable PPTX from the workflow-bound approved template reference
- rendering slides to images for visual inspection
- checking clipping, overflow, unreadable text, unintended layout drift, and
  other workflow-declared visual QA criteria

This is runtime execution mapping, not workflow authority. Do not copy the
Presentations skill procedure into this launcher. If the capability is
unavailable, use only a fallback explicitly allowed by the workflow; otherwise
stop and report the missing capability. Never substitute flattened slide images
or a PDF-only file for an editable-PPTX requirement.

## Content and Template Boundary

- The approved content packet owns wording, summary depth, facts, numbers,
  claims, and presentation structure.
- The workflow owns template binding, placeholder mapping, overflow policy,
  renderer choice, QA criteria, and retry/stop behavior.
- The launcher owns only workflow resolution, input validation, execution
  dispatch, and receipt return.
- Any needed rewrite, summarization, new claim, slide-plan change, or fact
  decision routes back to the authoring owner instead of being performed here.

## Receipt Expectations

Return the exact receipts declared by the workflow. At minimum, they must make
the following facts reviewable without copying payload content into `_workmeta`:

- artifact pointer, media type, size, and SHA-256
- workflow id and revision used
- approved-content reference and identity/hash
- template reference, family, revision, and SHA-256
- render-QA status and pointer to allowed QA evidence
- unresolved gaps, retry state, or review requirement
- public/private/raw/secret boundary result

The PPTX and rendered slide images remain payloads under `_workspaces` or the
approved shared worksite. `_workmeta` contains pointer metadata and receipts
only.

## Validation Checklist

- The target workflow is registered and its workflow files were read before execution.
- The current workflow-owned request schema was used without launcher-local substitutions.
- Approved content identity and approval state were present.
- Template reference, family, revision, and SHA-256 were present and consistent.
- The output is an editable PPTX at an allowed payload path.
- Presentations skill use, when applicable, remained a runtime backend rather than copied authority.
- Render QA ran as required by the workflow and produced a reviewable receipt.
- No presentation, slide image, source content, or template payload was written to `_workmeta`.
- No wording, summary depth, fact, verdict, or template decision was invented by the launcher.
- Warning, exclusion, `do_not_claim`, negation, and verdict field roles remain visibly unambiguous, and list markers use native formatting rather than injected text characters.
- No workflow registration, default-route, unattended, or production-ready claim exceeded current evidence.
