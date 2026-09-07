# Server-pack absorption — TARGET (not current)

Status: `TARGET`. The proposed operations-lane absorption is not implemented.
Existing Pack capabilities are described separately below. It records the decision of
2026-09-04. The 2026-09-07 source correction below distinguishes the existing
vendored-dependency support from the still-missing Board build closure.

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

## Existing capability — pinned vendored runtime closure

A pack spec enumerates explicit files, including untracked dependencies when
their exact bytes are pinned. `emit_hpp_spec.mjs` already emits the
`vendored_dependencies` role and `vendored_file_sha256` for six package roots:
`yaml`, `ajv`, `fast-deep-equal`, `fast-uri`, `json-schema-traverse`, and
`require-from-string`. Its `--check` validates those bytes. The earlier claim
that `build_pack.mjs` had no representation for untracked runtime closure was
incorrect.

This does not mean that the Board's Vite/React closure has been declared or
built into HPP. Historical lane file counts are not current source evidence.

## Remaining precondition — Board source, build inputs and output provenance

`ui-workspace/apps/team-ops-board/dist/` is the vite client bundle. It
is gitignored, so it cannot come from a commit, and it cannot be built inside
the lane by design: the lane's `node_modules` is the runtime closure only, and
the client bundle also imports `react`, `react-dom`, `@xyflow/react`,
`lucide-react`, `simple-icons` and `@lobehub/icons-static-svg`, which are not in
it.

The source-lane builder handles this honestly by carrying it forward with a
digest proof and recording the condition under which that is valid (the Board
client source unchanged since the previous lane's commit). A pack spec has no
declared Board bundle input yet. Absorption needs source-bound build output and
its complete dependency closure, followed by actual installed smoke evidence.

## What would have to be decided

1. Which additional Board build/runtime packages join the existing explicit
   vendored closure, with lockfile and exact per-file digest evidence?
2. Does `dist/` become a build step inside the release ladder (which would give
   the pack a build closure it deliberately does not have today), or a declared
   carried input with a provenance record?
3. Does `guild_hall/watchtower/` and `ui-workspace/apps/team-ops-board/` entering
   `hpp_server_pack` change that pack's `contains` boundary or its
   `content_roles`, and does the initial release gate have to be re-earned?

Until the Board source/build/output closure and boundary are implemented and
verified, absorption remains `TARGET`. The current-spec candidate rehearsal
does not build, install, register or retire any operational source lane.
