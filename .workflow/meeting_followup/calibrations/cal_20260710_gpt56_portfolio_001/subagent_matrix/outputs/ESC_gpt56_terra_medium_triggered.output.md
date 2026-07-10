{
  "formal_minutes": {
    "title": "UI Theme Package Release Readiness",
    "decisions": [
      "Public release target is Friday 15:00 KST, contingent on smoke passing.",
      "Wednesday remains an internal stretch goal, not the final public release date.",
      "The proposal to ignore packageName mismatch in smoke-theme-pack.mjs was rejected.",
      "Check package configuration first; review the script only if the contract is wrong."
    ],
    "risks": [
      "An incorrect generated tarball path could delay release.",
      "Stale README install steps could mislead users."
    ],
    "open_questions": [
      "Release approval authority is not identified.",
      "It is unresolved whether the release note should mention the Wednesday stretch goal."
    ]
  },
  "action_items": [
    {
      "owner": "Minjun",
      "action": "Rerun smoke.",
      "deadline": "Friday 10:00 KST"
    },
    {
      "owner": "Doyun",
      "action": "Write the failure triage note in action_items.md.",
      "deadline": "Friday 12:00 KST"
    },
    {
      "owner": "Unassigned",
      "action": "Review README install steps.",
      "deadline": "Thursday if possible",
      "status": "No owner assigned."
    },
    {
      "owner": "Hara",
      "action": "Check the generated tarball path after Minjun posts smoke results.",
      "deadline": "No exact deadline assigned."
    }
  ],
  "followup_note": "Release remains targeted for Friday 15:00 KST only if smoke passes. Minjun’s smoke rerun is due Friday 10:00 KST, followed by Doyun’s triage note by Friday 12:00 KST. The package configuration should be checked before any script review. README review and release approval ownership remain unresolved; Hara’s tarball-path check follows posted smoke results."
}
