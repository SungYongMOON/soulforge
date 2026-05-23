# Codex Account Bridge

`guild_hall/codex_bridge` wraps the installed `codex` CLI so Soulforge tools can
ask the currently logged-in Codex/ChatGPT account for bounded analysis without
storing an API key in the repo.

This is not a low-latency model API. It is a controlled agent bridge for work
that needs Codex-level reasoning after deterministic metadata tools have already
prepared a prompt or packet.

## Commands

Check whether the local Codex CLI is available and logged in:

```bash
npm run guild-hall:codex-bridge -- status
```

Run a bounded read-only Codex request:

```bash
npm run guild-hall:codex-bridge -- ask \
  --prompt "GraphRAG 노드 기준으로 탐지 카드에 보여줄 내용을 설명해줘" \
  --text
```

By default, `ask` uses:

- `codex exec`
- the existing Codex/ChatGPT login when available
- `--ephemeral`
- `--sandbox read-only`
- `--ask-for-approval never`
- repo-local output under ignored `guild_hall/state/tools/codex_bridge/`

## Boundary

- The bridge does not read `~/.codex/auth.json` or any credential file.
- The bridge does not require an OpenAI API key.
- The bridge should not run for hover tooltips or other high-frequency UI
  events.
- The bridge output is advisory. It is not source truth, owner approval,
  ontology acceptance, canon promotion, or validation evidence by itself.
- For graph work, deterministic CLI output such as `retrieval_plan` should
  prepare the small context first; Codex should explain or review that context.
