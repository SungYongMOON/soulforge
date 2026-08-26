---
name: soulforge-project-bootstrap
description: Use when Codex should start or prepare a new Development Team 1 project through the registered Soulforge bootstrap workflow, including requests such as 새 프로젝트 시작, 개발1팀 자체 프로젝트 만들기, 임시 D1 번호 만들기, 프로젝트 기본환경 설정, MSH나 S150처럼 프로젝트 세팅, 프로젝트 폴더·팀장·장부·업무분장·자료등록부를 한 번에 준비해줘. Do not use for an existing project's ordinary task execution or for a standalone external integration.
---

# Soulforge Project Bootstrap

Use this skill as a thin launcher for `.workflow/development_team1_project_bootstrap_v0`.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Resolve the invocation to `development_team1_project_bootstrap_v0`, then read its `workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
3. Bind project classification, Owner authority, identity, people, storage, source boundary, runtime request, integrations, and compatibility evidence.
4. Run the workflow-owned deterministic preflight before any project mutation.
5. If preflight is ready, apply only the exact approved private/local writes with required guards; keep unapproved integrations and incompatible code-family consumers on HOLD.
6. Open the onboarding worklog and one bounded first-work packet, then close through the workflow's validation and review gate.

## Boundary Rules

- Do not invent project codes, people, priority, dates, storage roots, or source facts.
- Do not put raw mail, attachments, project payload, secrets, transcripts, or hidden reasoning in public canon or `_workmeta`.
- Do not create persistent Bots, Engines, external collaboration surfaces, routes, or automation without exact scope and authority.
- Do not treat folders, files, or agent responses as readiness or completion evidence.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) for workflow linkage, required intake, output shape, adjacent routes, and the validation checklist.
