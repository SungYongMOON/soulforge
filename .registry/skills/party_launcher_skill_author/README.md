# .registry/skills/party_launcher_skill_author

- `party_launcher_skill_author/skill.yaml` is the canonical Soulforge skill entry for authoring thin Codex launcher skills from existing party loadouts.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-party-launcher-skill-author/` through the repository skill sync script.
- The generated launcher skill must route to `.party/<party_id>/` and workflow-owned `profile_policy.yaml` files instead of copying party chains or optimizer results into the launcher body.

```powershell
npm.cmd run skills:sync -- party_launcher_skill_author
```
