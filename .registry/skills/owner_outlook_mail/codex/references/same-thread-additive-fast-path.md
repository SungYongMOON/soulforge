# Same-thread Additive Fast Path

Use this local route when the owner asks to add one to three facts to a reply
draft for one exact previously Sent message.

## Admission

Require all of the following before any model call:

- reply mode and additive-follow-up operation
- one exact Sent item or exact local `.msg`
- one to three locked facts
- unchanged subject, ordered recipients, attachments, and signature policy
- available source-layout signature
- current explicit request for one unsent Outlook draft

Return `HOLD` when any condition fails. Do not silently select new-mail or full
structured authoring.

## Roles

- The team lead or higher-reasoning model owns technical judgment and fact
  locking.
- Gemini 3.6 Flash Low writes only bounded natural Korean prose slots, once,
  with zero retries.
- The fixed runner owns exact-source rebinding, ReplyAll, WordEditor insertion,
  automatic-signature preservation, save-close-reopen, and `Sent=false`
  verification.

The visible mail style comes from the exact source message. It does not come
from a project-specific KVDS exemplar and does not use the generic structured
request layout.

## Local Connector

Run the file-only self-test before the first live use on a PC:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/invoke_same_thread_additive_fast_path.ps1 `
  -SoulforgeRoot <current Soulforge root> `
  -ContractSelfTest
```

For an owner-approved live unsent-draft request, give the same connector the
locked packet, deterministic route request, runtime-private exact source
binding, unique private run root, and the locally approved Antigravity
executable. Add `-ArmDraft`.

Do not print or persist addresses, raw body text, StoreID, EntryID, signature
content, or secrets. Do not call `.Send()`.

If verification fails after the draft was first saved, remove only that exact
newly created failed item from Drafts. Record cleanup success in the private
receipt. If Outlook refuses cleanup, return a private manual-cleanup-required
state and never report success. Replace the saved-draft lock with an explicit
`usable: false` failure tombstone; retain private item identifiers only when
manual cleanup is required.

## Stop Conditions

- local private bridge absent or self-test failing
- classic Outlook not already running
- source identity, Sent state, subject, recipients, or attachment scope differs
- automatic signature or visual fingerprint unavailable
- layout continuity or save-close-reopen verification fails
- elapsed time exceeds 30 seconds
- any request to change the public/default route beyond this owner-approved
  local connector
