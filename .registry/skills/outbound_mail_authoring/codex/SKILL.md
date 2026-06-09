---
name: soulforge-outbound-mail-authoring
description: "Use when Codex should run the Soulforge outbound mail authoring workflow for /outbound-mail: draft owner-style business email, resolve project mail keyword subjects, check mandatory signature/security footer, and prepare owner-approved send handoff without granting send authority by default."
---

# Soulforge Outbound Mail Authoring

Use this skill as a thin launcher for `.workflow/outbound_mail_authoring_v0`.

The workflow owns the actual drafting procedure, project keyword rules, footer
checks, approval gate, handoff templates, and boundary review. Do not re-create
the workflow body inside this skill.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Resolve `$soulforge-outbound-mail-authoring` or `/outbound-mail` to `.workflow/outbound_mail_authoring_v0`.
3. Read `.workflow/outbound_mail_authoring_v0/workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
4. Read `docs/architecture/workspace/MAIL_SEND_STYLE_POLICY_V0.md` before drafting.
5. Bind thread mode, mail kind, recipients, attachments, send surface, project metadata, and owner approval state.
6. For replies and forwards, preserve the existing thread subject.
7. For new project mail, use only a confirmed project mail keyword in the leading bracket. Do not use internal company project numbers or Soulforge project codes in the outgoing subject.
8. Draft concise owner-style Korean business mail using only provided or approved facts.
9. Check that final send handoff includes the owner signature block and company security notice block exactly once. If the exact footer source is unavailable, keep the result draft-only and mark footer confirmation needed.
10. Keep external sending blocked unless the current owner request explicitly approves recipients, subject, body, attachments or no attachments, send surface, and footer state.
11. Close with the workflow boundary review before claiming the run state.

## Boundary Rules

- Do not send, move, delete, mark, categorize, or edit Outlook mail from this launcher.
- Do not create or edit Outlook folders or rules.
- Do not read raw body text, raw HTML body, `.msg` files, `.eml` files, attachments, secrets, session state, or credential files unless a separate owner-approved payload workflow exists.
- Do not put project keyword tables, exact footer contact values, full security disclaimer text, project mail rows, runtime absolute paths, raw mail payloads, or private evidence into public tracked files.
- Do not claim pilot-executed, production-ready, default-route-safe, external send authority, or Outlook mutation authority unless separate workflow evidence and owner approval support that stronger claim.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the workflow linkage, output shape, footer handling, or validation checklist.
