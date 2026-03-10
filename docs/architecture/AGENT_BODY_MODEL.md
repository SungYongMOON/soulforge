# Agent Body Model

## Purpose

The agent body is the persistent layer of Soulforge.

It exists to hold the parts of an agent that should survive class changes, project changes, and workflow swaps.

## Responsibilities

- identity
- engine configuration
- memory
- session continuity
- communication
- autonomic behavior
- policy
- registry
- artifacts and export
- body-facing documentation

## Current Body Areas

```text
.agent/
├── artifacts/
├── autonomic/
├── communication/
├── docs/
├── engine/
├── export/
├── identity/
├── memory/
├── policy/
├── registry/
└── sessions/
```

## Design Rule

Body data is persistent.
Installed knowledge, skills, tools, and workflows do not belong here unless they are body-level defaults.
