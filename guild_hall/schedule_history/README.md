# External schedule history foundation

## Status

This package is a public-safe `canon_candidate` for H03B/D20/D26. It is
feature-OFF, synthetic-only, and pure in memory. It does not read Smartsheet,
files, project payloads, accounts, tokens, databases, or live source data. It
does not discover or create tasks and grants no H03 acceptance or D20/D25/D26
ratification.

## Boundary

`createScheduleSourceBinding()` requires exact typed refs for the schedule
owner, schedule, sole writer, project, and pinned adapter revision. The only
accepted mode is `source_mode: "synthetic_only"` with `activation: false` and
`live_authority: false`. Missing, `TBD`, unresolved, path-like, secret-like,
Smartsheet, production, or live/provider values fail closed. A future live
binding requires a separately reviewed contract; callers cannot turn this one
on.

The package never infers row identity from a label, name, date, time, path,
filename, or schedule contents. A caller must supply an owner-issued
`schedule_source_row` typed ref. The adapter derives a stable scoped
`schedule_row` ref from the exact owner, schedule, and source-row refs, so the
same local row token in two schedules does not collapse.

## Immutable revision flow

Each revision carries only typed metadata refs and canonical UTC observation
clocks:

- immutable `source_revision` and `event` refs;
- predecessor, supersession, and expected-current refs;
- a source-issued monotonic sequence;
- a `content` ref containing the owner-supplied canonical record digest; and
- a canonical full-record digest over the exact revision record.

The adapter does not define schedule row fields, timezone normalization, or
source canonicalization because D20 has not selected those authorities.
Synthetic tests use bounded objects only to demonstrate digest behavior.
Identical event replay is a no-op with a stable history digest. Reusing an event
or revision ref with different metadata, stale expected revisions, and
canonical-equivalent new revisions fail closed. Forward sequence gaps are
accepted only with an exact ordered gap range in the append receipt; the gap is
not silently converted to completeness.

## Coverage

The lane-local candidate receipt mirrors the H00 six-state matrix:

| state | event count | gap codes | applicability |
| --- | ---: | --- | --- |
| `complete_with_events` | at least 1 | empty | null |
| `complete_no_events` | 0 | empty | null |
| `partial` | exact nonnegative | non-empty | null |
| `failed` | null | non-empty | null |
| `not_collected` | null | non-empty | null |
| `not_applicable` | null | empty | required rule revision |

Before D25 ratification, gap codes must start with `synthetic_` and do not
claim a live vocabulary. Counts bind exact schedule/project/source scope,
`known_at` uses a half-open window, and the receipt hashes revisions in a
deterministic order. `HOLD` or a missing live binding must never be represented
as `complete_no_events`.

## Local verification

```powershell
node --test guild_hall/schedule_history/schedule_history.test.mjs
```
