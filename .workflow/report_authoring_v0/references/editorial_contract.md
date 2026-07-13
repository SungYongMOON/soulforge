# Report Authoring — Editorial Contract

This workflow-owned contract governs authoring and final polish. The launcher
skill does not own or override it.

Its public source-to-rule provenance is recorded in
[`editorial_research_basis.md`](editorial_research_basis.md). That provenance
supports the rules; it is not a style corpus or text-imitation target.

## Modes

- `final_polish` requires one `draft_report` only. Owner contract, source
  material, and semantic manifest are optional strengthening inputs. Their
  absence does not trigger an interview or block the mode. Ask one question only
  when two plausible edits would materially change meaning.
- `full_authoring` requires approved `source_material`. Interview only for a
  material gap that could change purpose, tested conditions, a protected field,
  applicability, conclusion/verdict, decision Ask, or a required owner field.
  Ask exactly one question, wait, update the gap register, and rescan. Unknowns
  become `unconfirmed` with a close condition.

## Adaptive report roles

Choose roles from report type and reader decision. Do not force one universal
section order or render an empty decorative role. The v0 `ReportDocument` encodes
one role per section and does not implement combined-role sections; keep every
required role as its own identifiable section.

| Type | Required roles |
| --- | --- |
| `experiment` | purpose; conditions/method; criteria/request items; results; discussion/limits; bounded conclusion/verdict; next actions; references/traceability |
| `analysis` | decision question/scope; method/assumptions; criteria/weights before alternatives; alternatives evidence; tradeoff discussion; conclusion/recommendation; decision Ask; references/traceability |
| `progress` | status summary; scope/baseline; milestones/actuals; deliverables evidence; issues/risks/dependencies; forecast; support/decision requests; next actions; references/traceability |
| `presentation` | title/context; body evidence; body-supported BLUF and Ask; minimum background; recommendation/next action; visible references/traceability |
| `other` | purpose/decision question; scope and evidence basis; findings/current state; interpretation/limits; bounded conclusion or decision status when supported; next action or explicit no-action state; references when used |

An executive summary is required for management, customer, or regulator readers.
For `other`, it is also required when the document has more than six sections and
optional for the exact six-role short internal form. Type-specific matrices may
require their own summary role. A pass/fail verdict is optional when no named
criterion exists.

## Pass order

1. `technical_content`: build or normalize the body and protect source-owned
   meaning. Do not optimize prose.
2. `evidence_logic`: check role fit and the path from evidence through
   interpretation, conclusion, recommendation, and decision Ask. Reopen
   technical review after any protected-field delta.
3. `derive_executive_summary`: derive each summary sentence from verified body
   claim IDs. Reject a sentence with no body claim path. A changed body claim
   invalidates every dependent summary sentence.
4. `final_polish`: improve grammar, organization, concision, and Korean
   practitioner tone without adding, deleting, weakening, strengthening, or
   rebinding protected meaning.
5. `reader_projection_and_verification`: project only reader-facing content,
   then run deterministic preservation, independent semantic verification, and
   boundary checks. Return a failure to the owning pass; do not patch it inside
   the verifier.

## Reader and audit surfaces

The reader deliverable contains report content and permitted owner-facing
document metadata only. It excludes workflow stages, prompts, gap-register
scaffolding, protected manifests, claim IDs, validator output, audit receipts,
reviewer work notes, and runtime paths.

Keep the structured document, claim/source maps, summary-derivation map,
authorized-change records, preservation audit, verifier result, and receipt as
separate audit artifacts. Legitimate report prose is never rejected merely
because it uses a word such as `workflow`, `semantic manifest`, or `AI detector`.

## Tone and meaning

Judge writing by reader need, clarity, precision, evidence, and professional
usefulness. There is no word blacklist, AI-detector score, detector-evasion
objective, fluency threshold, or document-level similarity gate.

- Give each sentence one primary report function.
- Keep conditions and qualifiers attached to the result they bound.
- Name actors when responsibility, provenance, or assurance matters; passive
  voice remains valid when the actor is unknown or irrelevant.
- Keep number, unit, comparator, uncertainty/tolerance, coverage basis, and
  condition together.
- Preserve negation, modality, attribution, technical terms, and explicit
  unknowns. Use causal wording only when causality is supported.
- State failures and limits directly. Make recommendations actionable only with
  source-owned actor, action, trigger/date, and close condition.
- Use complete sentences for reasoning. Noun-phrase endings are optional for
  headings, cards, and compact checklist bullets, not a body-wide rule.

Stop rather than invent a fact, number, citation, cause, role, comparison,
requirement, or verdict. Automated checks do not guarantee semantic equivalence.

`report_date` is nullable and must remain `null` when no source-owned date exists;
the reader renderer omits the metadata row. The final document's `project_code`,
`report_type`, and `audience` must exactly match the request. v0 has no trusted
classification authority, so output remains `private_work_product`. Draft-only
`final_polish` cannot exceed `claim_ceiling: observed` or claim a `complete` source
record. `public_safe` requires a future verified owner-contract classification
lane; a draft-only `complete` claim requires a future verified source lane.
