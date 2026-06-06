# Daily Work Ledger Taxonomy v0

## Purpose

This document defines the owner-facing categories used by the daily work
ledger. It is about worklog classification, not raw source storage.

The goal is to let daily and weekly reports read prepared ledger entries
without rediscovering work from mail, git history, system logs, attachments, or
project files at report time.

## Top-Level Work Split

| Ledger group | Meaning | Default metadata surface |
| --- | --- | --- |
| Company project work | Real company work with a confirmed project code. | `_workmeta/<project_code>/daily_ledger/**` |
| Company general or unassigned work | Real company work without a confirmed project code, or intentionally project-less company work. | `_workmeta/P00-000_INBOX/daily_ledger/**` |
| Soulforge work | Work that develops, operates, or curates Soulforge itself. | `_workmeta/system/daily_ledger/<subledger_id>/**` |

`P00-000_INBOX` is company work. It is not the Soulforge system ledger and not a
personal, promotional, or non-work bucket.

## Soulforge Sub-Ledgers

Soulforge work must not collapse into one human-facing `system` bucket. The
storage owner remains `_workmeta/system`, but the daily ledger must carry one
of these sub-ledger ids.

| Sub-ledger id | Human label | Put work here when |
| --- | --- | --- |
| `system` | Soulforge system | The work changes how Soulforge itself operates: repo structure, public/private boundaries, validators, install/sync rules, schema contracts, or core operating rules. |
| `knowledge` | Soulforge knowledge | The work records, curates, routes, or reviews knowledge: source ledgers, source cards, NotebookLM/RAG metadata, knowledge wiki, graph, access ledgers, or "what knowledge was added". |
| `workflow` | Soulforge workflow | The work creates or changes `.workflow`, `.party`, workflow checks, handoff rules, party chains, or procedure templates. |
| `automation` | Soulforge automation | The work creates or changes recurring jobs, daily/weekly/monthly automation parties, night watch, report automation, scheduled collectors, or automation catalogs. |
| `ingress` | Soulforge ingress | The work changes intake from mail, PC activity, downloads, gateway, inbox, mailbox state, or external signals. |
| `skill` | Soulforge skill | The work creates or changes Codex skills, launcher skills, plugin bridges, skill mirrors, or skill validation. |
| `ui` | Soulforge UI | The work changes dashboards, operation boards, visual navigation, UI contracts, or rendered user surfaces. |
| `domain_cell` | Soulforge domain cell | The work creates or changes reusable domain cells such as SE, PCB, HWPX, PPTX, document, or research cells. |

These sub-ledgers are owner-facing ledger categories. They can be mapped to repo
surfaces, but they are not the same thing as a direct folder scan.

| Sub-ledger id | Typical repo surfaces |
| --- | --- |
| `system` | `README.md`, `CHANGELOG.md`, `docs/architecture/foundation/**`, `.registry/**`, `.unit/**`, `guild_hall/validate/**`, install/sync contracts |
| `knowledge` | `.registry/knowledge/**`, `guild_hall/knowledge_access/**`, `guild_hall/rag/**`, `guild_hall/knowledge_graph/**`, knowledge workflow outputs and source-ledger metadata |
| `workflow` | `.workflow/**`, `.party/**`, `.mission/**` when the mission package itself is being designed |
| `automation` | `guild_hall/night_watch/**`, `guild_hall/healer/**`, automation catalogs, recurring party rules, Codex app automation specs |
| `ingress` | `guild_hall/gateway/**`, `guild_hall/activity/**`, `guild_hall/workspace_junction/**`, intake/inbox/download/sync contracts |
| `skill` | `.registry/skills/**`, `guild_hall/codex_bridge/**`, local Codex skill launcher docs or mirrors |
| `ui` | `ui-workspace/**`, `docs/architecture/ui/**`, `guild_hall/snapshot/**`, `guild_hall/assistant_dashboard/**` |
| `domain_cell` | `.party/*_cell/**`, domain-specific workflow packages for SE, PCB, document, PPTX, HWPX, research, or similar cells |

## Classification Rules

1. If the work belongs to a confirmed company project, write it to that project
   ledger even when the tool used was Soulforge.
2. If the work is real company work but the project is unknown or intentionally
   project-less, write it to `P00-000_INBOX`.
3. If the work changes Soulforge itself, write it to a Soulforge sub-ledger
   under `_workmeta/system/daily_ledger/<subledger_id>/**`.
4. If a Soulforge task adds knowledge content or metadata, use
   `knowledge`.
5. If a Soulforge task changes how knowledge is stored, validated, routed, or
   displayed as infrastructure, use `system`, `workflow`, `automation`, or
   `ui` according to what actually changed.
6. If an entry could fit multiple Soulforge sub-ledgers, choose the sub-ledger that best
   describes the durable work product, then add secondary tags if the ledger
   schema supports them.
7. Personal, promotional, security-noise, billing-noise, subscription, and
   non-work items do not become `P00-000_INBOX` unless the owner explicitly
   marks them as company-admin work.
8. Ambiguous entries must be recorded as `review_needed` instead of being
   guessed into a project or Soulforge sub-ledger.

## Report Ordering

Daily and weekly worklog renderers should use this order:

1. Confirmed company projects.
2. `P00-000_INBOX` company general or unassigned work.
3. Soulforge sub-ledgers, in this order:
   `system`, `knowledge`, `workflow`, `automation`, `ingress`, `skill`, `ui`,
   `domain_cell`.
4. Explicit gaps and review-needed entries.

## Implementation Support

`guild_hall/daily_ledger/` provides the first validator and ledger-only
Markdown draft renderer for this taxonomy. The command reads explicit ledger
files or refs only, validates the metadata boundary, and reports missing or
incomplete ledgers as gaps instead of scanning mail, git history, system logs,
raw source refs, or `_workspaces` payloads at report time.

## Boundary

Ledger rows are metadata-only observations. They may point to metadata refs,
receipt refs, run refs, report refs, workflow ids, skill ids, or source-card
ids. They must not copy raw mail bodies, attachment payloads, Office/PDF/HWP
payloads, source text chunks, NotebookLM answers, private project file bodies,
secret values, credentials, sessions, cookies, or local absolute payload paths.
