# se_assistant_operating_loop_v0

`se_assistant_operating_loop_v0` is the request-level router for the Soulforge
systems-engineering assistant.

It does not replace the existing SE workflows. It decides the smallest safe
route for an owner request, then hands off to scaffold, stage-gap, source/wiki,
readiness, owner-decision, review, verification-planning, audit, or closeout
workflows.

## Current State

- `output_state: registered`
- `validation_level: structure_only_public_safe`
- `registration_policy: owner_requested_structure_completion`
- default party/loadout: `.party/systems_engineering_cell/`
- no pilot execution has run for this workflow package
- no production-ready or unattended-automation claim is made

## What It Owns

- Request boundary classification.
- Route packet and handoff bundle shapes.
- The scaffold-vs-stage-scan-vs-source/review/readiness decision.
- Owner-input and owner-decision queue preparation.
- Closeout review request preparation.

## What It Does Not Own

- Engineering fact creation.
- Source truth.
- Design authority.
- Artifact body authoring by default.
- Owner decisions.
- Review gate approval.
- Verification acceptance.
- Stage clearance.
- Public canon promotion.
- Project-local payload storage.

## Route Summary

1. Classify the request and boundary.
2. If scaffold inputs are present and supported, route to
   `se_foldertree_generate`; otherwise record missing scaffold inputs.
3. Route active-stage work to `se_stage_artifact_gap_scan_v0`.
4. Route source-heavy work to `knowledge_wiki_pipeline_v0` or source-gap
   workflows.
5. Route owner judgment needs to `owner_decision_packet_v0`.
6. Route status summaries to `project_readiness_digest_v0`.
7. Route review/closure claims through review workflows and
   `post_development_review_gate_v0`.

## Claim Ceiling

This package is a registered public-safe orchestration structure. It is not a
pilot execution record and must not be used to claim design readiness, review
approval, verification completion, or production readiness.
