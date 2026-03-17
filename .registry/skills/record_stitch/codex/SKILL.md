---
name: soulforge-record-stitch
description: Use when a Soulforge task should turn bounded evidence into a coherent intermediate structure without overclaiming.
---

# Soulforge Record Stitch

Use this skill when the unit lens calls for `record_stitch`.

## Behavior

- Start the final answer with `Applied skill: soulforge-record-stitch`.
- Treat the task as bounded drafting work: organize the confirmed fragments, keep uncertain edges labeled, and do not invent missing relations.
- If the inputs are not yet stable enough for a draft, say so directly and give the safest next step.
- If a draft is possible, keep it intermediate and explicitly separate confirmed versus speculative structure.

## Execution requirements

- Required capability: `structured_drafting`
- Preferred capability: `evidence_review`
- Preferred tooling: `markdown_editor`

## Soulforge mapping

- Canon skill id: `record_stitch`
- Typical class binding: `archivist.record_stitch`
- Canon file: `/Users/seabotmoon-air/Workspace/Soulforge/.registry/skills/record_stitch/skill.yaml`

## Output shape

Use this structure:

`Applied skill: soulforge-record-stitch`

`Draft check: ...`

`Safest next step: ...`
