# guild_hall/knowledge_access

## Purpose

- `knowledge_access/` is a small public-safe command surface for proving that ordinary knowledge ref reads/uses can append metadata-only ledger rows.
- It supports `read` for repo-relative public knowledge files and `record` for use/citation events where the target payload is not read.
- It supports `analyze`/`rollup` for explicit JSONL ledger files or repo-relative ledger refs, producing metadata-only usage rollup and boundary review note JSON.
- It supports `notebooklm-bridge` for importing explicit NotebookLM-like metadata binding/source-ledger/query-log files into `imported_log_entry` rows plus a metadata-only summary.
- The synthetic NotebookLM bridge fixture at `docs/architecture/workspace/examples/notebooklm_bridge/` covers positive advisory imports and blocked no-query/no-fabrication behavior without real source payloads.
- The ledger target is always explicit: pass either `--ledger-root` or `--ledger-file`. Use `_workmeta/**`, `guild_hall/state/**`, `private-state/**`, or a temp path outside the repo for actual runtime rows.
- The combined operating model is documented at `docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md`.

## Commands

```bash
npm run guild-hall:knowledge-access -- read --ref docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md --ledger-root _workmeta/system/reports/knowledge_access --reason-used "checked activity contract"
npm run guild-hall:knowledge-access -- record --ref docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md --ledger-root _workmeta/system/reports/knowledge_access --access-type cite --reason-used "cited activity contract" --output-ref _workmeta/system/reports/example.md
npm run guild-hall:knowledge-access -- record --ref docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md --ledger-root _workmeta/system/reports/knowledge_access --capture-mode automatic_end_of_task_trigger_check --access-type route --trigger-result metadata_only_record --suggested-route knowledge_access_ledger --claim-ceiling observed --reason-used "end-of-task trigger check used this ref"
npm run guild-hall:knowledge-access -- analyze --ledger-ref _workmeta/system/reports/knowledge_access/events/2026/2026-05.jsonl
npm run guild-hall:knowledge-access -- notebooklm-bridge --binding-ref docs/architecture/workspace/examples/notebooklm_bridge/synthetic_notebooklm_binding.yaml --ledger-file _workmeta/system/reports/knowledge_access/notebooklm_bridge.jsonl
npm run validate:knowledge-access
```

## Optional Stop Hook Guard

`knowledge_trigger_stop_guard.mjs` is a low-noise Codex `Stop` hook helper. It does not judge knowledge and does not read transcripts. It only inspects the hook payload's final assistant message and blocks bounded Soulforge completion reports that forgot the Korean `지식 트리거 확인:` closeout line. New reports should use user-facing Korean labels such as `지식 트리거 확인: 책임자 판단 필요`; legacy `지식 트리거 확인: 오너 판단 필요` and `Knowledge trigger check:` lines are still accepted for compatibility.

Preferred closeout wording:

```text
지식 트리거 확인: 책임자 판단 필요
주장 한계: 관찰됨 - 자료를 찾고 정리했지만 아직 검증/승인된 지식은 아님
```

Example user-local Codex hook config:

```toml
[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = 'node "$(git rev-parse --show-toplevel)/guild_hall/knowledge_access/knowledge_trigger_stop_guard.mjs"'
timeout = 10
statusMessage = "Checking Soulforge closeout line"
```

Keep this in user/project Codex hook config, not in public runtime ledger data. The guard stays silent on normal conversation, non-Soulforge cwd, and responses that already include `지식 트리거 확인: ...`.

## Boundary

- Ledger rows include refs and metadata only: event id, timestamp, capture mode, ledger ref, actor, target knowledge ref, access type, reason, output ref, work context, outcome state, and redaction flags.
- End-of-task trigger flags only populate `accumulation_delta_hint` metadata for already-used refs; they do not validate source truth, approve ontology/owner decisions, mutate graphs, archive/retire refs, or promote canon.
- Stop hook guard output is a compact missing-line continuation request only; it does not evaluate candidate quality, scan transcripts, or store `없음` / legacy `no_trigger` rows.
- Source file payloads are returned only by `read`; they are never copied into the JSONL row.
- `analyze`/`rollup` reads only explicit `.jsonl` ledger files or repo-relative ledger refs. It does not scan directories, follow ledger roots, read target payloads, or mutate canon/ontology/graph state.
- `notebooklm-bridge` reads only explicit metadata files. It does not call `nlm`, inspect NotebookLM auth/session files, copy source/query payloads or free-form query-log reason prose, or infer events when the query log has no importable rows.
- `notebooklm-bridge` rejects malformed `timestamp_utc` values, unsafe `entry_ref` auth/session/runtime paths, and invalid event enum cells without echoing rejected cell payloads.
- Rollup output includes counts, recency, actor/access/context count metadata, issue summaries, and boundary note checks only. Invalid rows are reported by safe source ref and line number without echoing row payloads.
- NotebookLM-like imported rows remain advisory signals only; analyzer output is not canon validation, owner approval, or graph mutation.
- Secret-like filenames, private/runtime roots, absolute paths, and path traversal refs are blocked before any read or append.
- Public tracked canon is not a runtime ledger owner. If the ledger target is inside the repo, it must be under `_workmeta/**`, `guild_hall/state/**`, or `private-state/**`.
- Analysis outputs report source ledgers as repo-relative refs or `ledger_file:<basename>` for external temp paths; runtime absolute source paths are not emitted.
