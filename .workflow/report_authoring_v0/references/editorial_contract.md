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
  become `unconfirmed` with an impact and close condition. Every protected
  `unconfirmed` invariant uses the same ID as its `unconfirmed_items` register
  entry; an in-body unknown without that traceable register entry is invalid.

## Adaptive report roles

Choose roles from report type and reader decision. Do not force one universal
section order or render an empty decorative role. The v0 `ReportDocument` encodes
one role per section and does not implement combined-role sections. Keep each
minimum role as its own identifiable section; add an optional role only when the
approved input supports material content for it. Do not fill an absent role by
repeating another section or writing a decorative "none provided" placeholder.

| Type | Minimum required roles |
| --- | --- |
| `experiment` | purpose; conditions/method; results; discussion/limits; bounded conclusion/verdict; next actions |
| `analysis` | decision question/scope; method/assumptions; alternatives evidence; tradeoff discussion; conclusion/recommendation; decision Ask/next actions |
| `progress` | internal review: status; issues/risks/dependencies; next actions. Other audiences: status; scope/baseline; milestones/actuals; issues/risks/dependencies; next actions |
| `presentation` | title/context; body-supported BLUF and Ask; body evidence; recommendation/next action |
| `other` | purpose/decision question; scope and evidence basis; findings/current state; interpretation/limits; bounded conclusion or decision status when supported; next action or explicit no-action state; references when used |

Criteria/weights, deliverables, forecast, support requests, minimum background,
and references/traceability are optional when material. Omit them when the input
does not support distinct reader-useful content. If the omission itself is a
decision-critical gap, record that gap as unconfirmed instead of manufacturing a
section.

For a short `internal_review` progress report, `status_summary` is the primary
current-state body section, not a derived summary. It may state the inspected scope,
actual result, and source-owned decision status together when those facts are needed
to explain the current state. Do not duplicate those claims in separate
`scope_baseline` or `milestones_actuals` sections. Add either extended role only when
it contains distinct reader-useful material such as a named plan baseline or a
multi-milestone comparison. This compact form must not create filler merely to meet
a role count. The exact three-role compact form omits summary derivation; its status
section remains verified body content and must not be removed from the body-claim
projection.

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

Keep the structured document, unconfirmed-item register, claim/source maps,
summary-derivation map, authorized-change records, preservation audit, verifier
result, and receipt as separate audit artifacts. The reader renderer does not append
the unconfirmed register as a second section: the body states each reader-relevant
unknown and its supported next action once. Legitimate report prose is never rejected merely
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
