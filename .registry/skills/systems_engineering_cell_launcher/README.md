# .registry/skills/systems_engineering_cell_launcher

- `systems_engineering_cell_launcher/skill.yaml` is the canonical Soulforge skill entry for invoking the existing Systems Engineering Cell party from Codex.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-systems-engineering-cell-launcher/` through the repository skill sync script.
- The launcher routes to `.party/systems_engineering_cell/` and workflow-owned `profile_policy.yaml` files instead of copying party chains, workflow bodies, optimizer results, project payloads, or runtime bindings into the skill.
- The launcher can notice party-declared reference lookup route candidates, but private evidence and raw reference content stay outside the public skill package.
- The launcher can route to `se_cross_stage_mapping_governance_v0` for governance aggregation only; source truth, artifact authority, review approval, and readiness decisions remain outside the launcher.

```powershell
npm.cmd run skills:sync -- systems_engineering_cell_launcher
```
