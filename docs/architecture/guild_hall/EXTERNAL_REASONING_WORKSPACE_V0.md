# External Reasoning Workspace v0

## Purpose

This note captures the public-safe operating direction for using an external
ChatGPT Pro / Thinking browser session as an advisory reasoning workspace for
Soulforge work.

It is a continuation handoff and workflow-candidate note, not a registered
workflow package.

## Current Decision

Use the external reasoning workspace as a separate support lane.

```text
long_thread_handoff_v0
  = manager, NIGHT_WORK_HANDOFF, delegation, validation, closeout

external_reasoning_workspace_v0 candidate
  = ChatGPT Pro / Thinking session, bounded prompt packet, multi-turn advisory loop,
    DOM readback, private URL pointer, side-effect boundary

dual_deep_research_v0
  = NotebookLM CLI-first source research plus Codex independent research comparison
```

Do not merge this browser loop into `long_thread_handoff_v0` as a core step.
The browser loop touches external account UI state and may create durable
objects such as ChatGPT chats or projects, so it needs its own boundary.

## Observed Capability

On 2026-06-07, a bounded runtime probe observed that a fresh subagent could:

- attach to an open Chrome ChatGPT tab;
- create a new ChatGPT chat;
- select a visible Thinking-like mode label;
- send one long prompt plus two follow-up turns;
- verify required marker strings through DOM message readback;
- recover a conversation URL;
- create a disposable ChatGPT project when only a project name was required.

This is only an observed runtime capability. It is not source truth, not owner
approval, not production readiness, and not default-route safety.

## Session Policy

Default behavior should be session-aware.

```text
same Soulforge task goal
  -> continue the existing ChatGPT conversation

new task goal, phase boundary, contamination risk, or inaccessible session
  -> create a new ChatGPT conversation from a fresh bounded packet
```

An active external reasoning session should carry at least:

```yaml
status: active
task_goal: "<bounded Soulforge task goal>"
conversation_url_ref: "<private metadata pointer, not public canon>"
project_url_ref: "<optional private metadata pointer>"
mode_label_observed: "<visible UI label, if selected>"
turn_count: 0
last_verified_marker: null
created_at: "<timestamp>"
last_used_at: "<timestamp>"
claim_ceiling: observed
```

The public repo must not store raw transcripts, account-bound conversation IDs,
project IDs, cookies, local storage, session data, credentials, or private
payloads. If a pointer is needed for cross-PC continuation, store it only in an
owner-only private continuity surface.

## Multi-Turn Loop

The loop should not be one-shot by default. It should continue the active
conversation while the same goal is still being investigated.

Recommended loop:

1. Send a bounded prompt packet with a marker or nonce.
2. Read the assistant response from message-role DOM, not from generic UI text.
3. Check required markers, answer shape, and missing pieces.
4. Ask a follow-up in the same conversation when context continuity matters.
5. Repeat until the acceptance condition passes or a stop condition fires.
6. Produce an advisory packet for the calling workflow.

Default limit:

```yaml
default_max_turns: 3
extended_turns_allowed_when_user_authorized: true
continue_existing_session_first: true
```

Stop if login, CAPTCHA, sharing, deletion, upload, payment, permission changes,
or secret/private source requests appear.

## Side-Effect Boundaries

Allowed without additional approval when already scoped by the user:

- open or claim the ChatGPT tab;
- create or reuse a test chat for the bounded task;
- send sanitized prompt packets;
- read assistant responses by DOM role;
- recover a URL as a private pointer.

Require explicit approval at action time:

- share link creation;
- file upload;
- project creation outside a disposable probe;
- invite or permission changes;
- deletion, archive, or destructive cleanup;
- account, subscription, security, or payment settings.

Default forbidden:

- cookies, local storage, password stores, session files, tokens, `.env`, or
  credential JSON inspection;
- copying raw private payloads or raw transcripts into public canon;
- treating ChatGPT answers as validation verdicts or source truth;
- multiple agents controlling the same Chrome tab at the same time.

## Cross-PC Resume

To resume on another owner PC:

1. Pull the public Soulforge repo and read this note.
2. Pull the owner-only continuity repo if available.
3. Locate the private external reasoning session pointer for the active task.
4. Open or claim the recorded ChatGPT conversation if the account session can
   access it.
5. Continue in that conversation only if the task goal still matches.
6. If the pointer is missing or stale, create a new conversation from a fresh
   sanitized resume packet.

Resume packet template:

```text
You are an external advisory reasoning workspace for Soulforge.
Use the prior public-safe decision only as advisory context.
Do not ask for secrets, private source text, account state, or raw transcripts.
Current task goal: <goal>
Known decisions: <public-safe decisions>
Question: <bounded question>
Required final marker: <nonce>
```

## Candidate Workflow Shape

If promoted later through workflow authoring, the likely package is:

```text
.workflow/external_reasoning_workspace_v0/
```

Minimum steps:

1. bind goal, scope, and side-effect authorization;
2. run Chrome/ChatGPT preflight without secret inspection;
3. create or reuse the active external reasoning session;
4. send bounded prompt packet with marker/nonce;
5. read back assistant response and URL pointer;
6. decide continue, summarize, or restart;
7. hand off advisory output to the caller workflow;
8. record boundary, retention, cleanup, and claim ceiling.

Creation or registration must go through `$soulforge-workflow-generator` and
then `$soulforge-workflow-check`. Until then this note is only a public-safe
candidate operating model.
