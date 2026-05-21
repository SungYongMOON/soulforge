# Knowledge Wiki Cell

`knowledge_wiki_cell` is the reusable party for the Karpathy-style wikiization path.

The party links these workflows:

1. `official_source_packet_collect_v0`
2. `sourcebound_knowledge_packet_operating_loop_v0`
3. `knowledge_access_event_capture_v0`
4. `post_development_review_gate_v0`

In plain language: first gather and approve source refs, then make a private sourcebound wiki projection, then record metadata-only usage signals, then close the work through the review gate.

Google Drive or another owner-held archive can sit around that chain as the file
archive and backup: incoming candidate files go to an inbox/candidate manifest,
working packets and canon packages get archive refs later, and the workflow keeps
status labels so storage does not look like approval.

Drive and NotebookLM placement follows
`docs/architecture/guild_hall/KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md`:
Google Drive is the source warehouse, NotebookLM notebooks are query
bookshelves, `_workmeta` is the source catalog, and Drive manifests or
shortcuts must not become source truth or canon authority.

This party does not own the inner steps of those workflows and does not choose the best model, reasoning effort, species, class, or unit. Those choices stay with each workflow's profile and calibration files.

Each workflow stage in a real run should be executed by a fresh subagent and should write private evidence under `_workmeta/<project_code>/runs/<run_id>/` or `_workmeta/system/runs/<run_id>/`.

ZIP files are not retained as source truth. Use extracted files, inventories, source packet refs, and gap reports instead.

When archive policy declares `codex_skill_auto_sync`, approved Codex skills or
the Google Drive connector may upload/sync bounded archive files without
per-file owner confirmation. The party must still preserve the distinction
between `inbox`, `candidate_source`, `working_packet`, `reviewed_private`,
`canon_package`, and `obsolete_or_blocked`, and sync authority must not become
canon or source authority.

Obsidian is not part of the authority chain. If an Obsidian view is requested,
the safe route is a generated read-only export over canon-backed
`.registry/knowledge` entries or approved canon packages only. `_workmeta`
projection payloads, NotebookLM answers, Drive candidate files, and owner
decision notes that were not promoted must stay out of the vault body.

## Draft Routing Surface

The current routable default is now `se_knowledge_wiki_pipeline_v0`.

That composite workflow still routes through the registered four-stage lane:

1. `official_source_packet_collect_v0`
2. `sourcebound_knowledge_packet_operating_loop_v0`
3. `knowledge_access_event_capture_v0`
4. `post_development_review_gate_v0`

A request-classification note now lives at `routing_rules.yaml`. It keeps:

- `knowledge_wiki_cell` as the current registered route,
- `se_knowledge_wiki_pipeline_v0` as the registered composite entry,
- and the older stage-first description preserved as the downstream chain the composite still owns.
