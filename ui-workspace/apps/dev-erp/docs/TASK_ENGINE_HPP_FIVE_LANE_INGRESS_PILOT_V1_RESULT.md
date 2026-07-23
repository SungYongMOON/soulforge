# Task Engine HPP five-lane ingress pilot V1 result

## Decision

The bounded, feature-OFF end-to-end pilot is implemented and executed with
actual source occurrences. It proves one fresh five-lane HPP custody set, one
`P26-016` Shadow generation, copied-ERP persistence, DB/CSV/XLSX parity,
localhost MCP query/download, and project/common knowledge and metadata-RAG
previews. It does not activate a production writer or promote the Shadow data
to accepted history or accepted knowledge.

### 2026-07-23 interpretation note — historical receipt unchanged

The receipt below records a bounded, one-shot actual five-lane canary. It is not
evidence of continuous source bindings. Owner-supported operational truth is
currently limited to received mail and PLAUD voice, both `LIVE_UNACCEPTED`;
their private exact binding, freshness, coverage, cursor, and formal H-phase
acceptance are not asserted here. Sent mail, Slack, Codex work log, file
changes, and PC work are `UNCONNECTED`. The new normalized H→P5 project
classification/shared semantic-label path and P7 TaskDriver path remain OFF.
Legacy source-local mail routing and auto-intake remain `VERIFY_HP` and are not
accepted P5/P7 evidence. This interpretation does not rewrite or invalidate any
historical count, digest, or receipt below.

```text
actual mail + voice + PC work + file + run/log
                       |
                       v
          HPP immutable custody + receipt
                       |  first apply + replay no-op
                       v
             P26-016 Shadow history
                       |  5 events + 5 coverage rows
                       v
             standalone ERP copy
                /          |          \
             CSV         XLSX       localhost MCP
                \          |          /
                 exact row/hash parity
                       |
                       v
       project/common knowledge + metadata-RAG preview
                 (feature OFF / held)
```

## Actual result

| Surface | Executed result | Claim ceiling |
| --- | --- | --- |
| five-lane custody | one newly selected actual occurrence for mail, voice, structured PC work, team file, and run log has an immutable HPP payload, receipt, and checkpoint or receiver acknowledgement | bounded canary only; not full-source coverage |
| source preservation | all five custody payload hashes match their receipts; source deleted and overwritten flags are false | proves the selected occurrences only |
| dedupe/replay | mail and voice first apply wrote three custody objects each and identical replay wrote zero; the three outbox lanes first enqueue wrote two objects each and replay wrote zero | idempotence for this pilot set |
| one-project Shadow | `P26-016` has exactly five lane-typed events and five H06 coverage receipts; identical replay adds zero and replays five | `classification_state=shadow`; no accepted/current pointer |
| ERP copy | the generation was inserted only into a standalone copied ERP DB and replayed idempotently; `quick_check=ok`, foreign-key violations are zero, the canonical table/index/trigger fingerprint matches, and the authoritative ERP main-file hash stayed unchanged | online snapshot; source WAL/SHM moved during the original copy window, so this is not a quiesced production-migration proof |
| DB/CSV/XLSX | copied DB, CSV, XLSX input, and XLSX readback have the same ordered row digest; one external digest binds the exact generation, schema fingerprint, file sizes, and four artifact hashes; the workbook has one visible sheet, zero formulas, zero hidden sheets, and zero external links | one project and one generation |
| localhost MCP | the actual copied DB returned five events and five coverage rows through exactly two read-only tools only after reconstructing the generation and verifying the external artifact attestation; CSV and XLSX full downloads matched size/hash, range download returned 206, and one-time replay returned 404 | temporary loopback canary only; no persistent or LAN listener |
| copied DB immutability | MCP used SQLite `readOnly`, `PRAGMA query_only=ON`, and `total_changes=0`; copied DB SHA-256 was unchanged after query and downloads | copied pilot DB only |
| project knowledge | five held `P26-016` candidates, an eight-node/sixteen-edge graph view, five retrieval units, and five metadata index documents rebuild byte-identically | metadata preview; not accepted project Wiki/RAG truth |
| common knowledge | five system-owned held candidates preserve `origin_project_code=P26-016`; graph and metadata index rebuild byte-identically | metadata preview; no implicit project-to-common fallback |

## Storage ownership remains unchanged

The pilot uses the existing owners instead of replacing the Soulforge folder
model:

