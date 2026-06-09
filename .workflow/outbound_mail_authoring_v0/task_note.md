# Task Note - Outbound Mail Authoring v0

## Source Request

The owner asked for a reusable mail-sending rule and style surface so Codex can
draft mail as the owner would write it, with project keyword subject rules and a
mandatory signature plus security footer.

## Bounded Goal

Create a public-safe workflow that:

- reads the mail style policy
- resolves project mail keywords without exposing internal project numbers
- drafts concise owner-style Korean business mail
- checks mandatory signature and company security footer handling
- gates send authority on explicit owner approval
- prepares metadata-only recording guidance

## Boundaries

- No external send authority by default.
- No Outlook folder, rule, move, delete, mark-read, category, or send-button
  mutation.
- No raw mail body, raw HTML, `.msg`, `.eml`, attachment payload, secret, or
  credential storage.
- No public storage of exact footer payload, contact values, or full company
  security disclaimer text.
- Project keyword truth remains project-local/private or owner-approved.

## Output State

Registered structure-only workflow after `.workflow/index.yaml` registration
and validator pass. No pilot execution or production-ready claim is made.
