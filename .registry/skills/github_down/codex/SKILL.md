---
name: soulforge-github-down
description: "Use when the user asks Codex to download, pull, fetch, update, or sync Soulforge from GitHub, update installed Codex skills, check workspace junction freshness after a GitHub pull, or run the canonical latest-update workflow. Also use for Korean requests about GitHub download, latest update, sync, skill update, or down."
---

# Soulforge GitHub Down

Use this skill for GitHub down: bring Soulforge and companion state down from GitHub.

Source workflow:

- `.workflow/latest_update_sync_and_followup_v0/`

This is a Codex wrapper. It does not own policy. Workflow canon owns the procedure, repo boundaries, output shapes, and claim ceilings.

## Operating Steps

Default scope is `owner-with-state` when the current machine has `_workmeta/` and `private-state/` repo surfaces:

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.workflow/latest_update_sync_and_followup_v0/workflow.yaml` and `step_graph.yaml`.
3. Check Git status and remotes for:
   - public repo: `.`
   - project metadata repo: `_workmeta`
   - continuity state repo: `private-state`
4. Fetch each repo with an origin remote.
5. Pull only repos that are behind and safe to update.
6. Do not pull through dirty tracked changes, detached HEAD, missing remotes, conflicts, or divergent history. Report the owning repo and blocker instead.
7. Run `npm.cmd run skills:sync -- --all` after public repo updates, or when the user asks for skill update/global skill registration.
8. Run `npm run guild-hall:workspace-junction:audit` when `_workmeta/system/bindings/workspace_junctions.yaml` is present. Report missing links, broken links, non-link entries, extra root mirrors, and any link whose target suffix does not match the binding `cloud_relative_path`.
9. Do not repair junctions unless the user explicitly grants mutation authority and the local cloud root resolution is available.
10. Run the relevant doctor/readiness check and report ahead/behind, pulled repos, synced skills, junction status, and blockers.

Global skill registration means syncing repo-tracked Codex wrappers. If a skill exists only in another PC's local `~/.codex/skills/**` and not under `.registry/skills/**/codex`, do not invent or claim it.

## Boundary Rules

- Do not read `.env`, token, password, cookie, session, or credential JSON contents.
- Do not print secret values or local account-bound payloads.
- Do not copy `_workmeta`, `private-state`, mail payloads, project raw truth, or runtime absolute paths into public workflow or skill canon. Junction reports may include aliases, expected suffixes, and redacted target tails, not host-local roots.

## Mapping

Read `references/mapping.md` when you need the canon linkage, output shape, or owner-boundary details.
