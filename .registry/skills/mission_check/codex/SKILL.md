---
name: soulforge-mission-check
description: Use when a Soulforge task needs a mission readiness review while keeping mission plan ownership separate from local runtime truth.
---

# Soulforge Mission Check

Review mission readiness in owner order: tracked mission state first, then optional bridge details, then runtime boundary.

## Core rules

- Treat `skill.yaml` as the canon source of mission readiness behavior.
- Keep the review on `.mission/<mission_id>/readiness.yaml` and related tracked mission plan surfaces.
- If a missing value belongs to local bindings, installed mirrors, or raw run logs, stop at the boundary and name that owner instead of filling it into tracked files.

## Load on demand

- Read [`references/mapping.md`](references/mapping.md) for Soulforge mapping, readiness output shape, and boundary notes.
