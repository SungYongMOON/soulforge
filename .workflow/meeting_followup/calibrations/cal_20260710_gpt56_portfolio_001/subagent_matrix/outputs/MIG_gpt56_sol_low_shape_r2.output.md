formal_minutes:
  meeting_title: "UI Theme Package Release Readiness"
  source_status: "Reconstructed synthetic public-safe fixture"
  participants:
    - Minjun
    - Seoyeon
    - Doyun
    - Hara
  decisions:
    - "The public release target is Friday at 15:00 KST, conditional on smoke passing."
    - "Wednesday remains an internal stretch goal and is not the final public release date."
    - "Hara's proposal to make smoke-theme-pack.mjs ignore a packageName mismatch was rejected."
    - "The package configuration will be checked first. The script will be reviewed only if the contract is wrong."
  discussion_notes:
    - "README installation steps should be reviewed by Thursday if possible; no owner was assigned."
    - "Hara will check the generated tarball path after Minjun posts the smoke results; no exact deadline was assigned."
  risks:
    - "An incorrect tarball path could delay the release."
    - "Stale README installation steps could mislead users."
  open_questions:
    - "Who has release approval authority?"
    - "Should the release note mention the Wednesday internal stretch goal?"
  boundaries:
    - "No customer or external partner was named."
    - "Release remains conditional on smoke passing."
    - "No budget, security incident, production outage, legal approval, additional owner, or unstated deadline is asserted."

action_items:
  - id: "AI-001"
    action: "Rerun smoke."
    owner: "Minjun"
    due: "Friday 10:00 KST"
    status: "Open"
  - id: "AI-002"
    action: "Write the failure triage note in action_items.md."
    owner: "Doyun"
    due: "Friday 12:00 KST"
    status: "Open"
  - id: "AI-003"
    action: "Check the generated tarball path after Minjun posts the smoke results."
    owner: "Hara"
    due: null
    dependency: "Minjun posts the smoke results."
    status: "Open; exact deadline not assigned"
  - id: "AI-004"
    action: "Review the README installation steps."
    owner: null
    due: "Thursday, if possible"
    status: "Unassigned; timing is tentative"
  - id: "AI-005"
    action: "Identify who has release approval authority."
    owner: null
    due: null
    status: "Open question; owner and deadline not assigned"
  - id: "AI-006"
    action: "Decide whether the release note should mention the Wednesday internal stretch goal."
    owner: null
    due: null
    status: "Open question; owner and deadline not assigned"

followup_note:
  subject: "Follow-up: UI Theme Package Release Readiness"
  body: |
    Team,

    The public release target is Friday at 15:00 KST, provided that smoke passes. Wednesday was an internal stretch goal only and is not the final public release date.

    We rejected the proposal to make smoke-theme-pack.mjs ignore a packageName mismatch. The agreed sequence is to check the package configuration first and review the script only if the contract is wrong.

    Minjun will rerun smoke by Friday at 10:00 KST. Doyun will add the failure triage note to action_items.md by Friday at 12:00 KST. After Minjun posts the smoke results, Hara will check the generated tarball path; no exact deadline was assigned. The README installation steps should be reviewed by Thursday if possible, but this item currently has no owner.

    The identified risks are an incorrect tarball path delaying release and stale README installation steps misleading users. Release must stop if smoke does not pass. Release approval authority remains unresolved, so approval should not be assumed. The team must also decide whether the release note should mention the Wednesday internal stretch goal.

    No customer, external partner, budget, security incident, production outage, legal approval, additional owner, or unstated deadline is implied by this follow-up.
