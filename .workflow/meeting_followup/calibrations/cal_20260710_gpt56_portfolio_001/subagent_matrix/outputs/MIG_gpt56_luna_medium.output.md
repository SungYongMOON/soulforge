# Formal Minutes

**Meeting:** UI Theme Package Release Readiness  
**Workflow:** `meeting_followup`  
**Fixture:** `PUBLIC_MEETING_SMOKE`  
**Source status:** Reconstructed public-safe synthetic fixture

## Discussion and Decisions

- Public release is targeted for **Friday at 15:00 KST**, conditional on smoke-test success.
- Wednesday was an internal stretch goal, not the final public release date.
- Hara’s proposal to make `smoke-theme-pack.mjs` ignore `packageName` mismatch was rejected.
- Decision: check the package configuration first; review the script only if the contract is determined to be incorrect.
- No customer or external partner was named.

## Risks

- An incorrect tarball path could delay release.
- Stale README installation steps could mislead users.

## Open Questions

- Who has release approval authority?
- Should the release note mention the Wednesday stretch goal?

# Action Items

| ID | Owner | Action | Due | Status |
|---|---|---|---|---|
| `ACT-001` | Minjun | Rerun smoke tests | Friday 10:00 KST | Open |
| `ACT-002` | Doyun | Write the failure triage note in `action_items.md` | Friday 12:00 KST | Open |
| `ACT-003` | Unassigned | Review README installation steps | Thursday, if possible | Open; owner and exact deadline unassigned |
| `ACT-004` | Hara | Check the generated tarball path after Minjun posts smoke results | Unassigned | Open; exact deadline unassigned |

## Release Condition

The public release target remains **Friday 15:00 KST only if smoke tests pass**. Release approval authority remains unresolved.

# Follow-up Note

Subject: UI Theme Package Release Readiness — Follow-up

The current public release target is Friday at 15:00 KST, conditional on smoke-test success. Wednesday was only an internal stretch goal.

The agreed approach is to check the package configuration first. The script should be reviewed only if the package contract is found to be incorrect; the rejected proposal to ignore `packageName` mismatch will not be applied.

Minjun is to rerun smoke by Friday 10:00 KST, and Doyun is to prepare the failure triage note in `action_items.md` by Friday 12:00 KST. README installation steps should be reviewed by Thursday if possible, but no owner is assigned. Hara will check the generated tarball path after Minjun posts smoke results; no exact deadline is assigned.

The remaining questions are who holds release approval authority and whether the release note should mention the Wednesday stretch goal.
