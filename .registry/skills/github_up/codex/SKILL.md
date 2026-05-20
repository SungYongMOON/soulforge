---
name: soulforge-github-up
description: "Use when the user asks Codex to upload, publish, commit, push, or send Soulforge changes to GitHub, or run the canonical GitHub upload workflow. Also use for Korean requests about GitHub upload, publish, commit, push, or up."
---

# Soulforge GitHub Up

Use this skill for GitHub up: validate, commit, and push Soulforge changes to GitHub.

Source workflow:

- `.workflow/github_upload_publish_v0/`

This is a Codex wrapper. It does not own policy. Workflow canon owns the procedure, repo boundaries, output shapes, and claim ceilings.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.workflow/github_upload_publish_v0/workflow.yaml` and `step_graph.yaml`.
3. Inventory Git status separately for:
   - public repo: `.`
   - project metadata repo: `_workmeta`
   - continuity state repo: `private-state`
4. Keep each repo in its own Git root. Never stage private payloads into the public repo.
5. Run validators that match the changed surface. For public repo changes, prefer `npm.cmd run validate` or the narrower required validator named by the touched owner.
6. Prepare a commit plan before staging. Name included repos, files, validators, and commit messages.
7. Do not commit unrelated dirty changes unless the user explicitly includes them.
8. Do not use destructive rewrites such as hard reset, forced checkout, or force push.
9. Commit and push only repos whose scope is intentional and validated or whose skipped validation reason is explicit.
10. Report pushed repo ids, branches, commit refs when available, validator status, and any blocked repo.

## Boundary Rules

- Do not read `.env`, token, password, cookie, session, or credential JSON contents.
- Do not print secret values or local account-bound payloads.
- Do not copy `_workmeta`, `private-state`, mail payloads, project raw truth, or runtime absolute paths into public workflow or skill canon.

## Mapping

Read `references/mapping.md` when you need the canon linkage, output shape, or owner-boundary details.
