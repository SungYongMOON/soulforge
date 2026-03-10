# Soulforge

Soulforge is a body-and-class architecture for modular agents.

It treats an agent as a persistent body (`.agent`), a job/class layer (`.agent_class`), and real project fields (`_workspaces`) where skills, tools, knowledge packs, and workflows are installed and composed.

---

## Core Concept

Soulforge is built on three layers:

- **`.agent`**: the agent body
  Identity, engine, memory, sessions, communication, autonomic behavior, policy, registry, artifacts, export, and body documentation.
- **`.agent_class`**: the active class/job
  Installed skills, tools, workflows, knowledge packs, class definition, and current loadout.
- **`_workspaces`**: the real work field
  Actual company or personal project folders where documents, outputs, and project-specific state live.

This model separates:

- persistent body
- installable class content
- real project field state

---

## World Model

Soulforge uses a serious fantasy-inspired model for explanation:

- **Body / Species** -> `.agent`
- **Class / Profession** -> `.agent_class`
- **Skills** -> installed capabilities
- **Tools** -> equipped external tools and MCP integrations
- **Knowledge** -> installed knowledge packs, not memory
- **Workflows** -> operational doctrine and procedures
- **Project Fields** -> `_workspaces`
- **Project Contracts** -> `.project_agent`

Memory is part of the body.
Knowledge is installed as part of a class.

---

## Repository Structure

```text
./
├── .agent/                  # body
├── .agent_class/            # class
├── _workspaces/             # real project fields
├── docs/
│   └── architecture/
└── README.md
```

### `.agent`

The persistent body of the agent.

### `.agent_class`

The installed class layer for the current environment.
This includes:

- `class.yaml`
- `loadout.yaml`
- `skills/`
- `tools/`
- `workflows/`
- `knowledge/`
- `docs/`
- `_local/` for ignored local-only state

### `_workspaces`

Actual project folders, divided into:

- `company/`
- `personal/`

Each project can contain its own `.project_agent/` contract folder.

---

## Design Principles

1. The body is persistent.
2. The class is installable and replaceable.
3. Memory belongs to the body.
4. Knowledge belongs to the class.
5. Skills and tools are not the same.
6. Workflows are operational doctrine, not body organs.
7. Real project files stay inside project folders.

---

## Why Soulforge

Most agent repositories mix body logic, installed capabilities, local runtime state, and project field data into one place.

Soulforge separates them:

- **body** for persistent identity and core behavior
- **class** for installed job-specific capabilities
- **workspace** for real project execution
- **project contract** for field-specific bindings

This makes the system easier to explain, version, move, and evolve.

---

## Current Status

This repository is in the initial architecture phase.

The current focus is:

- defining the body model
- defining the class model
- defining workspace/project structure
- preparing installable skills, tools, knowledge packs, and workflows
- documenting migration from earlier agent structures

UI will come later.
The architecture and contracts come first.

---

## Planned Documents

- [`docs/architecture/AGENT_BODY_MODEL.md`](docs/architecture/AGENT_BODY_MODEL.md)
- [`docs/architecture/AGENT_CLASS_MODEL.md`](docs/architecture/AGENT_CLASS_MODEL.md)
- [`docs/architecture/WORKSPACE_PROJECT_MODEL.md`](docs/architecture/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/TARGET_TREE.md`](docs/architecture/TARGET_TREE.md)
- [`docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`](docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md)
- [`docs/architecture/CURRENT_DECISIONS.md`](docs/architecture/CURRENT_DECISIONS.md)
- [`docs/architecture/MIGRATION_REFERENCE.md`](docs/architecture/MIGRATION_REFERENCE.md)

---

## License

TBD
