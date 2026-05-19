# Frontline Assault

Canonical workflow for coordinating the frontline assault, keeping curated lessons distinct from mission runtime truth.

## Purpose

- This workflow package is registered under `.workflow/` as reusable orchestration canon.
- Raw runtime truth stays outside workflow canon.

## Current Package Surfaces

- `workflow.yaml`
- `role_slots.yaml`
- `step_graph.yaml`
- `handoff_rules.yaml`
- `monster_rules.yaml`
- `party_compatibility.yaml`
- `profile_policy.yaml`
- `calibrations/cal_20260519_quality_equiv_001/`

## Boundary

- Public workflow canon stores routing rules, packet expectations, and calibration policy only.
- Private project payloads, runtime paths, and raw execution truth do not belong here.
