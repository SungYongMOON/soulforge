# `mcp/` — the engine's one outside door (꺼져 있음 / off)

The MCP server that lets a person or an assistant ask the engineering engine questions. It holds no
rules and makes no judgement: every tool calls a pure function or a runner that already exists
elsewhere in this engine and returns the answer as markdown plus JSON.

**Status: built, off, and registered nowhere.** Turning it on is an Owner decision.

사람이 등록하고 쓰는 절차(준비물 · 클라이언트별 설정 예시 · 첫 호출 순서 · 역할별로 보이는 것 · 거절
코드 · 문제 해결)는 매뉴얼 **[12장 §12.A 등록·사용 안내](../manual/12_mcp_door.md#12a-등록사용-안내-사람용)**에
한국어로 있다. 설계 전체는 [12장](../manual/12_mcp_door.md), 다과제 배경은
[부록 B](../manual/appendix_b_multi_project_review_20260819.md), 접근 모델은 [09장 §9.1F](../manual/09_next_work_and_handoff.md).

```text
node engine_mcp_server.mjs --registry <abs project_registry.json> [--repo-root <abs>]
                           [--principal '{"principal_ref":"…","role":"…"}'] [--access-table <abs>]
node engine_mcp_server.mjs --profile  <abs project_profile.json>   # a registry of one
```

| Switch | Off | On |
| --- | --- | --- |
| `SOULFORGE_ENGINE_MCP` | one line, exit 3 | the door opens, read tools answer |
| `SOULFORGE_ENGINE_MCP_WRITE` | write tools are hidden from `tools/list` and refused | write tools run |

| File | What it is |
| --- | --- |
| `engine_mcp_server.mjs` | JSON-RPC 2.0 over stdio, hand-rolled; access decisions, receipts, locks |
| `project_registry.mjs` | 과제 명부 — which projects this door may serve (`…engine_project_registry.v0`) |
| `project_profile.mjs` | 과제 프로필 — one project's paths and rule layers (`…engine_project_profile.v0`) |
| `access_table.mjs` | 접근표 — roles × data classes × tools, fail-closed (`…engine_access_table.v0`) |
| `engine_context.mjs` | one project's disk, clock, cache, path budget and write lock |
| `engine_contexts.mjs` | one context per project code, LRU-capped |
| `paging.mjs` · `render.mjs` | `limit`/`cursor` pages · markdown for a person |
| `tools/` | 17 tools (13 read · 4 write); each one thin, each one classed |

Three rules this directory is built on. **No logic in a tool** — if a calculation is missing, it is
added to the pure layer first. **Fail-closed** — no principal means the public rule class only, an
undeclared role means nothing, an unclassed answer is treated as confidential. **Create-only** —
every write refuses rather than replaces, on every plane, inside the repository path budget.

```text
npm run validate:se-mcp     # 66 tests: profile 7 · registry 10 · access 15 · tools 22 · protocol 12
```

Never put a real project path, project code, or person into a file in this directory: the tests run
on synthetic fixtures in `docs/architecture/workspace/examples/se_stage_rules/`.
