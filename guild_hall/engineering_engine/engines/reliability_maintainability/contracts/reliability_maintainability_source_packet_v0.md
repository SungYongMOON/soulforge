# Reliability and Maintainability Source Packet v0

- `mission_id`: `E06-RM-source-packet-v0`
- `role`: `reliability_maintainability_researcher`
- `output_state`: `draft_source_packet`
- `status`: `DRAFT`
- `canon_claim_ceiling`: `source_supported` at most
- `applicability_approval`: `false`
- `compliance_approval`: `false`
- `product_acceptance`: `false`
- `source_adoption`: `false`
- `implementation_scope`: public-safe candidate rule metadata only
- `direct_source_verification_date`: `2026-08-26`

This packet is a small, public-safe implementation input for the Reliability and
Maintainability (R&M) Domain Engine. It preserves source modality, source scope, and
the difference between R&M evidence readiness and Quality evidence. It does not make a
project subject to NASA or GSFC material, set a reliability target, accept a failure
closure, calculate a product metric, approve a spare, or authorize a repair.

## ASSUMPTIONS

1. No project contract, program plan, customer standard, accepted metric threshold,
   authority delegation, FMECA, test record, or support record was supplied.
2. The two official NASA public documents below are sufficient only for a bounded,
   source-supported candidate taxonomy. They are not a complete R&M, logistics, or
   supportability corpus.
3. A project-specific Profile or Binding must establish applicability, selected
   method, quantitative threshold, revision pin, and approval route before an R&M
   result can become anything other than `UNKNOWN/HOLD`.

## 1. Source authority, revision, access, and applicability inventory

| source_ref | exact document | authority / revision | observed status and access | official direct refs | bounded use in this packet | project applicability |
| --- | --- | --- | --- | --- | --- | --- |
| `S1-NASA-STD-8729.1A` | `NASA-STD-8729.1A`, *Reliability and Maintainability (R&M) Standard for Spaceflight and Support Systems* | NASA Office of Safety and Mission Assurance; Version `A`, Change `0`, document date `2017-06-13` | NASA Technical Standards System displayed `ACTIVE` and `Internet Public` on `2026-08-26`. | Metadata: <https://standards.nasa.gov/standard/nasa/nasa-std-87291>; body: <https://standards.nasa.gov/sites/default/files/standards/NASA/A/0/nasa-std-87291a.pdf> | R&M objectives, reliability modeling/prediction/allocation, FMECA, MTBF/MTTF/MTTR/MDT and availability definitions, maintainability modeling/demonstration, logistics support, spares, and closed-loop failure reporting. | NASA spaceflight/support-system scope only. A non-NASA project remains `UNKNOWN/HOLD` until its exact binding proves invocation, scope, tailoring, and authority. Even in scope, the selected method and target remain project facts. |
| `S2-GSFC-HDBK-8004` | `GSFC-HDBK-8004`, *Guideline For Failure Modes and Effects Analysis and Risk Assessment* | NASA Goddard Space Flight Center; Version `Baseline`, Change `0`, document date `2024-08-20` | NASA Technical Standards System displayed `ACTIVE`, `Internet Public`, `Not a NASA Mandatory Standard`, and next review `2029-08-20` on `2026-08-26`. | Metadata: <https://standards.nasa.gov/standard/GSFC/GSFC-HDBK-8004>; body: <https://standards.nasa.gov/sites/default/files/standards/GSFC/Baseline/0/GSFC-HDBK-8004_Approved_0.pdf> | FMECA as a living risk assessment, design/change/update linkage, failure mode/effect/mitigation traceability, and retention of unresolved closure gaps. | The handbook describes a GSFC baseline approach and may be cited for technical guidance. It creates no obligation for another organization unless that organization’s exact binding says so. |

### Revision and retrieval policy

1. A future run must bind the exact source metadata revision and exact body revision
   separately; `latest`, a dashboard label, and a RAG answer are not revisions.
2. A changed status, access class, version, change number, or body replacement means
   a new candidate source binding. It never silently changes this packet.
