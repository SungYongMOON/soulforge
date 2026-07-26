# Project-local PC, file, and Codex activity collection V0

## Decision

All currently bound project workspaces may use one common HPP-local collector
before another one-project context experiment is attempted.

```text
project workspace file metadata ─┐
bounded end-of-task work fact ───┼─> project-local HPP outbox
Codex execution relation ────────┘
                                      │
                                      ├─ later: sole-writer reconciliation
                                      └─ later: project timeline/context
```

This stage is evidence collection, not context inference. A known project
workspace stays in that project from the beginning; it is not mixed into one
cross-project timeline and classified again.

## Three views

| view | current HPP source | event rule |
| --- | --- | --- |
| PC work | bounded project five-field end-of-task record | one candidate work occurrence |
| file change | exact project workspace observation packet | existing file reconciler later decides revision events |
| Codex execution | relation over the same bounded work record | relation only; no second occurrence |

The five-field record supplies a practical current-HPP bridge while the planned
ERP WorkSession/MCP/client-plugin path is not live. It does not replace the
future WorkSession owner or grant H03/H05 acceptance.

## Storage boundary

Machine-local collection first lands under the HPP control root. Accepted
project metadata remains owned by `_workmeta/<project_code>/`; project payload
files remain owned by `_workspaces/<project_code>/` or its approved shared
worksite. The collector does not write ERP.

The later sole-writer step imports or reconciles accepted receipts into:

```text
_workmeta/<project_code>/
├── reports/file_activity/**
├── reports/PC_업무_이력/**
├── reports/실행_이력/**
└── project_context/projections/timeline/**
```

Until that step, local outbox packets are collection evidence only.

## Project and privacy rules

- An exact private allowlist owns project membership; no root-wide discovery.
- A new project needs a binding row and pinned digest before collection.
- Whole Codex chat, screen, keystroke, and OS surveillance remain prohibited.
- File bytes may be streamed only for exact SHA-256 and are never retained.
- A five-field full-record digest and same-ID conflict check are mandatory.
- Team-PC records remain deferred to the accepted assignment, WorkSession,
  outbox/ack, and Codex client-plugin contract.

## Build order

1. HPP-local exact project binding and local outbox collection.
2. Repeated scan until OneDrive hydration and hash-budget gaps are visible.
3. Sole-writer reconciliation into project-private metadata.
4. Generate one representative project timeline V2 from accepted refs.
5. Add team-PC MCP/client-plugin delivery after WorkSession is live.
