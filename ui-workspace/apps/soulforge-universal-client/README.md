# Soulforge Universal Client

One Windows client implementation for Owner and team-member PCs. The installed
bytes are identical; the Main Node's effective actor, device, project-scope and
capability readback controls which routes are enabled. Local role names and
installer options never grant authority.

## Current bounded implementation

- `projectUniversalClient()` projects the same binary policy into a
  capability-scoped menu. Every enabled route still requires a server-side
  authorization check.
- `work_session_outbox` preserves ordered refs-only result/evidence frames,
  exact digest ACKs, replay `NO_OP`, and conflict `HOLD`. The durable adapter
  stores one digest-bound state with atomic replace, file sync, single-writer
  lock and restart recovery. Neither layer can complete an Official Task or
  promote knowledge.
- `coordinateClientUpdate()` stages only the Universal Client service through
  an injected lifecycle adapter, preserves state/outbox, rejects any reboot,
  and rolls the active release pointer back when candidate health fails.

The Main Node keeps ERP, Engineering Engine, Engineering MCP authority, Buzz
Server, Hermes, 4192 server adapters and Tool Workshop execution. The Client
Pack carries a deterministic self-contained bundle of the existing ingress/mTLS
transport plus the native ERP HTTP client; installed smoke imports that bundle
without reaching parent `node_modules`. It does not copy server authority or
project payload.

## Status and limits

`CURRENT = public-safe headless Client source Pack and synthetic tests`. There
is no physical UI shell, OS-protected credential adapter, live remote binding,
physical-seat acceptance or team rollout yet. Buzz remains a separately
installed collaboration client; its failure cannot change Official Task truth.
PC reboot is forbidden; a dependency that requires reboot must return
`REBOOT_REQUIRED_HOLD`.

Validation: `npm.cmd --prefix ui-workspace/apps/soulforge-universal-client test`.
