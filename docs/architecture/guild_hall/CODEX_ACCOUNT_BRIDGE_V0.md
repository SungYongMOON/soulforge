# Codex Account Bridge v0

## Purpose

The Codex account bridge lets Soulforge call the installed `codex` CLI for
bounded analysis using the current Codex/ChatGPT login. It exists for cases
where the owner wants Codex reasoning without configuring an API key.

## Position

Use the bridge after deterministic tools have prepared a compact request.

Recommended split:

1. Deterministic CLI prepares metadata, graph candidates, or a review packet.
2. Codex bridge explains, reviews, or turns that packet into owner-readable
   guidance.
3. Any implementation, source promotion, ontology change, or owner decision
   remains outside the bridge result until normal Soulforge review gates run.

## Supported Surface

- Command: `npm run guild-hall:codex-bridge -- status`
- Command: `npm run guild-hall:codex-bridge -- ask --prompt <prompt>`
- Underlying command: `codex exec`
- Default execution posture: ephemeral, read-only, never ask for approvals.

## Boundaries

- The bridge does not read, copy, or summarize credential files.
- The bridge does not require or store an OpenAI API key.
- The bridge is not a browser/UI hover backend.
- The bridge is not a low-latency chat completion API.
- The bridge result is advisory and cannot claim source truth, owner approval,
  ontology acceptance, canon promotion, validation pass, or production readiness
  by itself.

## Knowledge Graph Use

For the knowledge graph preview, the preferred flow is:

1. Use `retrieval_plan` to create deterministic candidate nodes, relation paths,
   missing evidence, and next actions.
2. Use `guild-hall:knowledge-graph -- review` when the owner asks for deeper
   relation-candidate review from the Codex bridge. This command defaults to
   `gpt-5.5` and sends only the compact metadata plan.
3. Keep hover cards and basic 탐지 카드 rendering local and deterministic.
4. Keep source text loading, NotebookLM output, and final RAG answer generation
   in separate sourcebound workflows.
