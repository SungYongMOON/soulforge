---
name: soulforge-workflow-check
description: Use when a Soulforge task needs a dedicated workflow-check wrapper to review or close workflow, party, router, or registration changes, especially after workflow authoring or when you must verify validator results, boundary posture, pilot-executed status, registration state, or default-route safety.
---

# Soulforge Workflow Check

Use this as the global workflow review/closeout wrapper for Soulforge work. It is the runtime-facing checker that pairs naturally with `$soulforge-workflow-generator` for creation/evolution and `$soulforge-post-development-review-gate` for final review.

Read [references/mapping.md](references/mapping.md) only when you need canon linkage, output shape, or owner-boundary details.

## When To Use

- Workflow or party edits under `.workflow/**` or `.party/**`
- Route/default-switch questions involving `.workflow/index.yaml` or party routing docs
- Requests to verify whether a workflow is `draft`, `pilot-ready`, `pilot-executed`, `registered`, or `blocked`
- Post-smoke review where validator results, public/private boundary, or claim ceiling must be named explicitly
- Checks that Drive, NotebookLM, Obsidian, `_workmeta`, or source packets are not being mistaken for canon authority

## Workflow

1. Identify the target workflow, party, router, or registration surface and the strongest outcome being discussed.

2. Read the actual contract files first.
- Start with `workflow.yaml`.
- Then inspect only the touched surfaces such as `step_graph.yaml`, `handoff_rules.yaml`, `party_compatibility.yaml`, `role_slots.yaml`, routing notes, or templates.
- For registration/default-route questions, inspect `.workflow/index.yaml` and the relevant `.party/**` files.

3. If the workflow was created or materially evolved, check whether `$soulforge-workflow-generator` was actually used.
- If yes, use its evidence/run packet as part of the review surface.
- If no, do not pretend that workflow-generator compliance exists. Record the gap and keep the claim ceiling conservative.

4. Run deterministic validators before narrative judgment.
- Prefer `npm.cmd run validate:path-policy` and `npm.cmd run validate:canon` when repo-tracked files changed.
- Use `npm.cmd run validate`, `npm.cmd run done:check`, or narrower validators only when they fit the touched surface.
- If an env override such as `SOULFORGE_ALLOW_PUBLIC_CONTRACT_EDIT=1` is required, record why.

5. Apply `$soulforge-post-development-review-gate` logic to close the work.
- Choose the review level that matches the risk.
- Check public/private boundary, source/support posture, registration/default-route posture, and whether evidence is strong enough for the claimed state.
- Invoke the installed skill when available. If it is unavailable, mirror its checklist manually and state that fallback explicitly.
- Run the end-of-task knowledge trigger check instead of silently skipping it.

6. Report exact state labels rather than vague success words.
- Use `draft`, `pilot-ready`, `pilot-executed`, `canon-ready`, `registered`, or `blocked`.
- Separate `smoke executed` from `registered`.
- Separate `storage/advisory surface present` from `authority granted`.
- Name `default-route-safe` explicitly as `yes`, `no`, or `blocked`.

## Evidence Rules

- `pilot-executed` requires an execution record that the active workflow policy explicitly treats as sufficient for `pilot-executed`, relevant validator output for the touched surface, and no unresolved boundary blocker that would invalidate the claimed route.
- `registered` requires the real registration surface to be updated, not just a candidate package or smoke packet.
- `default-route-safe: yes` requires both evidence and explicit user or owner intent for the switch. If either is missing, return `no` or `blocked`.

## Boundary Rules

- This skill is a checker and closeout wrapper, not workflow canon authority by itself.
- Do not register a workflow or switch a default party route unless the user explicitly asks for that decision.
- Do not treat Drive, NotebookLM, Obsidian, graph packets, or `_workmeta` evidence as canon authority unless a separate owner-approved route says so.
- If fresh subagent execution, separate verifier evidence, or workflow-generator provenance is missing, say so plainly and lower the claim ceiling.
- Keep runtime-specific values in the local runtime owner surface. Do not materialize them into tracked canon files just to make the review look complete.

## Output Shape

- What was checked
- Which validators ran and what needed an override
- Registration/default-route result
- Strongest supported workflow status label
- `default-route-safe: yes|no|blocked`
- Remaining blockers or required next action
