---
name: soulforge-easy-explain
description: Use when the user explicitly invokes $soulforge-easy-explain or asks to restate a long or complex task more easily, visually, with color, structurally, at a glance, or without omissions. Also trigger for Korean requests such as "좀 더 쉽게 설명해줘", "도식화해줘", "색도 넣어줘", "구조적으로 정리해줘", "한눈에 보여줘", or "파일 구조와 기능을 빼먹지 말고 설명해줘".
---

# Soulforge Easy Explain

Turn the current or named work into an easy, visual, structurally complete explanation. Explain the evidence already available; do not silently redo or mutate the underlying task.

## Core Rules

- Use the latest bounded work as the target unless the user names another target. Ask one concise question only when the target is genuinely ambiguous.
- Lead with a one-sentence conclusion in the user's language, then explain from whole to part.
- Choose the smallest useful visual: a compact table, Mermaid diagram, or rich color visualization only when the relationships justify it.
- Cover every applicable item: purpose, structure, flow, files or data locations, functions, roles and interfaces, practical example, limits and approvals, current state, and next actions. Omit inapplicable sections instead of padding.
- Keep confirmed facts, inference, proposal, and unknowns visibly separate. Never invent detail merely to make the explanation appear complete.
- Preserve source, privacy, permission, and mutation boundaries from the underlying task.
- Keep the prose approachable and scannable; explain unavoidable technical terms where they first appear.

## Load On Demand

- Read [`references/mapping.md`](references/mapping.md) for the visual selection rules, completeness checklist, color semantics, output shape, and stop conditions.
