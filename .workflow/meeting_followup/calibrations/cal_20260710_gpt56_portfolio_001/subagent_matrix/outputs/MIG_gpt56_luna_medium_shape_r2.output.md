{
  "formal_minutes": {
    "meeting_title": "UI Theme Package Release Readiness",
    "source_status": "Reconstructed public-safe synthetic fixture.",
    "decisions": [
      "The public release target is Friday 15:00 KST only if smoke testing passes.",
      "Wednesday is an internal stretch goal, not the final public release date.",
      "Package configuration will be checked first. The smoke script will be reviewed only if the contract is determined to be wrong.",
      "The proposal to make smoke-theme-pack.mjs ignore packageName mismatch was rejected."
    ],
    "risks": [
      "An incorrect tarball path could delay release.",
      "Stale README install steps could mislead users."
    ],
    "open_questions": [
      "Who has release approval authority?",
      "Should the release note mention the Wednesday stretch goal?"
    ],
    "non_claims": [
      "No customer or external partner was named.",
      "No additional owner, deadline, budget, security incident, production outage, or legal approval is established."
    ]
  },
  "action_items": [
    {
      "owner": "Minjun",
      "action": "Rerun smoke testing.",
      "deadline": "Friday 10:00 KST",
      "status": "assigned"
    },
    {
      "owner": "Doyun",
      "action": "Write the failure triage note in action_items.md.",
      "deadline": "Friday 12:00 KST",
      "status": "assigned"
    },
    {
      "owner": "Unassigned",
      "action": "Review the README install steps.",
      "deadline": "Thursday if possible",
      "status": "owner and exact deadline unassigned"
    },
    {
      "owner": "Hara",
      "action": "Check the generated tarball path after Minjun posts smoke results.",
      "deadline": "Not assigned",
      "status": "assigned"
    }
  ],
  "followup_note": {
    "subject": "UI Theme Package Release Readiness Follow-up",
    "body": "The current public release target is Friday 15:00 KST, conditional on smoke testing passing. Minjun is to rerun smoke by Friday 10:00 KST, and Doyun is to prepare the failure triage note by Friday 12:00 KST. Hara will check the generated tarball path after smoke results are posted. README install-step review remains unassigned and is suggested for Thursday if possible. Release approval authority and whether to mention the Wednesday stretch goal in the release note remain open questions."
  }
}
