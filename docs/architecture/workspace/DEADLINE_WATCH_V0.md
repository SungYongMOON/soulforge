# Deadline Watch v0

## Purpose

`deadline_watch` is the project-local ledger for due dates that must keep
resurfacing until they are closed, held, cancelled, superseded, or snoozed.

It exists so the assistant can stop rereading mail history on every request and
instead watch a small, explicit register.

## Scope

This contract covers metadata-only deadline rows for:

- reply due dates;
- submission due dates;
- review or confirmation due dates;
- meetings and delivery dates that need follow-up;
- owner-entered deadline notes.

It does not store raw mail bodies, raw HTML, attachment payloads, secret values,
tokens, cookies, credentials, or original source files.

## Owner Boundary

Project-local ledgers are the source of truth:

```text
_workmeta/<project_code>/reports/deadline_watch/
  README.md
  deadline_register.csv
  reminder_event_log.jsonl
```

The unresolved inbox uses the same shape:

```text
_workmeta/P00-000_INBOX/reports/deadline_watch/
```

Cross-project dashboards, UI panels, and notification workers may read these
ledgers, but they must not become the source of truth.

## P00 Rule

`P00-000_INBOX` is the reserved company general/unresolved work code.

Rows stay in P00 when the item is real company work but the project is unknown,
route confidence is not strong enough, the work is intentionally project-less
company general work, or an owner decision is required. P00 rows move to a
project only after project ownership is confirmed. Personal, promotional, and
non-work rows must not be treated as P00 company work unless the owner
explicitly marks them as company-admin work.

## Register Fields

`deadline_register.csv` uses this header:

```text
deadline_id,project_code,source_kind,source_ref,subject_hint,action_type,due_at,due_text,confidence,status,owner_or_contact,completion_ref,next_nudge_at,last_nudged_at,nudge_count,snooze_until,claim_ceiling,raw_payload_copied,created_at,updated_at
```

Required field meanings:

| Field | Meaning |
| --- | --- |
| `deadline_id` | Stable row id. |
| `project_code` | Project code or `P00-000_INBOX`. |
| `source_kind` | `mail`, `owner_note`, `meeting`, `manual`, or `system`. |
| `source_ref` | Metadata pointer to candidate, event, report, or ledger row. |
| `subject_hint` | Short title or redacted subject hint. |
| `action_type` | `reply_due`, `submit_due`, `review_due`, `meeting`, `confirm`, `delivery`, or `follow_up`. |
| `due_at` | ISO date/time or date when deterministic. |
| `due_text` | Original date marker or text-only urgency marker. |
| `confidence` | `structured`, `subject_date`, `body_derived_needs_review`, `owner_confirmed`, or `text_only`. |
| `status` | Current row state. |
| `owner_or_contact` | Person, role, or contact text. |
| `completion_ref` | Sent mail, battle event, mission close, owner close, hold, or cancel pointer. |
| `next_nudge_at` | Next reminder candidate time. |
| `last_nudged_at` | Last reminder attempt time. |
| `nudge_count` | Reminder attempt count. |
| `snooze_until` | Manual or policy snooze boundary. |
| `claim_ceiling` | `observed`, `owner_confirmed`, `completed_by_evidence`, or `rejected_or_blocked`. |
| `raw_payload_copied` | Must be `false`. |
| `created_at` | Row creation timestamp. |
| `updated_at` | Last row update timestamp. |

Allowed `status` values:

```text
open,waiting,sent,blocked,done,cancelled,superseded,snoozed
```

## Reminder Event Log

`reminder_event_log.jsonl` is append-only metadata.

Allowed v0 event types:

- `ledger_initialized`
- `reminder_candidate_created`
- `reminder_candidate_suppressed`
- `manual_snooze`
- `manual_hold`
- `manual_close`
- `completion_ref_added`

Reminder events may point to a `deadline_id`, but they must not copy the raw
mail body, HTML, attachment payload, or secret-bearing values.

## Watchdog Reminder Preview

