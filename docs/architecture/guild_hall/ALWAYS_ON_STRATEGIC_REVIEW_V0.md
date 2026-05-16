# Always-on Strategic Review v0

## Purpose

This document explains how a 24-hour Mac mini should pull Soulforge and run the
recurring review stack.

The stack has three separate jobs:

| Layer | Cadence | Owner surface | Purpose |
| --- | --- | --- | --- |
| `healer` | 30-60 minutes light, daily full | `guild_hall/healer/` | Deterministic repo and gateway self-checks. |
| `night_watch` | Daily | `guild_hall/night_watch/` | Operational drift, boundary, portability, and next-action review. |
| `ouroboros_strategic_review_harness_v0` | Weekly or owner-triggered | `.workflow/ouroboros_strategic_review_harness_v0/` | Vision alignment and owner-intent gap review. |

`healer` already exists. It is the lightweight always-on self-check surface, not
the strategic reviewer. Ouroboros sits above it and asks whether Soulforge is
still moving in the intended direction.

## Pull on the Mac mini

Use the 24-hour Mac mini as `always_on_node`. Keep this clone clean and avoid
normal development edits there.

```bash
git clone https://github.com/SungYongMOON/soulforge.git Soulforge
cd Soulforge
git checkout codex/high_perf_tool_01-workflow-optimization-20260515
git pull --ff-only

git clone https://github.com/SungYongMOON/soulforge-workmeta.git _workmeta
git -C _workmeta checkout main
git -C _workmeta pull --ff-only
```

After this branch is merged, the always-on clone should return to `main`:

```bash
git checkout main
git pull --ff-only
git -C _workmeta pull --ff-only
```

## First local verification

On macOS, use `npm`, not `npm.cmd`.

```bash
npm install
npm install --prefix ui-workspace
npm run validate:canon
npm run validate
npm run done:check
```

If the Mac mini is only doing always-on operations, do not commit or push from
that clone unless the task is explicitly about syncing private operating state.

## Healer smoke

Run the light healer once:

```bash
npm run guild-hall:healer:run -- --skip-validate --json
```

Run the full healer once:

```bash
npm run guild-hall:healer:run -- --json
```

Install or verify the launchd job set only on the Mac mini:

```bash
npm run guild-hall:always-on:render -- --local-root "$PWD" --json
npm run guild-hall:always-on:install -- --local-root "$PWD" --json
npm run guild-hall:always-on:verify -- --local-root "$PWD" --check-launchctl --json
```

The launchd set owns deterministic jobs such as healer light/full. It does not
replace Codex local automations.

## Daily night watch

`night_watch` remains the daily operating review lane. It should run only on
the active `always_on_node`.

```bash
npm run guild-hall:night-watch:preflight -- \
  --local-root "$PWD" \
  --workmeta-root "$PWD/_workmeta" \
  --private-state-root "$PWD/private-state"
```

The Codex app automation should use `NIGHT_WATCH_AUTOMATION_V0.md` as its
contract and write private reports under `_workmeta/system` or the relevant
project-local `_workmeta/<project_code>/`.

## Weekly Ouroboros review

Create a weekly Codex automation on the Mac mini that invokes:

```text
.workflow/ouroboros_strategic_review_harness_v0
```

Recommended settings:

| Field | Value |
| --- | --- |
| Cadence | Weekly, Sunday evening in the owner's local time. |
| Model | `gpt-5.5` |
| Reasoning | `xhigh` |
| Write target | Private `_workmeta/system` review packet first. |
| Public mutation | Not allowed during the review run. |
| Final state | `accepted`, `needs_revision`, `owner_decision_required`, or `blocked`. |

The weekly review should read:

- `docs/architecture/foundation/VISION_AND_GOALS.md`
- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`
- `.workflow/index.yaml`
- `.workflow/ouroboros_strategic_review_harness_v0/**`
- recent `_workmeta/system` reports

It should write:

- `vision_alignment_report`
- `owner_intent_gap_register`
- `ambiguity_ledger`
- `socratic_question_packet`
- `owner_question_queue`
- `next_focus_recommendation`
- `closure_restatement_note`

The reviewer must not turn uncertainty into canon by inference. If the missing
piece is answerable from repo evidence, it resolves it from the repo. If the
missing piece is owner intent, it asks a concrete owner question with a safe
default and 2-3 choices.

## Operating rule

Use this split:

```text
healer:
  Is the always-on node healthy?

night_watch:
  Did today's operating state drift?

ouroboros:
  Is the project still aligned with vision, and what owner-intent gaps need to
  become explicit constraints?
```

The 24-hour Mac mini is useful because these reviews need continuity. It should
keep the repo current, run deterministic checks, and produce private review
packets. It should not silently rewrite public canon, merge branches, or push
development commits on its own.
