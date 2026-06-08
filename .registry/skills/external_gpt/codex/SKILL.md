---
name: soulforge-external-gpt
description: "Use when Codex should invoke the registered Soulforge external GPT workflow: call a bounded external ChatGPT browser conversation as advisory reasoning support with sanitized prompt packets, same-goal session reuse, DOM message-role readback, private pointer refs, and strict public/private and side-effect boundaries. Also use for Korean requests mentioning 외부 GPT 호출, ChatGPT Pro/Thinking 브라우저 자문, GPT 앱/브라우저에 물어보기, or 외부 추론 세션."
---

# Soulforge External GPT

Use this skill as a thin launcher for `.workflow/external_reasoning_workspace_v0`.

The workflow owns the actual procedure: bounded goal binding, browser preflight,
same-goal session reuse, visible mode-label handling, sanitized prompt packets,
DOM message-role readback, continuation limits, advisory handoff, and boundary
rules. Do not duplicate or override that workflow inside this skill.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.workflow/external_reasoning_workspace_v0/workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
3. Bind the current Soulforge task goal, advisory question, success criteria, stop conditions, side-effect authorization, and public/private boundary before browser interaction.
4. Use visible browser and ChatGPT UI state only. Do not inspect cookies, local storage, passwords, tokens, credential files, session files, or `.env` values.
5. Reuse an authorized same-goal conversation only when the task still matches and contamination risk is low. Otherwise create a fresh bounded conversation only when user-scoped authorization allows it.
6. Select only a visible user-authorized Pro / Thinking-like mode label. Do not hard-code model names, internal endpoints, account ids, or subscription-specific claims.
7. Send only a sanitized bounded prompt packet with a marker or nonce, explicit forbidden content, output shape, and claim ceiling.
8. Read the assistant response through DOM message-role evidence. Generic visible page text is not sufficient as primary evidence.
9. Continue in the same conversation only while the same bounded goal remains active and the workflow turn limit allows it.
10. Return an advisory handoff packet with conclusions, gaps, marker/readback status, claim ceiling, and private pointer refs when needed.
11. Route source truth, validation, owner approval, registration, default-route, or production-readiness needs to the owning downstream workflow.

## Boundary Rules

- ChatGPT output is advisory context only. It is not source truth, a validation verdict, owner approval, or canon authority.
- Do not copy raw transcripts, raw private payloads, account-bound conversation ids, project ids, raw URLs, cookies, local storage, tokens, credentials, sessions, `.env` values, or host-local absolute paths into public canon or this skill.
- Do not create share links, upload files, create projects, change permissions, change payment/account/security settings, delete, archive, or clean up destructively without explicit action-time approval.
- Do not switch a default route, bind a party, or claim `production-ready` or `default-route-safe` from this launcher.
- Use `$soulforge-dual-deep-research` instead when NotebookLM CLI-first Deep Research or source-backed dual research is the requested route.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need workflow linkage, output shape, boundary checklist, or validation checklist.
