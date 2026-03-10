# Agent Class Model

## Purpose

The class layer is the installable and replaceable job definition for a Soulforge body.

It describes what the body is equipped to do in a given environment without redefining the body itself.

## Responsibilities

- class definition
- loadout selection
- installed skills
- equipped tools
- operational workflows
- knowledge packs
- class documentation

## Current Class Areas

```text
.agent_class/
├── _local/
├── docs/
├── knowledge/
├── skills/
├── tools/
│   ├── adapters/
│   ├── connectors/
│   ├── local_cli/
│   └── mcp/
├── workflows/
├── class.yaml
└── loadout.yaml
```

## Design Rule

The class is installable and replaceable.
Memory remains with the body even when the class changes.
