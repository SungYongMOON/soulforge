# Owner Outlook Mail

Thin Codex launcher for explicitly selecting owner-style Outlook manual mail
drafting through `.workflow/outbound_mail_authoring_v0`.

The launcher binds the workflow-owned v1 per-assignee public team context
template, including role-only recipients, requested work, notes, schedule,
participants, formats/examples, attachments, and response requirements. It may use
an optional local/private aggregate voice profile with provenance. It does not
own mail procedure, raw mail evidence, exact footer content, Outlook state,
external send authority, or broad Outlook mutation authority. When the current
user explicitly requests a local draft, the launcher preserves the requested
control surface: terminal/programmatic requests use only the local programmatic
executor and never fall back to UI or computer-control automation.

The complete v1 metadata stays fixed while the visible body adapts to the
message: compact, action brief, decision brief, status/change, or mapped reply.
Compact is reserved for pure sharing with no requested work, confirmation,
review, decision, or response. Any actionable request uses a structured brief
that visibly separates purpose, basis, requested work, completion/reply
criteria, follow-up, and attachments. Newly authored Outlook content explicitly
uses black text instead of inheriting a colored reply-thread style.

Installed skill name: `soulforge-owner-outlook-mail`.