```text
HPP private data root
├─ ingress/
│  ├─ mailbox/canary/incoming/<digest>       actual mail custody
│  ├─ voice/canary/incoming/<digest>         actual voice custody
│  ├─ team_files/incoming/<digest>           actual file custody
│  ├─ pc_activity/work_events/incoming/...   bounded PC-work custody
│  └─ run_logs/incoming/<digest>             bounded run/log custody
├─ state/receipts|checkpoints/...             hash, receipt, dedupe state
└─ isolated pilot/
   ├─ standalone ERP copy                     five Shadow events/coverage
   └─ project-history/P26-016/<generation>/
      ├─ project_history.csv
      └─ project_history.xlsx

_workmeta/system/...                          metadata evidence only
_workspaces/<project>/...                     existing OneDrive worksite unchanged
Google Drive ontology / .registry/knowledge   canon ownership unchanged
NotebookLM / live RAG                         unchanged
```

RAW bodies and office files are not copied into `_workmeta` or public Git.
Project history is a relationship/projection over centrally deduplicated
custody; the same RAW object is not multiplied into every project directory.

## Public implementation

- `guild_hall/ingress/collector.mjs` supports bounded mail and voice custody in
  addition to the existing three lanes.
- `guild_hall/shared/project_history_actual_shadow.mjs` validates the private
  metadata packet and builds the exact five-lane Shadow generation without a DB
  or filesystem writer.
- `ui-workspace/apps/dev-erp/tools/project_history_copy_projector.mjs` writes
  only to an explicitly authorized, standalone ERP copy; its separate verifier
  is query-only and checks DB/CSV/XLSX parity.
- `ui-workspace/apps/dev-erp-mcp/project_history_server.mjs` is a separate
  default-OFF loopback server with only `erp_get_project_history` and
  `erp_prepare_project_history_download`. It reconstructs the exact generation,
  checks the canonical schema and DB/CSV/XLSX readback parity, and requires an
  externally pinned artifact-attestation digest before serving sealed bytes.
- `guild_hall/shared/project_history_knowledge_projection.mjs` creates only
  explicit project/common held candidates, a derived graph view, and a
  metadata-only RAG preview. It requires an exact whole project ID, preserves
  canonical history chronology while requiring all five lanes, binds source
  attestation into projection identity, and verifies the complete persisted
  RAG index shape rather than accepting extra authority or raw-text aliases.

## Formal gate state

This executed pilot supplies stronger implementation evidence, but it does not
self-ratify the master plan's formal authorities. `P0`, `H00`, `H01-H05`,
`H06`, and `P1` remain HOLD until their owner acceptance route is completed.
No actual history or knowledge current pointer was advanced.

## Remaining production activation work

1. preserve the owner-stated received-mail and PLAUD live paths unchanged while
   closing their exact private authority, binding, freshness, coverage, cursor,
   replay, and writer-fencing evidence under the source-specific `HP-LIVE`
   gates;
2. complete `P0`, ratify H00 and the applicable H01-H06/P1 Shadow contracts and
   coverage, then complete P2-P4. If Slack becomes an applied source, H07A/H07B
   joins before P5; complete P5-P8 afterward in the master plan's fixed order
   without enabling a continuous collector, shared semantic-label writer,
   TaskDriver mutation, or a new production writer;
3. resolve D19/D26/D27/D33/D34 for the five unconnected sources, then run an
   independently approved P9 bounded canary for each applicable source. A
   canary PASS must not unlock another source or become a persistent collector;
4. verify the copied-DB projection, rollback, and DB/CSV/XLSX parity in P9
   before any authoritative ERP migration;
5. activate each approved source separately only at P10, after an HPP sole
   writer, old-writer fence, rollback, and manual failover/failback receipt;
6. issue per-person/per-agent access, mTLS and authorization policy before any
   LAN MCP listener or team download route is enabled;
7. review the held project/common candidates before source-text indexing,
   Google Drive canon publication, NotebookLM synchronization, or live RAG;
8. prove Mac mini monitor/fallback takeover and failback without two writers
   owning the same source lane.

## Stop line

No existing writer was stopped or replaced. No production DB, workspace,
junction, OneDrive tree, Google Drive canon, NotebookLM shelf, firewall,
scheduler, credential, LAN listener, or current pointer was changed. The next
step is source-specific evidence and formal gate closure. Production
writer/migration activation remains a later P10 boundary and requires a
separate explicit owner approval packet for each source or capability.
