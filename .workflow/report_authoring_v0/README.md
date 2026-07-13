# Report Authoring v0

Fixed-bundle workflow for authoring a report from approved source material or
polishing one supplied draft. The workflow owns editorial behavior, adaptive report
roles, body-derived summaries, semantic preservation, reader projection, rendering,
and metadata-only receipts. The `report_writer` skill is only a launcher.

## Status

- Workflow package: registered in `.workflow/index.yaml`
- Fixed runtime lane: candidate; one real Korean `final_polish` pilot completed
  through prepare, independent semantic verification, authority issue, finalize,
  metadata-only receipt adoption, and exact replay on 2026-07-14
- Short invocation alias: `/report-writer`
- Default route: no
- Fresh Builder/Verifier result: accepted for the candidate pilot surface with
  P0/P1/P2 = 0/0/0; this is not deployment calibration or promotion authority
- Claim ceiling: the completed draft-only pilot remained `private_work_product`,
  `observed`, and `partial`; not production-ready or publishable

Registration names the reusable workflow package; it does not grant runtime maturity,
source truth, approval, publish, send, or default-route authority.

## Modes

- `full_authoring`: requires approved `source_material`. Before request preparation,
  interview only for a material gap. Ask exactly one question, wait, update the gap
  register, and rescan. Unknowns become `unconfirmed` with a close condition.
- `final_polish`: requires one `draft_report`. Owner contract, source material, and
  semantic manifest are optional strengthening inputs. Their absence does not block
  the mode or trigger an interview.

Report type is independently selected as `experiment`, `analysis`, `progress`,
`presentation`, or `other`. Each type uses a minimum role matrix plus material
optional roles. Omit roles with no supported content instead of repeating facts,
inventing placeholders, or forcing empty decorative headings.
Short `internal_review` progress reports use a compact status / issue / next-action
minimum. Their status block is source-owned body content and may carry the scope,
actual result, and current decision status once; separate baseline or milestone
sections require distinct comparison material.

## Editorial and verification order

1. Validate the exact request, binding digest, and hash-bound opaque input refs.
2. Build or strengthen a protected-claim baseline.
3. Draft/normalize the body and run separate technical-content and evidence-logic
   reviews.
4. Derive each executive-summary sentence from verified body claim IDs.
5. Run final polish using reader need, evidence, and meaning-based rules—never a
   word blacklist, AI-detector score, or detector-evasion target.
6. Project the reader surface separately from audit artifacts.
7. Run deterministic preservation and a fresh independent semantic verifier whose
   actor, run, and context differ from the final rewriter.
8. Validate and render canonical Markdown plus requested optional HTML, then adopt
   the metadata-only receipt before reporting success.

Automated checks do not guarantee semantic equivalence. Independent human review
and owner approval remain required before publishable or production-ready use.

## Fixed CLI path

The launcher or a future approved worker adapter uses the same fixed surface:

```powershell
npm.cmd run guild-hall:workflow-runner -- prepare --request <absolute-request-json>
npm.cmd run guild-hall:workflow-runner -- validate --kind <fixed-kind> --input <absolute-json>
npm.cmd run guild-hall:workflow-runner -- issue-authority --config <absolute-authority-json>
npm.cmd run guild-hall:workflow-runner -- finalize --config <absolute-finalize-json>
```

`prepare` emits the required stage-output names, current contract pointers, trusted
binding digest, an authority-issue skeleton, and an exact digest-bound finalize
skeleton. The local authority issuer accepts exact author/verifier results and
caller-declared distinct controller/execution refs, writes a canonical hash-named
record in the fixed system worksite, and reports
`local_context_separation_declared`. It verifies exact request/bundle/result hashes
and declared-ref inequality; it does not observe actor identity, operating-system
process independence, or deployment separation and cannot manufacture a deployment
attestation. The controller issues
opaque input refs and binds them to exact file hashes and sizes; the browser or user
does not supply runtime paths, hashes, prompts, or model controls. A fresh
author/executor produces the structured stage results; a separate fresh verifier
checks every approved input against the final candidate. Fixed authority/pass
records bind those executions before `finalize` validates and adopts the prepared
results. Different-looking caller strings are not identity evidence. The Node
runner does not call a model or accept a caller prompt, command, module, plugin,
installed skill, or arbitrary entrypoint.

ERP integrations call the workflow/runner directly, never the Codex launcher skill.

## Owner references

- Editorial behavior: `references/editorial_contract.md`
- Material-gap interview: `references/interview_protocol.md`
- Technical-content review: `references/technical_content_review.md`
- Evidence/decision logic: `references/evidence_logic_review.md`
- Meaning-based polish: `references/final_polish_policy.md`
- Protected semantics: `references/semantic_preservation_policy.md`
- Public research provenance: `references/editorial_research_basis.md`
- Request construction aids: `templates/README.md`
- Human-facing guidance: `docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md`
- Artifact/storage contract: `docs/architecture/workspace/SOULFORGE_REPORT_FORMAT_V0.md`

## Storage and authority boundary

- Source bodies, drafts, structured stage payloads, and generated report/audit
  artifacts live under `_workspaces` or an owner-approved shared worksite.
- `_workmeta` receives receipt metadata only: opaque pointers, hashes, sizes,
  media types, status, validator counts, provenance, and stop/error codes.
- Reader deliverables exclude manifests, claim IDs, gap registers, validator output,
  receipts, runtime paths, and reviewer working notes.
- Facts, numbers, citations, causes, roles, and verdicts remain owner/source truth.
- `report_date` is nullable. When no source-owned date exists, it remains `null` and
  the Markdown/HTML reader metadata row is omitted rather than invented.
- v0 preserves protected anchors and numeric/unit/citation surface forms exactly.
  Unit conversion, citation renumbering, and protected-content movement require a
  future explicit authorized-change contract and are rejected in this revision.
- v0 has no trusted content-classification authority, so every adopted document is
  `private_work_product`. A draft-only `final_polish` result is capped at
  `claim_ceiling: observed` and `source_record_status: partial|unconfirmed`.
- Default routing, approval, external send, and project-share writeback remain off.
