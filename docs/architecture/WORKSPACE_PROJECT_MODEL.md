# Workspace Project Model

## Purpose

Workspaces are the real operating field for Soulforge.

They contain actual project files, deliverables, and project-specific state instead of abstract capability definitions.

## Workspace Layout

```text
_workspaces/
├── company/
└── personal/
```

Each project folder may include a `.project_agent/` contract directory for project-specific bindings, instructions, or local agreements between the body and the active class.

## Design Rule

Project files stay inside the project field.
The body and class layers should reference workspaces, not absorb them.
