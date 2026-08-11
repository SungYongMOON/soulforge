---
name: soulforge-grill-me
description: Use when the user asks for /grill-me, grill me, a design-decision interview, plan pressure-test, architecture interrogation, or dependency-aware questioning to refine a plan before implementation.
---

# Soulforge Grill Me

Use this skill when the user wants a focused interview to sharpen a plan before implementation.

## Core Rules

- Identify the plan, decision, or draft being grilled; if none is available, ask for the target in one concise question.
- Map decision dependencies as a design tree. The frontier contains decisions whose prerequisites are already settled.
- Ask the current independent frontier as one numbered round. Split a round only when safety, cognitive load, or an explicit owner preference requires one-at-a-time questioning.
- For each question, explain why it matters, give a recommended answer, and offer concrete options with tradeoffs when useful.
- Find facts from approved repository context and tools before asking the owner. Use a bounded read-only explorer only when fact-finding is independent, safe, and available; never delegate owner decisions.
- After each round, update the decision register and design tree, then recompute the frontier.
- Stop when the frontier is empty and the owner confirms shared understanding. Do not implement, approve, or promote the plan unless the user explicitly exits the interview and asks for that work.

## Load On Demand

- Read [`references/mapping.md`](references/mapping.md) for the interview flow, output shape, and Soulforge boundary notes.
