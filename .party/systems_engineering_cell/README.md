# systems_engineering_cell

`systems_engineering_cell` is the reusable party/loadout for Soulforge
systems-engineering assistant requests.

It exists to keep the owner from re-explaining the full SE workflow family every
time a project needs scaffold, stage-gap scan, source intake, readiness digest,
owner decision capture, or review closeout support.

## What It Owns

- The default SE assistant entry workflow.
- The allowed active workflow spine for SE support.
- Chain-level routing hints and member-slot display.

## What It Does Not Own

- Design authority.
- Source truth.
- Review approval.
- Verification acceptance.
- Public/private promotion.
- Workflow-local optimized model, reasoning, species, class, or unit choices.
- Project-local run truth or raw project payloads.

## Current Boundary

The party is a registered loadout, not unattended automation. It may route a
bounded request into the SE assistant operating loop, but each downstream
workflow keeps its own claim ceiling and evidence requirements.

Draft or future workflow ids such as `se_cross_stage_mapping_governance_v0` and
`se_artifact_authoring_support_v0` are intentionally excluded until their
registration and pilot posture is resolved.
