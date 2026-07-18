# Ontology canon package helper

This helper builds and validates a bounded ontology canon release from selected
tracked files under `.registry/knowledge`.

- Package payloads belong under `_workspaces/system/**` or another approved
  worksite, never `_workmeta`.
- The release manifest records inventory SHA-256 values, the corresponding Git
  commit, owner-decision ref, NotebookLM membership, exclusions, and recovery
  evidence.
- `create` refuses non-text files, secret-like filenames and assignments,
  Windows absolute paths, caller-supplied blocked markers, and non-empty output
  roots.
- `verify` checks every inventory item and the package digest. Final validation
  also requires a connected NotebookLM membership and Drive-to-Soulforge
  recovery evidence.
- `restore-verify` copies a package only into a new destination and reruns the
  same hash validation. It does not download from Drive, write to NAS, or
  reconcile `.registry/knowledge` automatically.

```powershell
npm.cmd run guild-hall:knowledge-canon -- create --repo-root C:\Soulforge `
  --output-root C:\Soulforge\_workspaces\system\ontology_canon\<release_id> `
  --release-id <release_id> --git-commit <commit> --created-at <iso8601> `
  --owner-decision-ref <metadata-only-ref>

npm.cmd run validate:knowledge-canon -- --manifest <manifest-path>
```

Drive and NAS reconciliation is always review-first: compare release ID,
inventory, hashes, Git commit, and impact before applying any difference.