`deadline-watchdog-reminders` is a dry-run/manual-confirm surface. It reads
project-local `deadline_register.csv` files and creates Telegram-ready reminder
brief candidates for rows that are active, due soon or overdue, outside
cooldown, and under the max nudge count.

It does not write to the `town_crier` pending queue and does not send Telegram.
The default output is stdout. `--write-preview` writes only a metadata preview
under `_workmeta/system/reports/assistant_operating_roadmap/`.

package-clean 주장은 `guild_hall/gateway/deadline_watchdog_reminder.mjs` 가
`guild_hall/gateway/cli.mjs` 와 함께 tracked package 에 포함될 때만 가능하다.

Suppression rules:

1. `done`, `cancelled`, `superseded`, and `blocked` rows are not reminder candidates.
2. `snoozed` rows are suppressed while `snooze_until` is in the future.
3. `next_nudge_at` in the future suppresses the row.
4. `last_nudged_at` inside the cooldown window suppresses the row.
5. `nudge_count` at or above max count suppresses the row.
6. Rows outside the due window are suppressed.
7. Rows whose `raw_payload_copied` is not `false` are suppressed.

## Import Rules

V0 import is conservative:

1. Deterministic subject or `d_day` hints may create `observed` rows.
2. Exact project routes may write to that project ledger.
3. Real company work without a confirmed project route goes to
   `P00-000_INBOX`; ambiguous, personal, promotional, or non-work rows go to a
   review or skipped queue unless the owner explicitly marks them as company
   admin work.
4. Body-derived dates require separate owner-approved local-only policy.
5. Existing open actions without a deterministic due date remain open actions,
   not fake deadlines.

## Completion Rules

A row leaves active risk only when one of these is recorded:

- `status: done` with a `completion_ref`;
- `status: cancelled` with owner or superseding evidence;
- `status: superseded` with replacement ref;
- `status: snoozed` with `snooze_until`;
- `status: blocked` with owner decision needed.

UI hiding, candidate disappearance, or a one-shot notification does not count
as completion.

## Validation Expectations

Minimum checks:

```text
git diff --check
npm run validate:workmeta-payload
npm run guild-hall:gateway:deadline-watch:validate
npm run guild-hall:gateway:deadline-watch:reminders
```

The dedicated validator checks CSV header shape, project folder consistency,
allowed enums, terminal completion evidence, snooze evidence,
`raw_payload_copied=false`, event-log JSONL shape, and banned raw/secret
markers.

The reminder preview command reads only deadline-watch metadata fields and
prints owner-facing Korean brief candidates. It does not send Telegram or write
`town_crier` queue entries.

## V0 Due Observation Import

The first importer reads only `mail_work_priority` metadata:

```bash
node guild_hall/gateway/cli.mjs import-deadline-watch
```

Default mode is dry-run. It returns candidate rows but does not mutate project
ledgers. To write rows, the caller must pass `--apply`.

Applied writes are confined to the canonical repository `_workmeta` root:
`_workmeta/<project_code>/reports/deadline_watch/deadline_register.csv`.

Allowed v0 import inputs:

- `due_date`, `due_text`, `due_source`, and `deadline_confidence` from the
  priority projection;
- `candidate_id`, `mail_source_ref`, `subject`, `route_candidate`,
  `route_confidence`, `work_status`, and pointer-only `refs`;
- `boundary.raw_payload_copied=false`.

The importer rejects projections whose `schema_version`, `kind`, `entries`, or
root boundary do not match `mail_work_priority` v1.

V0 import skips:

- text-only urgency with no deterministic `due_date`;
- terminal work statuses;
- personal or promotional routes;
- rows whose boundary says raw payload was copied;
- exact project writes unless `route_confidence=exact`.
- body-derived or otherwise unsupported due sources.

Exact project routes write to that project only when applied. Review or
ambiguous work routes to `P00-000_INBOX`. Body-derived dates remain out of
scope until a separate owner-approved local-only policy exists.
