# Field Failure and Corrective Action Source Packet v0

- `domain_engine_id`: `field_failure_corrective_action`
- `status`: `candidate_source_packet`
- `claim_ceiling`: `source_supported` at most
- `source_adoption`: `false`
- `project_applicability_approval`: `false`
- `quality_disposition_approval`: `false`
- `technical_change_approval`: `false`
- `case_closure_approval`: `false`

This public-safe packet is implementation input for a deterministic evidence-readiness engine.
It contains compact paraphrases and source locators, not source bodies, regulated project
records, protected standards, RAG answers, or legal/compliance advice.

## 1. Directly verified source inventory

| ID | Official source and current basis | Access / owner | Chosen bounded use | Applicability state |
| --- | --- | --- | --- | --- |
| `S1-NRC-10CFR50-APPB` | *10 CFR Part 50, Appendix B — Quality Assurance Criteria for Nuclear Power Plants and Fuel Reprocessing Plants*. The eCFR Title 10 view stated it was up to date and last amended on 2026-08-21; reviewed 2026-08-26. [Official eCFR view](https://www.ecfr.gov/current/title-10/chapter-I/part-50/subject-group-ECFR89aa6ca4aada73c/appendix-Appendix%20B%20to%20Part%2050) | Public HTML; the eCFR identifies the content as authoritative but unofficial, with NRC as the issuing program owner. | Criteria III, VI, XV, XVI, XVII, XVIII only. | `UNKNOWN/HOLD` unless an exact nuclear/project binding establishes scope. |
| `S2-NRC-10CFR21` | *10 CFR Part 21 — Reporting of Defects and Noncompliance*. The eCFR Title 10 view stated it was up to date and last amended on 2026-08-21; reviewed 2026-08-26. [Official eCFR view](https://www.ecfr.gov/current/title-10/chapter-I/part-21) | Public HTML; eCFR current-view boundary as above. | §§21.21 and 21.51 only, as a sector-specific intake/evaluation/reporting-record example. | `UNKNOWN/HOLD` unless an exact NRC-regulated project binding establishes scope. |
| `S3-FDA-QMSR-2026` | FDA *Quality Management System Regulation (QMSR)* page, updated 2026-02-02; it states the QMSR became effective 2026-02-02 and incorporates ISO 13485:2016 by reference. [FDA source](https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr) | Public FDA page; the incorporated ISO body is protected/read-only and was not accessed. | Negative boundary only: no current ISO/QMSR clause is converted into an FFCA rule. | `HOLD` for all medical-device project use until source, scope, and licensed-body authority are separately resolved. |

### Revision and access rule

1. The engine accepts only a non-floating `source_revision_ref` for each listed source.
2. A later eCFR or FDA view must be reviewed as a new candidate binding; it cannot silently
   revise an existing project assessment.
3. Public access does not establish contract, regulatory, product, organization, or project
   applicability.
4. The ISO 13485 body and any other paid or controlled standards are excluded. Their absence
   produces `UNKNOWN/HOLD`, never a surrogate rule.

## 2. Direct source derivation

| Candidate rule | Source locator | Public-safe paraphrase used by the engine | Preserved limit |
| --- | --- | --- | --- |
| `FFCA-INTAKE-01` | S1 Criterion XVI; S2 §21.21(a) | Sector examples identify/evaluate adverse conditions or deviations before an applicable reporting branch. | No generic reporting deadline or regulator notification is inferred. |
| `FFCA-CONTAIN-01` | S1 Criterion XV | Control records for nonconforming items can prevent inadvertent use and preserve identification, documentation, segregation, notification, and an external disposition route. | The engine does not select, validate, or approve disposition, repair, rework, acceptance, or rejection. |
| `FFCA-RCA-01` | S1 Criterion XVI | The significant-condition branch names cause determination and corrective action to preclude repetition. | Significance and applicability are not inferred from an intake label. |
| `FFCA-ACTION-01` | S1 Criterion XVI; S2 §21.21(d)(4)(vii) | A corrective action can be represented with an action reference, responsible organization, and completion horizon. | Presence of an owner reference never grants owner authority or proves completion. |
| `FFCA-EFFECT-01` | S1 Criterion XVIII | Follow-up and re-audit give a source-supported place for effectiveness-review evidence. | No universal effectiveness metric, audit result, or compliance conclusion is asserted. |
| `FFCA-RECURRENCE-01` | S1 Criteria XVI and XVIII | Recurrence review can be held as candidate follow-up evidence connected to the preclusion-of-repetition objective. | No reliability, safety, or recurrence-free claim is calculated. |
| `FFCA-CHANGE-01` | S1 Criteria III and VI | A declared related change can retain a change reference and propagation-review reference. | Technical change approval and change-control adequacy remain external. |
| `FFCA-CLOSURE-01` | S1 Criteria XVI and XVII | Records and review evidence can support closure readiness. | The engine returns no closed/accepted/released disposition. |

The implementation derives only reference-presence states from these bounded rows. It does not
reproduce source language or turn any source into a generally applicable quality doctrine.

## 3. RAG and source boundary

- RAG may locate candidate source material outside this engine, but it is not a verdict source,
  rule compiler input, or closure authority.
- This package has no RAG client and no model invocation. It cannot replace a missing binding
  with retrieved prose.
- Exact project evidence, source bodies, product data, lot/asset details, and actual change or
  disposition records remain in the project worksite. Public inputs carry opaque references only.

## 4. Required project binding before use

A project-level caller must provide, outside this packet:

1. exact source revisions and access status;
2. explicit applicability and precedence/tailoring facts per evidence row;
3. the responsible human/organization and delegated authority for each actual decision;
4. exact evidence links for configuration, test, affected lot, affected asset, and observation
   receipt; and
5. any required external reporting, quality-disposition, technical-change, release, or closure
   decision through its owning process.

An absent or unresolved item is `unknown` or `missing` only according to the supplied
observation state. It is never converted into noncompliance, product release, or an automatic
task.

## 5. Known holds and Owner decisions

| Hold | Reason / next required authority |
| --- | --- |
| Project applicability | Owner must bind the exact project, jurisdiction, contract, standard, and tailoring/precedence. |
| FDA/QMSR clause mapping | Requires separately authorized access and review of protected incorporated material; this package does not request or perform it. |
| Quality disposition | Must be taken by the qualified external disposition owner; no engine input or output may substitute for it. |
| Technical change approval | Must remain in the controlled configuration/change authority; FFCA only preserves related-change and propagation-review links. |
| Final closure | Requires a human external decision; FFCA exposes only readiness evidence. |

## 6. Source receipt and claim boundary

Direct official-source verification was performed on 2026-08-26 for the three URLs above. The
result is a public-source inventory and narrow implementation candidate, not a certification,
quality-system adoption, regulatory opinion, or canon promotion. The source-supported ceiling is
the maximum allowed claim for this package.
