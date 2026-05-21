# .registry/skills/pcb_revision_library_cell_launcher

- `pcb_revision_library_cell_launcher/skill.yaml` is the canonical Soulforge skill entry for invoking the existing PCB Revision Library Cell party from Codex.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-pcb-revision-library-cell-launcher/` through the repository skill sync script.
- The launcher routes to `.party/pcb_revision_library_cell/` and workflow-owned `profile_policy.yaml` files instead of copying party chains, workflow bodies, optimizer results, PCB payloads, or runtime bindings into the skill.

```powershell
npm.cmd run skills:sync -- pcb_revision_library_cell_launcher
```
