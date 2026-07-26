# Quick Explain Mapping

## Soulforge Mapping

- Canon skill id: `quick_explain`
- Canon linkage: `.registry/skills/quick_explain/skill.yaml`
- Installed invocation: `$soulforge-quick-explain`
- Owner-facing invocation alias: `/짧게설명`
- Detailed counterpart: `$soulforge-easy-explain`

## Output Shape

Use at most 10 newline-delimited logical lines:

```text
결론: <one sentence>
완료:
- <item 1>
- <item 2>
- <item 3>
남은 일:
- <item 1>
- <item 2>
- <item 3>
다음 행동: <one action>
```

Use fewer lines when fewer facts exist. Never exceed the limit by adding a preamble, source list, validation appendix, or closing note.

## Selection Rules

- Use the latest bounded work unless the user names another target.
- Keep only the three completed and three remaining items most important to the owner's next decision.
- If evidence is unavailable, write `미확인` briefly; do not investigate merely to fill the format.
- If the user asks for a full structure, file tree, diagram, or omission-free explanation, use `easy_explain` instead.

## Boundary

- Explanation does not authorize tool calls, file changes, messages, approvals, promotion, or publication.
- Do not reveal secrets, private payloads, personal information, or raw source bodies.
- Do not claim a command ran, a state changed, or validation passed unless current evidence supports it.
