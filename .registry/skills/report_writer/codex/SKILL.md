---
name: soulforge-report-writer
description: "Launch the fixed Soulforge report_authoring_v0 workflow for full authoring from approved source material or final polish of one supplied draft. Use for experiment, test, analysis, progress, presentation, or other decision-oriented reports; for conclusionless data dumps; or when the user invokes /report-writer. The workflow owns all editorial behavior. This skill only completes material-gap intake, prepares the exact request, coordinates fresh executor and independent verifier outputs, and calls the fixed runner."
---

# Soulforge Report Writer

Launch `.workflow/report_authoring_v0`; do not reproduce its editorial doctrine or
implement a renderer here.

## Launch

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Resolve `$soulforge-report-writer` or `/report-writer` to the exact workflow id
   `report_authoring_v0`. Read its `README.md`, `runtime_binding.json`, contracts,
   and workflow-owned references before producing stage output.
3. Select one mode:
   - `final_polish`: bind exactly one `draft_report` input. Source material, owner
     contract, and semantic manifest are optional strengthening inputs. Do not
     interview because an optional input is absent; ask one question only when a
     genuine ambiguity would change meaning.
   - `full_authoring`: bind approved `source_material`. Before preparing the
     request, apply the workflow interview protocol. Ask exactly one material-gap
     question at a time, rescan after each answer, and record an unknown as
     `unconfirmed` with a close condition. Skip the interview when no material gap
     remains.
4. Write the exact request JSON in `_workspaces` or an approved worksite, using
   the workflow-owned `templates/report_authoring_request.template.json` and
   request schema. The controller—not the user-facing form—issues each opaque
   payload ref, computes the exact byte hash and size, and keeps the ref-to-file
   binding in the runtime config. The request never contains inline bodies, host
   paths, prompts, commands, modules, plugins, or skill names. Prepare it with:

   ```powershell
   npm.cmd run guild-hall:workflow-runner -- prepare --request <absolute-request-json>
   ```

5. Retain the preparation packet and its bundle digest. Use the digest-bound
   finalize skeleton emitted by `prepare`; do not reconstruct a second finalize
   envelope from memory. Use a fresh author/executor context to produce every
   stage result named by the preparation packet. Validate each result with the
   fixed `validate` subcommand. Every CLI request/config/input filename is an
   absolute filesystem path; do not rely on the current working directory.

   ```powershell
   npm.cmd run guild-hall:workflow-runner -- validate --kind <fixed-kind> --input <absolute-result-json>
   ```

   The Node runner validates and orchestrates supplied results; it does not call a
   model or author the report.
6. Use a separate fresh verifier context to compare every hash-bound approved
   input with the final candidate. Keep its actor, run, and context identities
   distinct from the final rewriter, and do not give it the expected verdict or an
   author transcript. An unresolved difference blocks finalization.
7. Fill the emitted `authority_issue_config_skeleton` with the exact final-rewriter
   result, semantic-verifier result, and caller-declared distinct controller
   actor/run/context/attestation/process refs. Do not infer or invent any of those
   refs. The local issuer verifies exact request/bundle/result hashes and declared
   ref inequality only; it does not observe actor identity or operating-system
   process independence. Keep `local_context_separation_declared` and a null
   deployment attestation, then issue the
   canonical fixed-root authority record with:

   ```powershell
   npm.cmd run guild-hall:workflow-runner -- issue-authority --config <absolute-authority-json>
   ```

   Replace only the skeleton's declared fields, leave no placeholder or retained
   command output in the JSON, and use real RFC 3339 UTC date-times ending in `Z`.

   Retain the returned record digest. A deployment identity claim requires a
   different trusted deployment verifier and is not available through this local
   issuer.
8. Put the validated executor results and verifier result in the emitted finalize
   skeleton. Bind the returned authority-record digest; never hand-craft a record
   or treat different-looking strings as separation evidence. Then call:

   ```powershell
   npm.cmd run guild-hall:workflow-runner -- finalize --config <absolute-finalize-json>
   ```

9. Return the reader-facing Markdown/optional HTML refs separately from audit refs.
   Treat success as receipt-confirmed only.

## Boundaries

- The workflow owns adaptive report roles, body-derived summaries, meaning-based
  tone rules, semantic preservation, rendering, and receipts. Do not copy or
  override them in the skill.
- Store source bodies, drafts, stage payloads, and generated artifacts only under
  `_workspaces` or an owner-approved worksite. `_workmeta` receives receipt
  metadata only: pointers, hashes, sizes, status, validator counts, and provenance.
- Never invent a fact, number, citation, cause, role, or verdict. Preserve explicit
  limits and `unconfirmed` states.
- Preserve protected anchors and numeric/unit/citation surfaces exactly. v0 rejects
  unit conversion, citation renumbering, and protected-content movement because it
  has no executable authorized-change contract.
- Leave `report_date` null when the draft has no source-owned date. v0 output stays
  `private_work_product`; draft-only final polish is capped at `observed` and a
  `partial` or `unconfirmed` source record.
- Do not use a word blacklist, AI-detector score, or detector-evasion target.
- Default routing, owner approval, publishing, sending, and project-share writeback
  remain disabled. ERP calls the workflow/runner directly, never this skill.
- [`references/examples.md`](references/examples.md) is synthetic illustration
  only and is not runtime policy.
