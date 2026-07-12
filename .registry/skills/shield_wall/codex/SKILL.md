---
name: soulforge-shield-wall
description: Use when a Soulforge task has high uncertainty, boundary violations are still being localized, or the next change path is not yet safe, and Codex should establish one active boundary before action. Do not invoke implicitly for clear, bounded, low-risk fixes or routine review/edit work with no unresolved boundary. Also use when the user mentions shield wall, frontline guard, or knight.frontline_guard, or when a Soulforge unit or workflow explicitly binds shield_wall.
---

# Soulforge Shield Wall

Use this skill when the unit lens or workflow step calls for `shield_wall`.

## Core rules

- Start the final answer with `Applied skill: soulforge-shield-wall`.
- First decide whether one unresolved boundary actually blocks safe action. If not, say Shield Wall is unnecessary and continue through the normal task path without extra review.
- Name one active boundary question and inspect only the files or evidence needed to answer it; do not expand the task into a general audit.
- Localize risk before editing. If no edit is required, say so; if a change is authorized, take only the smallest safe action and explain why.
- Stop Shield Wall review once the active boundary is understood or its blocker is explicit. Continue through the normal scoped path, or use `soulforge-charge-breaker` only when a localized blocker remains and the next direct change is clear.
- If requirements, owner approval, secret access, or public/private judgment remain unresolved, report the blocker and safest next step instead of widening scope.

## Load on demand

- For Soulforge mapping, canon linkage, and output shape, read [`references/mapping.md`](references/mapping.md).
