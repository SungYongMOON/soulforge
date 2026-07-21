# Easy Explain Mapping

## Soulforge Mapping

- Canon skill id: `easy_explain`
- Typical operating lane: owner-facing explanation after long or complex work
- Canon linkage: `.registry/skills/easy_explain/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`
- Installed Codex invocation after sync: `$soulforge-easy-explain`

## Target Selection

1. Use the latest bounded task, result, design, or investigation in the current conversation unless the user names a different target.
2. Treat previous tool results and files as evidence, not as permission to rerun work or make new changes.
3. If more than one plausible target would materially change the answer, ask one short target question. Otherwise state the assumption and continue.

## Explanation Order

Use this order when applicable:

1. one-sentence conclusion
2. color-coded overview or the smallest useful visual
3. components and responsibilities
4. real operating flow or sequence
5. file, folder, data, and source locations
6. functions, views, tools, APIs, or interfaces
7. one practical example
8. supported actions, unsupported actions, risks, and approval boundaries
9. confirmed facts versus inference, proposal, and unknowns
10. current state and concrete next actions

Do not force every heading into a simple answer. Completeness means covering every applicable dimension, not producing a long fixed template.

## Visual Selection

| Relationship | Preferred visual |
| --- | --- |
| one short mapping or comparison | compact table |
| three or more dependent steps | Mermaid flow or timeline |
| hierarchy, ownership, or file structure | tree or layered diagram |
| several systems with repeated fields | mapping table plus flow |
| user needs to switch perspectives | rich interactive visualization |

Use a rich visualization only when it materially improves comprehension. If the environment cannot render it reliably, fall back to Mermaid and a compact table without losing content.

## Color Semantics

- blue: source or input
- green: confirmed or authoritative state
- orange: processing, automation, or transformation
- purple: human-facing view or collaboration surface
- red: risk, error, approval, or stop boundary
- gray: unknown, unsupported, or not yet implemented

Use theme-aware colors where possible, and reinforce color with labels so meaning does not depend on color alone.

## Completeness Check

Before answering, check whether the explanation covers every applicable item:

- purpose and outcome
- overall structure and component ownership
- sequence, state change, or data flow
- files, folders, data stores, and source locations
- features and functions
- human, AI, MCP, API, automation, and external-system roles
- practical use example
- limitations, prohibited actions, risks, and approvals
- current implementation state
- next actions
- confirmed facts, inference, proposals, and unknowns

Mark unavailable information as `미확인`, `unknown`, or the user's language equivalent. Do not infer missing details just to pass the checklist.

## Boundary Notes

- This skill explains; it does not grant authority to create, edit, delete, share, send, approve, promote, or synchronize the underlying system.
- Do not expose secrets, private payloads, personal information, raw source bodies, or host-local runtime values merely to make an explanation detailed.
- Preserve the strongest applicable source and permission boundary from the task being explained.
- Domain-specific skills and tools own investigation and execution. This skill owns only the presentation and completeness pass over available evidence.
