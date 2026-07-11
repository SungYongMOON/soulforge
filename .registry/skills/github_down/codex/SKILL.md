---
name: soulforge-github-down
description: "Use when the user asks Codex to download, pull, fetch, update, or sync Soulforge from GitHub; update installed Codex skills; check workspace junction freshness; prepare the current PC to continue Soulforge work; or inspect what this PC can do from its role and capabilities. Also use for Korean requests such as GitHub 내려받기/최신화/동기화, 이 PC 세팅, 이 PC 역할에 맞게 준비, or 다른 PC에서 이어서 작업."
---

# Soulforge GitHub Down

Use this skill for GitHub down: bring Soulforge and companion state down from GitHub.

Source workflow:

- `.workflow/latest_update_sync_and_followup_v0/`

This is a Codex wrapper. `.workflow/latest_update_sync_and_followup_v0/` owns Git/skill/junction update procedure and its packets. `.registry/skills/github_down/skill.yaml` owns this natural-language entry and post-sync capability-to-work requirement. `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md` owns node-role meaning and storage authority.

## Operating Steps

Default scope is `public-only`. Use a stronger profile only when the user explicitly names it or a valid local node identity already establishes it. The presence of `_workmeta/` or `private-state/` folders alone never establishes or upgrades the profile.

Codex operates the terminal for safe in-scope steps. Do not respond with a command list for the user to run unless the remaining step requires owner-held credentials, interactive authentication, install approval, private-repo authorization, or mutation authority.

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.workflow/latest_update_sync_and_followup_v0/workflow.yaml` and `step_graph.yaml`.
3. Always check Git status and remotes for the public repo `.`. Check `_workmeta` and `private-state` only when the established profile authorizes those companion surfaces.
4. Fetch each in-scope repo with an origin remote.
5. Pull only repos that are behind and safe to update.
6. Do not pull through dirty tracked changes, detached HEAD, missing remotes, conflicts, or divergent history. Report the owning repo and blocker instead.
7. Run `npm run skills:sync -- --all` after public repo updates, or when the user asks for skill update/global skill registration. Use `npm.cmd run ...` on Windows PowerShell.
8. Only for an established `owner-with-state` profile, run `npm run guild-hall:workspace-junction:audit` when `_workmeta/system/bindings/workspace_junctions.yaml` is present. For `public-only` or `operator`, do not inspect the private binding. Report missing links, broken links, non-link entries, extra root mirrors, and any checked link whose target suffix does not match `cloud_relative_path`.
9. Do not repair junctions unless the user explicitly grants mutation authority and the local cloud root resolution is available.
10. Run `npm run guild-hall:doctor -- --profile <established-profile> --device-capabilities --json` (`npm.cmd` on Windows PowerShell). The explicit profile keeps `public-only` and `operator` from reading private workspace/capability bindings. Treat the result as advisory and read-only; do not infer mutation, ingest, source approval, or canon authority from access.
11. Read the node-role map in `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`. Report:
   - the observed node role and bootstrap profile, or `public-only` when no stronger profile is established;
   - work this PC can perform now;
   - work blocked by missing capability, local binding, or authority;
   - the smallest owner-only action still required.
12. Run the matching doctor readiness profile after the aggregate probe. Use `--remote` only when remote checks are relevant and `--live` only after local env readiness is established.

Use a mutating role bootstrap prompt only when its authority is explicit:

- explicit `work_pc` plus explicit `owner-with-state`: `docs/architecture/bootstrap/WORK_PC_BOOTSTRAP_PROMPT_V0.md`
- explicit `tool_pc` plus explicit `owner-with-state`: `docs/architecture/bootstrap/TOOL_PC_BOOTSTRAP_PROMPT_V0.md`
- explicit `always_on_node`, exact `owner-with-state`, and explicit designation as the current operational primary: `docs/architecture/bootstrap/ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md`
- explicit `dev_worker_pc`, exact `owner-with-state`, and explicit worker authority: `docs/architecture/bootstrap/DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md`

Keep `portable_dev_pc` on the public development lane in `MULTI_PC_DEVELOPMENT_V0.md`; do not create an operational writer identity unless the user explicitly assigns one.

If only a role is named, or node identity/profile/primary authority is missing, do not invoke the mutating role prompt. Keep the report-only `public-only` posture, run safe public sync and aggregate capability checks, and ask one short authority question only when the answer materially changes setup. Do not invent identity or authority from hostname, installed apps, folder presence, or location.

Global skill registration means syncing repo-tracked Codex wrappers. If a skill exists only in another PC's local `~/.codex/skills/**` and not under `.registry/skills/**/codex`, do not invent or claim it.

## Boundary Rules

- Do not read `.env`, token, password, cookie, session, or credential JSON contents.
- Do not print secret values or local account-bound payloads.
- Do not copy `_workmeta`, `private-state`, mail payloads, project raw truth, or runtime absolute paths into public workflow or skill canon. Junction reports may include aliases, expected suffixes, and redacted target tails, not host-local roots.
- Do not install software, create private repo access, enter credentials, repair junctions, mutate NAS/Drive, enable writers, or promote knowledge merely because the user asked for general PC preparation.

## Mapping

Read `references/mapping.md` when you need the canon linkage, output shape, or owner-boundary details.
