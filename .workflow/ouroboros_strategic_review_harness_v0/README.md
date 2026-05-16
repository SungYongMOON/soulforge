# Ouroboros Strategic Review Harness v0

`ouroboros_strategic_review_harness_v0` is a periodic or owner-triggered
strategic review workflow for keeping Soulforge aligned with its vision while
surfacing owner-intent gaps as explicit questions.

It is inspired by the specification-first Ouroboros loop:

```text
Interview -> Seed -> Execute -> Evaluate -> Evolve
```

Soulforge already has execution and post-development evaluation surfaces. This
workflow owns the strategic "evolve" pass:

- compare current work against vision, roadmap, active slice, and owner
  boundaries;
- find missing constraints, undefined terms, and assumed owner intent;
- route each gap as repo fact, research confirmation, owner decision, or
  intentional deferral before it reaches the owner;
- produce answerable owner questions and canon/mission/workflow candidates
  without filling gaps by inference.

## Lanes

### Vision Alignment Review

Checks whether recent work still supports `VISION_AND_GOALS.md`,
`DEVELOPMENT_ROADMAP_V0.md`, and the current active slice.

### Owner Intent Gap Probe

Finds places where the owner may have explained intent in conversation or
private evidence, but the reusable canon still lacks a constraint, decision,
mission seed, or workflow rule.

### Socratic Question Router

Classifies each gap before it becomes owner-facing:

- `repo_fact`: answer from canon, manifests, workmeta evidence, or local files;
- `research_confirmation`: gather external source context, then ask only for
  confirmation;
- `owner_decision`: ask the owner with evidence, a safe default, and concrete
  options;
- `defer`: record as an intentional later decision with a revisit trigger.

### Closure Restatement Gate

When answers exist, the workflow restates the decision or next-focus
recommendation in one sentence before routing it to canon, mission, workflow,
or private evidence. If no owner answer exists, the run closes as
`owner_decision_required`, not as accepted canon.

## Current Maturity

`validation_level: reviewed_public_safe_draft`

This package is registered as a reusable public-safe workflow shell. It is not
profile-optimized, does not install external Ouroboros tooling, and does not
claim ontology convergence.

## Always-on Usage

This workflow is intended for a weekly or owner-triggered Codex automation on
the active `always_on_node`, not for the deterministic launchd healer loop.

- `healer`: frequent repo and gateway health checks;
- `night_watch`: daily operational drift review;
- `ouroboros_strategic_review_harness_v0`: weekly vision alignment and
  owner-intent gap review.

The Mac mini runbook is
[`docs/architecture/guild_hall/ALWAYS_ON_STRATEGIC_REVIEW_V0.md`](../../docs/architecture/guild_hall/ALWAYS_ON_STRATEGIC_REVIEW_V0.md).
