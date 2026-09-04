# Server-pack absorption — TARGET (not current)

Status: `TARGET`. Nothing in this document is built. It records the decision of
2026-09-04 and the two preconditions that block it, so the next person does not
have to rediscover them.

## The decision

Two release trains carry code to this host today:

| Train | Built by | Rigor | What runs from it |
| --- | --- | --- | --- |
| `install/server-pack/<version>/` | `tools/build_pack.mjs` | manifest + `pack_digest` + install / smoke / start-stop receipts + `pack_lifecycle` backup/upgrade/rollback/restore | 3 of 5 scheduled tasks |
| `install/source-lanes/<lane>/` | `tools/build_source_lane.mjs` (as of this commit; previously an untracked scratchpad script) | manifest + per-file digest + carried-forward proof | the Team Ops Board task, and the Slack batch lane |

Two trains is one too many. The target is **one**: fold the operations lane's
content into `hpp_server_pack` and retire the lane. The source-lane builder is
the bridge to that target, not a competitor to it — it exists because the lane
was unbuildable and the monitoring system had no release train at all, and
because the two preconditions below are real work that should not block a fix
that was already overdue.

Chosen order: **source-lane builder first, absorption second.**

## Why absorption is the better end state

- `build_pack.mjs` proves things the lane builder does not: an isolated install
  with bidirectional digest re-verification, a smoke run inside the installed
  copy, a start/stop proof against a live `/api/health` attestation, and a
  generation model with a preserved previous generation for rollback.
- One train means one place where "which bytes are running" is answered, and one
  cutover procedure instead of two.
- `guild_hall/ai_usage_meter/` is already split across both trains
  (`evidence_ledger.mjs` in the pack; the rest only in the lane). A module whose
  files live in two release trains has no single answer to "what version is it".

## Precondition 1 — the untracked runtime closure

A pack spec enumerates tracked repository files. The operations lane carries
2,410 files that are not tracked:

- `ui-workspace/node_modules/` — 2,177 files, the `vite` + `@vitejs/plugin-react`
  runtime closure
- `node_modules/yaml/` — 233 files

`build_pack.mjs` has no representation for these. Until it does, absorbing the
lane would mean either vendoring a dependency closure into tracked files or
requiring the host to reach a package registry at install time. Both are
decisions with consequences beyond this module, so neither is taken here.

## Precondition 2 — the gitignored build output

`ui-workspace/apps/team-ops-board/dist/` (5 files) is the vite client bundle. It
is gitignored, so it cannot come from a commit, and it cannot be built inside
the lane by design: the lane's `node_modules` is the runtime closure only, and
the client bundle also imports `react`, `react-dom`, `@xyflow/react`,
`lucide-react`, `simple-icons` and `@lobehub/icons-static-svg`, which are not in
it.

The source-lane builder handles this honestly by carrying it forward with a
digest proof and recording the condition under which that is valid (the Board
client source unchanged since the previous lane's commit). A pack spec has no
such concept: a pack is a pure function of tracked files, and `dist/` is not one.

## What would have to be decided

1. Does a pack gain a declared "unmanaged closure" partition with its own digest
   ledger, or does the closure become tracked?
2. Does `dist/` become a build step inside the release ladder (which would give
   the pack a build closure it deliberately does not have today), or a declared
   carried input with a provenance record?
3. Does `guild_hall/watchtower/` and `ui-workspace/apps/team-ops-board/` entering
   `hpp_server_pack` change that pack's `contains` boundary or its
   `content_roles`, and does the initial release gate have to be re-earned?

Until 1 and 2 are answered, absorption is not a scheduling problem, it is a
design problem, and the honest status is `TARGET`.
