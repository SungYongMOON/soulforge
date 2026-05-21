# pcb_revision_library_cell

`pcb_revision_library_cell` is the reusable party/loadout for Cadence Allegro
PCB revision and board-library extraction work.

It exists so the owner can call one party when the intended route is:

```text
DB Doctor legacy board uprev -> dlib library export and organization
```

## What It Owns

- The two-workflow chain order.
- The default entry workflow.
- Allowed workflow membership and display slots.
- Party-level routing hints for PCB revision/library requests.

## What It Does Not Own

- Cadence install or license management.
- Runtime board roots, tool paths, generated scripts, logs, or PCB payloads.
- Full-archive mutation authority.
- Electrical correctness.
- Manufacturing readiness.
- Symbol geometry correctness.
- Padstack engineering approval.
- Workflow-local optimized model, reasoning, species, class, or unit choices.

## Current Boundary

The party is a registered loadout, not unattended automation. It may route a
bounded request into DB Doctor uprev and then dlib export/organization, but
each workflow keeps its own runtime path policy, mutation guard, success
classifier, evidence requirements, and claim ceiling.

Owner approval remains required for full-archive mutation, non-default
extension policy, overwrite/delete policy, rerun policy, and any stronger
engineering or manufacturing claim.