3. If official metadata or the selected body cannot be resolved at binding time, the
   affected rule is `UNKNOWN/HOLD`. Cached prose is not a fallback authority.
4. This packet stores short paraphrases and locators only. It stores no source body,
   controlled standard body, private project source, RAG chunk, credential, or raw
   transcript.

## 2. Source-direct derivation

The following candidates retain the source’s objective/guidance modality. A candidate
does not become a mandatory project rule merely because its source is public or active.

| rule_candidate | source / locator | source modality preserved | bounded R&M question | required project facts before an evidence result can resolve |
| --- | --- | --- | --- | --- |
| `RM-REL-01` | `S1`, §5.1.2(b); Appendix C, *Reliability Modeling (Prediction/Allocation)*, p. 37 | NASA R&M planning requirement/objective plus a method called for under stated circumstances; allocation/modeling is not an automatic universal calculation. | Is an exact reliability requirement linked to a pinned allocation/prediction/model evidence record? | `reliability_requirement_ref`, `reliability_model_ref`, `model_scope_ref`, `model_revision_ref`, `allocation_or_prediction_basis_ref` |
| `RM-FMECA-02` | `S1`, Appendix C, *FMEA/FMECA*, pp. 34–35; `S2`, §§1.1–1.2, 4.4 | S1 identifies FMECA as a systematic analysis; S2 is GSFC technical guidance for a living, updateable FMECA. Neither source lets this engine assign criticality or accept mitigation. | Is a bound FMECA traceable to the relevant configuration/change and failure-mode/effect/mitigation evidence? | `fmeca_ref`, `fmeca_scope_ref`, `configuration_baseline_ref`, `failure_mode_trace_ref`, `criticality_method_ref`, `update_trigger_ref` |
| `RM-MET-03` | `S1`, §3.2, pp. 7–10; Appendix C, *Maintainability Modeling*, p. 40 | Defined R&M metric terms and a method for estimating repair-time requirements; no source-independent target or data-quality threshold is supplied. | Are failure/repair metrics labelled with exact definitions, time basis, data cutoff, and calculation/model evidence? | `metric_definition_ref`, `metric_data_ref`, `metric_cutoff_ref`, `metric_time_basis_ref`, `metric_calculation_or_model_ref` |
| `RM-MDEMO-04` | `S1`, Appendix C, *Maintainability Demonstration*, p. 49 | Formal repair simulations are a method for verifying designated maintainability characteristics for stated equipment/circumstances. | Where a demonstration is bound, are its plan, procedure/simulation, result, and requirement comparison present? | `maintainability_requirement_ref`, `maintainability_demo_plan_ref`, `maintainability_demo_procedure_ref`, `maintainability_demo_result_ref`, `requirement_comparison_ref` |
| `RM-SUP-05` | `S1`, §3.2, pp. 7–13; Appendix C, *Logistics Support Analysis/Plan*, p. 40 | Definitions link spares/support equipment/sustainment to R&M; the logistics analysis is a supportability/readiness method, not a purchase or provisioning authority. | Where supportability is bound, is an exact support analysis tied to spares, support equipment, personnel/procedures, and the operational concept? | `maintenance_concept_ref`, `logistics_support_analysis_ref`, `spares_analysis_ref`, `support_equipment_ref`, `support_resource_basis_ref` |
| `RM-AVL-06` | `S1`, §3.2, pp. 7–8; Appendix C, *Availability Analysis*, p. 33 | S1 distinguishes inherent and operational availability, including their different repair/logistics inputs. It does not authorize a target or let the engine invent a formula/unit convention. | Is an availability claim explicitly classified as `Ai` or `Ao` and linked to a pinned requirement, metric basis, and result/model? | `availability_requirement_ref`, `availability_kind_ref`, `availability_model_or_calculation_ref`, `availability_input_basis_ref`, `availability_result_ref` |
| `RM-CLS-07` | `S1`, §5.2 and Appendix C, *Problem Failure Reporting*, p. 49; `S2`, §§4.4–4.4.1 | Both sources support traceable update/analysis of failures and related evidence. They do not give this engine closure, risk acceptance, waiver, repair, or release authority. | Is a reported failure/repair/control gap connected to a current FMECA/reliability record, an action/verification record, and an independent authorized closure decision? | `failure_or_anomaly_ref`, `fmeca_update_ref`, `corrective_or_control_action_ref`, `verification_evidence_ref`, `closure_authority_ref` |

