# Owner Outlook Mail

Thin Codex launcher for owner-style Outlook manual mail drafting, exact
attachment application, registered inline signature insertion, and a separately
authorized send continuation through `.workflow/outbound_mail_authoring_v0`.

The launcher binds the workflow-owned v1 per-assignee public team context
template, including role-only recipients, requested work, notes, schedule,
participants, formats/examples, attachments, and response requirements. It may use
an optional local/private aggregate voice profile with provenance. It does not
own mail procedure, raw mail evidence, exact footer content, Outlook state,
standing external send authority, or broad Outlook mutation authority. When the
current user explicitly requests a local draft, the launcher preserves the
requested control surface: terminal/programmatic requests use only the local
programmatic executor and never fall back to UI or computer-control automation.
For an unspecified local Outlook draft request, it uses the safe local
programmatic executor after a non-mutating availability probe or stops with a
copy-ready draft.

Within the same bounded mail task, validated subject, recipient order, body
corrections, exact attachment, control surface, and logical signature remain
bound across short follow-ups together with the exact saved-draft identity. The
registered signature is inserted into the authored body, verified before save,
and never treated as a business attachment. A later separate current `보내줘`
instruction applies only to that exact locked draft: revalidate, perform one
send action, check the bounded delivery result, and never retry an unknown or
ambiguous outcome.

The complete v1 metadata stays fixed while the visible body adapts to the
message: compact, action brief, decision brief, status/change, or mapped reply.
Compact is reserved for pure sharing with no requested work, confirmation,
review, decision, or response. Any actionable request uses a structured brief
that visibly separates purpose, basis, requested work, completion/reply
criteria, follow-up, and attachments. Newly authored Outlook content explicitly
uses black text instead of inheriting a colored reply-thread style. Structured
tables use the workflow preset's bounded fixed width and wrap long cell text
instead of expanding to the Outlook window width. The executor verifies that
the applied width survives save, close, and reopen of the same locked draft.

The owner specialization also locks the newest corrections before rendering,
shows approved `수신/사유` lines at the top, rejects superseded wording, and
requires the local structured-request validator before Outlook application.
Synthetic evaluation is text/file-only and never creates or sends Outlook mail.

Installed skill name: `soulforge-owner-outlook-mail`.
