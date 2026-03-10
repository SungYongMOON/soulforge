# Current Decisions

- Soulforge is the repository and architecture name.
- The repository is organized around `.agent`, `.agent_class`, and `_workspaces`.
- Memory belongs to the body layer.
- Knowledge belongs to the class layer.
- Skills and tools are modeled separately.
- Workflows are treated as operational doctrine.
- Project-specific state stays inside project folders.
- `_local/` under `.agent_class` is reserved for ignored local-only data.
