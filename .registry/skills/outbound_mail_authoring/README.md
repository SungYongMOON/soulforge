# Outbound Mail Authoring Skill

This skill is a thin launcher for `.workflow/outbound_mail_authoring_v0`.

It routes mail drafting and pre-send review requests into the workflow that owns:

- owner-style Korean business mail drafting
- project keyword subject rules
- reply and forward subject preservation
- mandatory signature plus company security footer checking
- owner approval gate
- Outlook/manual or Soulforge send-mail handoff preparation
- metadata-only recording guidance

## Boundary

The skill does not own the workflow body, profile policy, project keyword truth,
footer template truth, Outlook state, SMTP secrets, attachments, or send
authority.

The launcher reads workflow files at runtime and keeps exact project keyword
tables, raw mail bodies, attachment payloads, exact footer contact values, and
full company security disclaimer text outside the public skill package.

## Installed Name

After sync, the Codex-facing skill name is:

```text
soulforge-outbound-mail-authoring
```
