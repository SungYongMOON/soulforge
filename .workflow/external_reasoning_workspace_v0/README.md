# External Reasoning Workspace v0

`external_reasoning_workspace_v0` is a public-safe draft workflow for using an
external ChatGPT browser session as an advisory reasoning workspace.

## Current State

- `output_state: pilot-executed`
- `validation_level: private_pilot_executed_browser_advisory`
- not registered in `.workflow/index.yaml`
- no canon-ready, production-ready, default-route-safe, or owner-approval claim
  is made
- private pilot evidence:
  `_workmeta/system/runs/external_reasoning_workspace_pilot_retry_20260607_172733KST/run_evidence/CHATGPT_PILOT_EXECUTION_PACKET.yaml`

## What It Owns

- Bounded Soulforge task goal and side-effect authorization binding.
- Chrome and ChatGPT preflight without cookie, token, password, local storage,
  `.env`, or credential inspection.
- Session-aware create-or-reuse policy for same-goal external ChatGPT chats.
- Visible user-authorized Pro / Thinking-like mode label selection without
  hard-coded unstable model names.
- Sanitized bounded prompt packets with marker or nonce.
- Assistant response readback through DOM message-role evidence.
- Default multi-turn advisory loop and continuation limits.
- Metadata-only private pointer refs for conversation/session continuity.
- Advisory handoff packet for the calling workflow.

## What It Does Not Own

- Source truth, validation verdicts, owner approval, or canon promotion.
- ChatGPT account authentication, subscription state, payment, security, or
  permission settings.
- File upload, share links, project creation, deletion, archive, or other
  destructive cleanup without explicit action-time approval.
- Raw private payloads, raw transcripts, account-bound conversation ids,
  cookies, local storage, tokens, credentials, or host-local absolute paths in
  public canon.
- Default route switching or default-route safety.

## Operating Summary

1. Bind the task goal, success condition, stop conditions, side-effect
   authorization, and public/private boundary.
2. Run Chrome and ChatGPT preflight by observing visible UI state only.
3. Reuse a matching same-goal conversation when an authorized private pointer is
   available; otherwise create a fresh bounded chat when authorized.
4. Select only a visible, user-authorized Pro / Thinking-like mode label.
5. Send a sanitized bounded prompt packet with a marker or nonce.
6. Read the assistant response from DOM message-role elements and verify the
   marker, role, completion, and answer shape.
7. Continue in the same conversation up to the default turn limit when context
   continuity matters.
8. Produce an advisory handoff packet and record only metadata/private pointer
   refs outside public canon.

## Default Limits

```yaml
default_max_turns: 3
extended_turns_allowed_when_user_authorized: true
continue_existing_session_first: true
```

## Stop Conditions

Stop or ask for owner approval when the browser flow encounters login recovery,
CAPTCHA, share-link creation, file upload, project creation outside the current
authorization, payment or subscription settings, permission changes, destructive
actions, secret requests, raw private payload requests, concurrent tab control,
or any attempt to treat ChatGPT output as validation authority.

## Public Storage Boundary

Public workflow files may contain portable repo-relative refs and packet shapes
only. Conversation URLs, project URLs, account-bound ids, transcript bodies, and
runtime observations belong only in owner-approved private metadata surfaces as
pointer refs when needed.

Source seed: `docs/architecture/guild_hall/EXTERNAL_REASONING_WORKSPACE_V0.md`.

## Pilot Evidence

On 2026-06-07, a bounded private pilot created a fresh ChatGPT conversation,
selected a visible Thinking extended label, sent the sanitized prompt packet,
observed response completion, and verified the required marker through
assistant-role DOM readback.

The pilot did not store a raw transcript, raw conversation URL, account-bound
identifier, secret, credential, cookie, browser storage, file upload, share
link, permission change, payment/account setting change, or destructive action.
The result is execution evidence only; it is not source truth, validation
authority, owner approval, registration, or default-route safety.