## 3. R&M and Quality separation

This engine owns R&M domain semantics: reliability modeling/allocation evidence, FMECA
linkage, R&M metric definition and basis, maintainability evidence, supportability/spares
evidence, availability classification, and a failure-to-closure trace gap.

It does **not** own Quality evidence sufficiency, manufacturing/workmanship acceptance,
nonconformance disposition, MRB approval, release, inspection acceptance, compliance, or
quality-system effectiveness. A Quality Readiness result cannot satisfy an R&M rule, and an
R&M result cannot satisfy a Quality Readiness rule. Both may reference the same exact project
fact only if the binding proves its separate semantic role.

## 4. RAG and source boundary

RAG, search, an LLM, a source index, and a retrieved summary may suggest a source locator.
They cannot:

- establish a source revision, applicability, threshold, authority, metric calculation, or
  evidence result;
- add a rule or modify this ruleset;
- turn a source-native record into a Quality artifact token;
- issue a closure, release, repair, procurement, or project decision.

Only an exact bound source/Project Binding can make the candidate rule executable. The
deterministic evaluator accepts only typed public-safe references and declared state; it never
reads source bodies, invokes retrieval, or performs a network/filesystem/ERP/task/approval
effect.

## 5. Evidence-sift register

| evidence bucket | bounded conclusion |
| --- | --- |
| confirmed / source-supported | The two named official NASA sources, their observed revisions/status/access classes, and their limited R&M/FMECA subject matter are directly supported by the official metadata/body pages named above. |
| source-supported candidate | The seven candidate questions preserve source modality and can be represented as deterministic evidence-readiness rules. |
| observed but not authority | The source packet’s local checksum, fixture output, replay digest, and test result are implementation evidence only; none establishes an R&M method’s project applicability or compliance. |
| missing / `UNKNOWN/HOLD` | Every project’s invocation, scope, tailoring, thresholds, metric units, accepted methods, source revisions, actual failure/repair values, authority delegation, closure acceptance, supply choice, and actual availability remains unresolved. |
| intentionally excluded | Paid/controlled standards, private project/customer material, source PDFs as payload, raw RAG results, and any contractual or quality-acceptance doctrine. |

## 6. Stop conditions and owner decisions

Stop an affected candidate at `UNKNOWN/HOLD` when official revision/access is unresolved,
the selected source is not bound to the project, source applicability/authority conflicts,
the metric time basis or method is missing, a target must be invented, a paid/private body is
needed, or a requested outcome would amount to product acceptance, repair authorization,
release, procurement, or risk closure.

Before a project use, the Human Owner (or the project’s explicitly bound authority) must decide:

1. the exact project/organization profile and source invocation/tailoring;
2. the authoritative reliability, maintainability, availability, and supportability targets;
3. the accepted FMECA criticality method and configuration/change baseline;
4. the metric definitions, unit/time windows, data cutoffs, and source revision pins;
5. the authority route for failure-control verification, closure, repair, spares, and release.

## 7. Implementation acceptance boundary

A candidate implementation is suitable for review only when it:

1. reuses the existing Core Domain Adapter Interface without changing Core;
2. preserves the two-source inventory, source modality, and project applicability gate;
3. emits only `satisfied`, `gap_missing`, `gap_unknown`, `gap_conflict`, or
   `not_applicable` evidence-readiness results, plus bounded reason codes;
4. refuses raw/project/private/secret payloads and external effects;
5. proves public-synthetic positive, hostile, replay/digest, zero-write, and
   R&M-vs-Quality boundary cases; and
6. claims `source_supported` at most and never claims compliance, product acceptance,
   project closure, production activation, or source adoption.
