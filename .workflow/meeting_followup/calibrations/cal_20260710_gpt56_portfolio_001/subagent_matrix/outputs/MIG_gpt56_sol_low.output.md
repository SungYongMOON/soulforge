formal_minutes:
  workflow_id: meeting_followup
  fixture_id: PUBLIC_MEETING_SMOKE
  meeting_title: UI Theme Package Release Readiness
  source_kind: synthetic_public_safe
  source_status: reconstructed_public_fixture_for_archive
  public_safe: true
  participants:
    - Minjun
    - Seoyeon
    - Doyun
    - Hara
  decisions:
    - The public release target is Friday at 15:00 KST, conditional on smoke passing.
    - Wednesday was an internal stretch goal, not the final public release date.
    - Hara's proposal to make smoke-theme-pack.mjs ignore a packageName mismatch was rejected.
    - The team will check the package configuration first and review the script only if the contract is wrong.
  risks:
    - A wrong generated tarball path could delay the release.
    - Stale README installation steps could mislead users.
  open_questions:
    - Who has release approval authority?
    - Should the release note mention the Wednesday stretch goal?
  unresolved_work:
    - README installation steps should be reviewed by Thursday if possible; no owner was assigned.
    - Hara will check the generated tarball path after Minjun posts smoke results; no exact deadline was assigned.
  external_parties: "None named."
  release_status: "Not approved or confirmed. Release remains conditional on smoke passing and approval authority is unresolved."

action_items:
  - action_id: PUBLIC_MEETING_SMOKE-A1
    owner: Minjun
    action: Rerun smoke.
    due: "Friday 10:00 KST"
    status: pending
  - action_id: PUBLIC_MEETING_SMOKE-A2
    owner: Doyun
    action: Write the failure triage note in action_items.md.
    due: "Friday 12:00 KST"
    status: pending
  - action_id: PUBLIC_MEETING_SMOKE-A3
    owner: Hara
    action: Check the generated tarball path after Minjun posts the smoke results.
    due: "No exact deadline assigned."
    dependency: PUBLIC_MEETING_SMOKE-A1
    status: pending
  - action_id: PUBLIC_MEETING_SMOKE-A4
    owner: unassigned
    action: Review the README installation steps.
    due: "Thursday, if possible; not a firm deadline."
    status: owner_required

followup_note:
  subject: "Follow-up: UI Theme Package Release Readiness"
  body: |-
    The public release target remains Friday at 15:00 KST, conditional on smoke passing. Wednesday was only an internal stretch goal and is not the final public release date.

    Minjun is assigned to rerun smoke by Friday at 10:00 KST. Doyun is assigned to write the failure triage note in action_items.md by Friday at 12:00 KST. After Minjun posts the smoke results, Hara will check the generated tarball path; no exact deadline was assigned for that check.

    The proposal to make smoke-theme-pack.mjs ignore a packageName mismatch was rejected. The agreed approach is to check the package configuration first and review the script only if the contract is wrong.

    The README installation steps should be reviewed by Thursday if possible, but this work has no assigned owner and Thursday is not a firm deadline.

    Current risks are that an incorrect tarball path could delay release and stale README installation steps could mislead users. Release approval authority remains unresolved, as does whether the release note should mention the Wednesday stretch goal.

    No customer or external partner was named. No release approval, successful smoke result, or completed action is claimed.
