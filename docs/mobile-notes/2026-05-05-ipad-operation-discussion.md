# iPad / Mobile Operation Discussion Notes — 2026-05-05

## Status

- Type: mobile discussion capture
- Scope: idea / operating model note
- Canonical status: not canonical
- Intended promotion path: may later become a formal operation model under `docs/architecture/**` after review

## Why this note exists

This note captures a discussion about whether iPad, phone, Telegram, GitHub, and ChatGPT can form a useful mobile operation surface for Soulforge work.

The goal is not to move all source data into GitHub. The goal is to let mobile devices inspect progress, receive notifications, and prepare next instructions while the real work continues on a laptop, cloud storage, local workspace, or owner-only private surfaces.

## Working assumption

Mobile devices are not the primary development environment.

They are better treated as:

- a progress cockpit
- a discussion and planning surface
- a commit / PR / issue review surface
- a place to ask ChatGPT to read GitHub state and summarize progress
- a place to prepare the next Codex or laptop instruction

## Proposed operating loop

```text
laptop / Codex work
  -> validate or done-check when possible
  -> public-safe summary
  -> commit / push to GitHub
  -> Telegram notification when useful
  -> phone / iPad asks ChatGPT to inspect latest commit, PR, or issue
  -> ChatGPT summarizes progress, risk, and next actions
  -> next laptop / Codex instruction is prepared
```

## Important boundary

Do not require all data to be uploaded to the public GitHub repository.

Public GitHub should contain:

- public-safe code
- public-safe documentation
- public-safe examples
- issues / PRs / commit messages
- optional handoff notes that contain no private or raw project data

Public GitHub should not contain:

- `_workspaces/**` actual project files
- `_workmeta/**` owner-only project metadata or run truth
- `guild_hall/state/**` runtime state
- `private-state/**`
- `.env`, token, cookie, session, key, password, or raw mailbox state

## Mobile usage model

A phone or iPad does not need to open the GitHub app directly.

A practical flow is:

```text
User: 방금 push한 soulforge 최신 커밋 확인해줘.
ChatGPT: GitHub commit / PR / issue를 읽고 진행상태를 요약한다.
User: 다음에 Codex에게 뭐라고 시킬지 만들어줘.
ChatGPT: 다음 실행 프롬프트를 만든다.
```

This keeps the mobile device as a command and review surface rather than a full source-code workspace.

## Useful mobile requests

- 최신 main 커밋 기준으로 어디까지 진행됐는지 요약해줘.
- 이 커밋이 public/private 경계를 깨는지 확인해줘.
- PR 내용을 읽고 다음 액션 3개로 정리해줘.
- 이 변경을 기준으로 Codex에게 줄 다음 프롬프트를 만들어줘.
- 이 작업이 public-only인지 owner-with-state인지 분류해줘.

## Candidate future surfaces

These are not decisions yet. They are candidates to evaluate later.

- `HANDOFF_PUBLIC_LATEST.md`
- mobile-safe latest status note
- Telegram notify summary for work completion / failure / mail arrival
- GitHub issue or PR comment as handoff surface
- snapshot-based mobile operation board

## Current preference from discussion

Because this is still an idea capture and not an architecture decision, this note is intentionally stored outside `docs/architecture/**`.

The chosen test location is:

```text
docs/mobile-notes/2026-05-05-ipad-operation-discussion.md
```

If the idea becomes stable, it can later be promoted into a formal document such as:

```text
docs/architecture/workspace/MOBILE_OPERATION_MODEL_V0.md
```

or a guild-hall specific document if the focus becomes Telegram / notify / gateway behavior.

## Open questions

1. Should mobile notes remain date-based discussion captures, or should they be periodically summarized into a stable operation model?
2. Should a public-safe handoff note be committed at the end of each laptop work session?
3. Should Telegram notify start with only three event types: work complete, failure, and mail arrival?
