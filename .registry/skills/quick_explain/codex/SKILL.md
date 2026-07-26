---
name: soulforge-quick-explain
description: Summarize the current or named work in no more than 10 logical lines using only conclusion, completed work, remaining work, and one next action. Use when the user enters /짧게설명, explicitly invokes $soulforge-quick-explain, or asks for a very short status explanation, 핵심만, 짧게, 요약해서, or 10줄 이내. Do not use when the user asks for a detailed, visual, or exhaustive explanation.
---

# Soulforge Quick Explain

Explain existing evidence only. Do not rerun, investigate, or mutate the underlying work.

## Core Rules

- Use no more than 10 newline-delimited logical lines.
- Start immediately with `결론:` in the user's language; add no preamble.
- Follow with `완료:`, up to three completed items, `남은 일:`, up to three remaining items, and one `다음 행동:` line.
- Omit tables, Mermaid diagrams, long examples, implementation details, validation logs, and repeated caveats.
- Preserve critical uncertainty or stop boundaries with a short `미확인` or `승인 필요` label instead of inventing certainty.
- If the user requests detail, defer to the detailed explanation skill rather than expanding this output.

## Output Contract

Read [`references/mapping.md`](references/mapping.md) and enforce its line-count and boundary rules.
